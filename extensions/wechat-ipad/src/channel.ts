import { join } from "node:path";
import type {
  ChannelAccountSnapshot,
  ChannelDock,
  ChannelGatewayContext,
  ChannelPlugin,
  OpenClawConfig,
} from "openclaw/plugin-sdk/wechat-ipad";
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  requireNodeSqlite,
  setAccountEnabledInConfigSection,
} from "openclaw/plugin-sdk/wechat-ipad";
import {
  checkLoginQr,
  enableAutoHeartbeat,
  fetchBotProfileViaApi,
  requestLoginQr,
  submitVerificationCode,
} from "./api/api.js";
import {
  listWechatIpadAccountIds,
  resolveDefaultWechatIpadAccountId,
  resolveWechatIpadAccount,
} from "./config/accounts.js";
import { WechatIpadConfigSchema } from "./config/config-schema.js";
import { handleWechatIpadInboundMessage } from "./inbound/inbound.js";
import { createWechatIpadPoller } from "./inbound/polling.js";
import { registerWechatIpadWebhookTarget } from "./inbound/webhook.js";
import { createWechatIpadMessageStore } from "./infra/message-store.js";
import { probeWechatIpad } from "./infra/probe.js";
import {
  clearWechatIpadLoginSession,
  clearWechatIpadMessageStore,
  clearWechatIpadPoller,
  clearWechatIpadWebhookRegistration,
  getWechatIpadBotProfile,
  getWechatIpadLoginSession,
  getWechatIpadRuntime,
  resolveWechatIpadRuntimeWxid,
  setWechatIpadBotProfile,
  setWechatIpadLoginSession,
  setWechatIpadMessageStore,
  setWechatIpadPoller,
  setWechatIpadWebhookRegistration,
} from "./infra/runtime.js";
import { collectWechatIpadStatusIssues } from "./infra/status-issues.js";
import {
  normalizeWechatIpadTarget,
  sendWechatIpadEmoji,
  sendWechatIpadFile,
  sendWechatIpadLinkCard,
  sendWechatIpadMedia,
  sendWechatIpadText,
  sendWechatIpadVoice,
  forwardWechatIpadCdn,
} from "./outbound/send.js";
import type {
  ResolvedWechatIpadAccount,
  WechatIpadBotProfile,
  WechatIpadChannelData,
  WechatIpadLoginSession,
  WechatIpadLoginType,
} from "./types.js";

const meta = {
  id: "wechat-ipad",
  label: "WeChat iPad",
  selectionLabel: "WeChat iPad（HTTP 桥接）",
  docsPath: "/channels/wechat-ipad",
  docsLabel: "wechat-ipad",
  blurb: "通过外部 HTTP API 桥接 WeChat iPad 协议。",
  aliases: ["wxipad", "wechatipad"],
  order: 86,
  quickstartAllowFrom: true,
};

function readStringField(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveLoginType(
  cfg: OpenClawConfig,
  accountId?: string,
  loginTypeOverride?: string,
): WechatIpadLoginType {
  const override = loginTypeOverride?.trim().toLowerCase();
  if (override === "win" || override === "mac" || override === "car" || override === "ipad") {
    return override;
  }

  const account = resolveWechatIpadAccount({ cfg, accountId });
  const raw = account.config.loginType?.trim().toLowerCase();
  if (raw === "win" || raw === "mac" || raw === "car" || raw === "ipad") {
    return raw;
  }
  return "ipad";
}

function toDataUrl(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  if (value.startsWith("data:")) {
    return value;
  }
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value)) {
    const normalized = value.replace(/\s+/g, "");
    if (normalized) {
      return `data:image/png;base64,${normalized}`;
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type LoginWaitResult = {
  connected: boolean;
  message: string;
  requiresVerification: boolean;
  ticket?: string;
  wxid?: string;
};

function resolveSession(accountId?: string): WechatIpadLoginSession | null {
  return getWechatIpadLoginSession(normalizeAccountId(accountId));
}

async function persistResolvedWxid(params: {
  cfg: OpenClawConfig;
  accountId: string;
  wxid: string;
}): Promise<void> {
  const runtime = getWechatIpadRuntime();
  const { cfg, accountId, wxid } = params;
  const normalizedWxid = wxid.trim();
  if (!normalizedWxid) {
    return;
  }

  const existing = resolveWechatIpadAccount({ cfg, accountId });
  if (existing.config.wxid?.trim() === normalizedWxid) {
    return;
  }

  const channelCfg = cfg.channels?.["wechat-ipad"] ?? {};
  const currentAccounts = channelCfg.accounts ?? {};
  let next: OpenClawConfig;

  next = {
    ...cfg,
    channels: {
      ...cfg.channels,
      "wechat-ipad": {
        ...channelCfg,
        accounts: {
          ...currentAccounts,
          [accountId]: {
            ...(currentAccounts[accountId] ?? {}),
            wxid: normalizedWxid,
          },
        },
      },
    },
  };

  await runtime.config.writeConfigFile(next);
}

export async function submitWechatIpadVerificationGatewayMethod(input: {
  accountId?: string;
  params?: unknown;
}): Promise<{ ok: boolean; message: string }> {
  const runtime = getWechatIpadRuntime();
  const cfg = runtime.config.loadConfig() as OpenClawConfig;
  const resolvedAccountId = normalizeAccountId(input.accountId);
  const account = resolveWechatIpadAccount({ cfg, accountId: resolvedAccountId });
  const session = resolveSession(resolvedAccountId);

  if (!session) {
    throw new Error("当前没有活动扫码会话，请先点击 Show QR。");
  }

  const code = readStringField(input.params, "code");
  if (!code) {
    throw new Error("验证码不能为空。");
  }

  const ticket = readStringField(input.params, "ticket") ?? session.ticket;
  if (!ticket) {
    throw new Error("缺少 ticket，请先等待返回安全校验提示。");
  }

  if (!session.data62) {
    throw new Error("缺少 Data62，请重新生成二维码后重试。");
  }

  const verifyResult = await submitVerificationCode({
    options: {
      baseUrl: account.baseUrl,
      apiToken: account.apiToken,
      robotId: account.robotId,
    },
    request: {
      uuid: session.uuid,
      data62: session.data62,
      code,
      ticket,
    },
  });

  setWechatIpadLoginSession({
    ...session,
    ticket,
  });

  return {
    ok: verifyResult.success,
    message: verifyResult.message,
  };
}

/**
 * 独立的 gateway 方法：发起 wechat-ipad 扫码登录。
 * 通过 api.registerGatewayMethod("wechat-ipad.login.start", handler) 注册，
 * 绕过核心 web.login.start 的单 provider 限制。
 */
export async function startWechatIpadLoginGatewayMethod(input: {
  accountId?: string;
  force?: boolean;
  timeoutMs?: number;
  verbose?: boolean;
  loginType?: string;
}): Promise<{ qrDataUrl?: string; message: string; data62?: string }> {
  const loginTypeOverride = input.loginType as "ipad" | "win" | "mac" | "car" | undefined;
  return wechatIpadPlugin.gateway!.loginWithQrStart!({
    accountId: input.accountId,
    force: input.force,
    timeoutMs: input.timeoutMs,
    verbose: input.verbose,
    loginType: loginTypeOverride,
  });
}

/**
 * 独立的 gateway 方法：等待 wechat-ipad 扫码结果。
 */
export async function waitWechatIpadLoginGatewayMethod(input: {
  accountId?: string;
  timeoutMs?: number;
}): Promise<{
  connected: boolean;
  message: string;
  requiresVerification?: boolean;
  ticket?: string;
  data62?: string;
  wxid?: string;
}> {
  return wechatIpadPlugin.gateway!.loginWithQrWait!({
    accountId: input.accountId,
    timeoutMs: input.timeoutMs,
  });
}

async function waitForLoginUntil(params: {
  account: ResolvedWechatIpadAccount;
  cfg: OpenClawConfig;
  accountId: string;
  expectedUuid: string;
  timeoutMs: number;
  loginType: WechatIpadLoginType;
  keepSessionOnSuccess?: boolean;
}): Promise<LoginWaitResult> {
  const { account, cfg, accountId, expectedUuid, timeoutMs, loginType } = params;
  const deadline = Date.now() + timeoutMs;
  const rawConfigWxid = account.config.wxid?.trim();

  while (Date.now() < deadline) {
    const currentSession = getWechatIpadLoginSession(accountId);
    if (!currentSession || currentSession.uuid !== expectedUuid) {
      return {
        connected: false,
        message: "wechat-ipad 登录会话已过期，请重新发起扫码。",
        requiresVerification: false,
      };
    }

    const checked = await checkLoginQr({
      options: {
        baseUrl: account.baseUrl,
        apiToken: account.apiToken,
        robotId: account.robotId,
      },
      session: currentSession,
    });

    if (checked.connected) {
      const resolvedWxid = checked.wxid?.trim() || rawConfigWxid;
      if (!resolvedWxid) {
        return {
          connected: false,
          message: "扫码成功，但未返回 wxid；请在通道配置中填写 wxid 后重试。",
          requiresVerification: false,
        };
      }

      if (!rawConfigWxid && checked.wxid?.trim()) {
        await persistResolvedWxid({
          cfg,
          accountId,
          wxid: resolvedWxid,
        });
      }

      await enableAutoHeartbeat({
        options: {
          baseUrl: account.baseUrl,
          apiToken: account.apiToken,
          robotId: account.robotId,
        },
        wxid: resolvedWxid,
      }).catch(() => undefined);

      // 登录成功后异步预热 bot profile 缓存
      fetchBotProfileViaApi({
        options: {
          baseUrl: account.baseUrl,
          apiToken: account.apiToken,
          robotId: account.robotId,
        },
        wxid: resolvedWxid,
      })
        .then((profile) => setWechatIpadBotProfile(accountId, profile))
        .catch(() => undefined);

      const nextSession: WechatIpadLoginSession = {
        uuid: expectedUuid,
        accountId,
        startedAt: currentSession.startedAt,
        expiresAt: currentSession.expiresAt,
        loginType,
        deviceId: currentSession.deviceId,
        data62: currentSession.data62,
        ticket: currentSession.ticket,
        wxid: resolvedWxid,
        nickname: checked.nickname,
        connectedAt: Date.now(),
      };
      setWechatIpadLoginSession(nextSession);
      if (!params.keepSessionOnSuccess) {
        clearWechatIpadLoginSession(accountId);
      }
      return {
        connected: true,
        message: checked.nickname ? `扫码登录成功：${checked.nickname}` : "扫码登录成功。",
        requiresVerification: false,
        wxid: resolvedWxid,
      };
    }

    if (checked.requiresVerification) {
      const nextSession: WechatIpadLoginSession = {
        ...currentSession,
        ticket: checked.ticket,
      };
      setWechatIpadLoginSession(nextSession);
      return {
        connected: false,
        message: "检测到安全校验，请填写验证码后继续。",
        requiresVerification: true,
        ticket: checked.ticket,
      };
    }

    if (
      checked.status === 4 ||
      (typeof checked.expiredTime === "number" && checked.expiredTime < 10)
    ) {
      return {
        connected: false,
        message: "二维码已过期，请重新发起扫码。",
        requiresVerification: false,
      };
    }

    await sleep(1500);
  }

  return {
    connected: false,
    message: "等待扫码超时，请稍后重试或在 UI 中继续等待。",
    requiresVerification: false,
  };
}

/**
 * 适配 Dock：声明该渠道能力和基础配置行为。
 */
export const wechatIpadDock: ChannelDock = {
  id: "wechat-ipad",
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    blockStreaming: true,
  },
  outbound: { textChunkLimit: 1800 },
  config: {
    resolveAllowFrom: ({ cfg, accountId }) =>
      resolveWechatIpadAccount({ cfg: cfg as OpenClawConfig, accountId }).config.allowFrom ?? [],
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(wechat-ipad|wechat|wx):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId }) => {
      const account = resolveWechatIpadAccount({ cfg: cfg as OpenClawConfig, accountId });
      return account.config.requireMention ?? true;
    },
  },
  threading: {
    resolveReplyToMode: () => "first",
  },
};

/**
 * wechat-ipad 插件主体：MVP 支持 HTTP + polling。
 */
export const wechatIpadPlugin: ChannelPlugin<ResolvedWechatIpadAccount> = {
  id: "wechat-ipad",
  meta,
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.wechat-ipad"] },
  gatewayMethods: [
    "wechat-ipad.login.start",
    "wechat-ipad.login.wait",
    "wechat-ipad.login.submitVerificationCode",
  ],
  configSchema: buildChannelConfigSchema(WechatIpadConfigSchema),
  config: {
    listAccountIds: (cfg) => listWechatIpadAccountIds(cfg as OpenClawConfig),
    resolveAccount: (cfg, accountId) =>
      resolveWechatIpadAccount({ cfg: cfg as OpenClawConfig, accountId }),
    defaultAccountId: (cfg) =>
      resolveDefaultWechatIpadAccountId(cfg as OpenClawConfig) ?? DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as OpenClawConfig,
        sectionKey: "wechat-ipad",
        accountId,
        enabled,
        allowTopLevel: false,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as OpenClawConfig,
        sectionKey: "wechat-ipad",
        accountId,
      }),
    isConfigured: (account) => Boolean(account.baseUrl?.trim()),
    unconfiguredReason: (account) =>
      account.baseUrl?.trim()
        ? `请先为账户 ${account.accountId} 扫码登录获取 wxid，或手动填写 channels.wechat-ipad.accounts.${account.accountId}.wxid。`
        : `缺少 channels.wechat-ipad.accounts.${account.accountId}.baseUrl。`,
    describeAccount: (account): ChannelAccountSnapshot => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.baseUrl?.trim()),
      tokenSource: account.tokenSource,
      baseUrl: account.baseUrl,
      mode: account.inbound.mode,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      resolveWechatIpadAccount({ cfg: cfg as OpenClawConfig, accountId }).config.allowFrom ?? [],
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(wechat-ipad|wechat|wx):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as OpenClawConfig,
        channelKey: "wechat-ipad",
        accountId,
        name,
        alwaysUseAccounts: true,
      }),
    validateInput: () => null,
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const next = applyAccountNameToChannelSection({
        cfg: cfg as OpenClawConfig,
        channelKey: "wechat-ipad",
        accountId,
        name: input.name,
        alwaysUseAccounts: true,
      });

      return {
        ...next,
        channels: {
          ...next.channels,
          "wechat-ipad": {
            ...next.channels?.["wechat-ipad"],
            enabled: true,
            accounts: {
              ...(next.channels?.["wechat-ipad"]?.accounts ?? {}),
              [accountId]: {
                ...(next.channels?.["wechat-ipad"]?.accounts?.[accountId] ?? {}),
                enabled: true,
                ...(input.useEnv
                  ? {}
                  : input.tokenFile
                    ? { tokenFile: input.tokenFile, apiToken: undefined }
                    : input.token
                      ? { apiToken: input.token, tokenFile: undefined }
                      : {}),
                ...(readStringField(input, "baseUrl")
                  ? { baseUrl: readStringField(input, "baseUrl") }
                  : {}),
                ...(readStringField(input, "robotId")
                  ? { robotId: readStringField(input, "robotId") }
                  : {}),
              },
            },
          },
        },
      } as OpenClawConfig;
    },
  },
  security: {
    resolveDmPolicy: ({ accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const basePath = `channels.wechat-ipad.accounts.${resolvedAccountId}.`;
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: `${basePath}allowFrom`,
        approveHint: formatPairingApproveHint("wechat-ipad"),
        normalizeEntry: (raw) => raw.replace(/^(wechat-ipad|wechat|wx):/i, ""),
      };
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId }) => {
      const account = resolveWechatIpadAccount({ cfg: cfg as OpenClawConfig, accountId });
      return account.config.requireMention ?? true;
    },
  },
  threading: {
    resolveReplyToMode: () => "first",
  },
  pairing: {
    idLabel: "wechatIpadUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(wechat-ipad|wechat|wx):/i, ""),
    notifyApproval: async ({ cfg, id, runtime }) => {
      const accountId =
        typeof runtime?.flags?.accountId === "string" && runtime.flags.accountId.trim()
          ? runtime.flags.accountId.trim()
          : undefined;
      const account = resolveWechatIpadAccount({
        cfg: cfg as OpenClawConfig,
        accountId,
      });
      const sendResult = await sendWechatIpadText(id, PAIRING_APPROVED_MESSAGE, {
        accountId: account.accountId,
        baseUrl: account.baseUrl,
        apiToken: account.apiToken,
        robotId: account.robotId,
        cfg: cfg as OpenClawConfig,
      });
      if (!sendResult.ok) {
        throw new Error(sendResult.error ?? "wechat-ipad 通知审批失败");
      }
    },
  },
  messaging: {
    normalizeTarget: normalizeWechatIpadTarget,
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        return /^wxid_[a-z0-9]+$/i.test(trimmed) || /@chatroom$/i.test(trimmed);
      },
      hint: "<wxid|群聊ID>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: null,
    textChunkLimit: 1800,
    sendPayload: async ({ to, payload, accountId, cfg, replyToId }) => {
      const wechatIpadData =
        (payload.channelData?.["wechat-ipad"] as WechatIpadChannelData | undefined) ?? {};

      // 表情消息路由
      if (wechatIpadData.emoji) {
        const result = await sendWechatIpadEmoji(to, wechatIpadData.emoji, {
          accountId: accountId ?? undefined,
          cfg: cfg as OpenClawConfig,
        });
        return {
          channel: "wechat-ipad",
          ok: result.ok,
          messageId: result.messageId ?? "",
          error: result.error ? new Error(result.error) : undefined,
        };
      }

      // CDN 媒体转发路由
      if (wechatIpadData.cdnForward) {
        const result = await forwardWechatIpadCdn(to, wechatIpadData.cdnForward, {
          accountId: accountId ?? undefined,
          cfg: cfg as OpenClawConfig,
        });
        return {
          channel: "wechat-ipad",
          ok: result.ok,
          messageId: result.messageId ?? "",
          error: result.error ? new Error(result.error) : undefined,
        };
      }

      // 链接卡片路由
      const linkCard = wechatIpadData.linkCard;
      if (!linkCard) {
        const text = payload.text ?? "";
        const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];
        if (mediaUrl) {
          // 语音消息路由
          if (payload.audioAsVoice === true) {
            const result = await sendWechatIpadVoice(to, mediaUrl, text, {
              accountId: accountId ?? undefined,
              cfg: cfg as OpenClawConfig,
            });
            return {
              channel: "wechat-ipad",
              ok: result.ok,
              messageId: result.messageId ?? "",
              error: result.error ? new Error(result.error) : undefined,
            };
          }
          const result = await sendWechatIpadMedia(to, mediaUrl, text, {
            accountId: accountId ?? undefined,
            cfg: cfg as OpenClawConfig,
          });
          return {
            channel: "wechat-ipad",
            ok: result.ok,
            messageId: result.messageId ?? "",
            error: result.error ? new Error(result.error) : undefined,
          };
        }
        const result = await sendWechatIpadText(to, text, {
          accountId: accountId ?? undefined,
          cfg: cfg as OpenClawConfig,
          replyToId: replyToId ?? payload.replyToId ?? undefined,
        });
        return {
          channel: "wechat-ipad",
          ok: result.ok,
          messageId: result.messageId ?? "",
          error: result.error ? new Error(result.error) : undefined,
        };
      }

      const result = await sendWechatIpadLinkCard(to, linkCard, {
        accountId: accountId ?? undefined,
        cfg: cfg as OpenClawConfig,
      });
      return {
        channel: "wechat-ipad",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
    sendText: async ({ to, text, accountId, cfg, replyToId }) => {
      const result = await sendWechatIpadText(to, text, {
        accountId: accountId ?? undefined,
        cfg: cfg as OpenClawConfig,
        replyToId: replyToId ?? undefined,
      });
      return {
        channel: "wechat-ipad",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, cfg }) => {
      if (!mediaUrl) {
        return {
          channel: "wechat-ipad",
          ok: false,
          messageId: "",
          error: new Error("mediaUrl 不能为空"),
        };
      }
      const result = await sendWechatIpadMedia(to, mediaUrl, text ?? "", {
        accountId: accountId ?? undefined,
        cfg: cfg as OpenClawConfig,
      });
      return {
        channel: "wechat-ipad",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
  },
  auth: {
    login: async ({ cfg, accountId, runtime, verbose }) => {
      const resolvedAccountId = normalizeAccountId(accountId);
      const account = resolveWechatIpadAccount({ cfg, accountId: resolvedAccountId });

      if (!account.baseUrl?.trim()) {
        throw new Error("wechat-ipad 登录需要配置 baseUrl");
      }

      const loginType = resolveLoginType(cfg, resolvedAccountId);
      const qr = await requestLoginQr({
        options: {
          baseUrl: account.baseUrl,
          apiToken: account.apiToken,
          robotId: account.robotId,
        },
        request: {
          loginType,
        },
      });

      setWechatIpadLoginSession({
        uuid: qr.uuid,
        accountId: resolvedAccountId,
        startedAt: Date.now(),
        loginType,
        deviceId: qr.deviceId,
        data62: qr.data62,
      });

      runtime.log(qr.message ?? "二维码已生成，请扫码。");
      if (qr.qrUrl) {
        runtime.log(`扫码链接: ${qr.qrUrl}`);
      }

      const result = await waitForLoginUntil({
        account,
        cfg,
        accountId: resolvedAccountId,
        expectedUuid: qr.uuid,
        timeoutMs: verbose ? 120000 : 60000,
        loginType,
      });

      runtime.log(result.message);
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: collectWechatIpadStatusIssues,
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      baseUrl: snapshot.baseUrl ?? null,
      mode: snapshot.mode ?? "polling",
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) =>
      probeWechatIpad(account.baseUrl, account.apiToken, account.robotId, timeoutMs),
    buildAccountSnapshot: ({ account, runtime }) => {
      const configured = Boolean(account.baseUrl?.trim());
      const loginReady = Boolean(account.config.wxid?.trim());
      const wxidHint = `wxid 未就绪，请先扫码登录或设置 channels.wechat-ipad.accounts.${account.accountId}.wxid`;
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        tokenSource: account.tokenSource,
        baseUrl: account.baseUrl,
        mode: account.inbound.mode,
        running: runtime?.running ?? false,
        connected: runtime?.connected ?? false,
        lastConnectedAt: runtime?.lastConnectedAt ?? null,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? (loginReady ? null : wxidHint),
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        dmPolicy: account.config.dmPolicy ?? "pairing",
      };
    },
  },
  gateway: {
    loginWithQrStart: async ({ accountId, loginType: loginTypeOverride }) => {
      const runtime = getWechatIpadRuntime();
      const cfg = runtime.config.loadConfig() as OpenClawConfig;
      const resolvedAccountId = normalizeAccountId(accountId);
      const account = resolveWechatIpadAccount({ cfg, accountId: resolvedAccountId });

      if (!account.baseUrl?.trim()) {
        throw new Error("wechat-ipad 登录需要配置 baseUrl");
      }

      const loginType = resolveLoginType(cfg, resolvedAccountId, loginTypeOverride);
      const qr = await requestLoginQr({
        options: {
          baseUrl: account.baseUrl,
          apiToken: account.apiToken,
          robotId: account.robotId,
        },
        request: {
          loginType,
        },
      });

      setWechatIpadLoginSession({
        uuid: qr.uuid,
        accountId: resolvedAccountId,
        startedAt: Date.now(),
        loginType,
        deviceId: qr.deviceId,
        data62: qr.data62,
      });

      return {
        qrDataUrl: toDataUrl(qr.qrDataUrl),
        message: qr.message ?? "二维码已生成，请扫码。",
        data62: qr.data62,
      };
    },
    loginWithQrWait: async ({ accountId, timeoutMs }) => {
      const runtime = getWechatIpadRuntime();
      const cfg = runtime.config.loadConfig() as OpenClawConfig;
      const resolvedAccountId = normalizeAccountId(accountId);
      const account = resolveWechatIpadAccount({ cfg, accountId: resolvedAccountId });
      const session = resolveSession(resolvedAccountId);
      if (!session) {
        return {
          connected: false,
          message: "当前没有活动扫码会话，请先点击 Show QR。",
        };
      }

      const loginResult = await waitForLoginUntil({
        account,
        cfg,
        accountId: resolvedAccountId,
        expectedUuid: session.uuid,
        timeoutMs: Math.max(2000, timeoutMs ?? 60000),
        loginType: session.loginType,
        keepSessionOnSuccess: true,
      });

      const latestSession = resolveSession(resolvedAccountId);
      if (loginResult.connected) {
        const resolvedWxid = loginResult.wxid ?? latestSession?.wxid;
        return {
          connected: true,
          message: resolvedWxid
            ? `${loginResult.message}（wxid: ${resolvedWxid}）`
            : loginResult.message,
          ...(resolvedWxid ? { wxid: resolvedWxid } : {}),
        };
      }

      if (!loginResult.requiresVerification) {
        return {
          connected: loginResult.connected,
          message: loginResult.message,
        };
      }

      if (!latestSession?.data62) {
        return {
          connected: false,
          message: "检测到安全校验，但缺少 Data62，请重新生成二维码后重试。",
        };
      }

      return {
        connected: false,
        message: loginResult.message,
        requiresVerification: true,
        ticket: latestSession.ticket ?? loginResult.ticket,
        data62: latestSession.data62,
      };
    },
    startAccount: async (ctx: ChannelGatewayContext<ResolvedWechatIpadAccount>) => {
      const { cfg, accountId, account, abortSignal, setStatus, getStatus } = ctx;

      if (!account.baseUrl?.trim()) {
        throw new Error("wechat-ipad 账号未配置 baseUrl");
      }

      const pluginRuntime = getWechatIpadRuntime();

      clearWechatIpadPoller(accountId);
      clearWechatIpadWebhookRegistration(accountId);
      clearWechatIpadMessageStore(accountId);

      // 初始化消息持久化存储（必须在 wxid 检查之前，以便从 DB 恢复 login session）
      const stateDir = pluginRuntime.state.resolveStateDir();
      const dbPath = join(stateDir, "workspace", "wechat-ipad-data", accountId, "messages.db");
      const retentionDays = account.config.messageRetentionDays ?? 0;
      const messageStore = createWechatIpadMessageStore({
        dbPath,
        requireNodeSqlite,
        retentionMs: retentionDays > 0 ? retentionDays * 24 * 60 * 60 * 1000 : 0,
        log: (message) => ctx.log?.info(message),
      });
      if (messageStore) {
        setWechatIpadMessageStore(accountId, messageStore);

        // 从 DB 恢复 bot profile 缓存
        try {
          const profileJson = messageStore.getMeta("bot_profile");
          if (profileJson && !getWechatIpadBotProfile(accountId)) {
            const profile = JSON.parse(profileJson) as WechatIpadBotProfile;
            setWechatIpadBotProfile(accountId, profile);
            ctx.log?.info(
              `wechat-ipad[${accountId}]: 已从数据库恢复 bot profile（${profile.nickname}）`,
            );
          }
        } catch {
          // 恢复失败不阻塞
        }

        // 从 DB 恢复 login session（在 wxid 检查之前，确保网关重启后能恢复 wxid）
        try {
          const sessionJson = messageStore.getMeta("login_session");
          if (sessionJson && !getWechatIpadLoginSession(accountId)) {
            const session = JSON.parse(sessionJson) as WechatIpadLoginSession;
            if (session.wxid) {
              setWechatIpadLoginSession(session);
              ctx.log?.info(
                `wechat-ipad[${accountId}]: 已从数据库恢复登录会话（wxid=${session.wxid}）`,
              );
            }
          }
        } catch {
          // 恢复失败不阻塞
        }
      }

      const wxid = resolveWechatIpadRuntimeWxid(accountId, account.config.wxid);

      if (!wxid) {
        setStatus({
          ...getStatus(),
          running: false,
          lastStartAt: Date.now(),
          lastError: "wxid 未就绪，请先扫码登录",
        });
        return null;
      }

      if (account.inbound.mode === "webhook") {
        if (account.inbound.webhook.authMode !== "none" && !account.inbound.webhook.secret.trim()) {
          setStatus({
            ...getStatus(),
            running: false,
            lastStartAt: Date.now(),
            lastError: "webhook 密钥未配置",
          });
          return null;
        }

        await enableAutoHeartbeat({
          options: {
            baseUrl: account.baseUrl,
            apiToken: account.apiToken,
            robotId: account.robotId,
          },
          wxid,
        }).catch(() => undefined);

        // 解析 webhook 路径（支持 {wxid} 占位符自动替换为扫码登录的 wxid）
        const resolvedWebhookPath = account.inbound.webhook.path.replace(/\{wxid\}/g, wxid);

        const unregister = registerWechatIpadWebhookTarget({
          accountId,
          account,
          cfg: cfg as OpenClawConfig,
          runtime: pluginRuntime,
          path: resolvedWebhookPath,
          secret: account.inbound.webhook.secret,
          authMode: account.inbound.webhook.authMode,
          wxid,
          statusSink: (patch) => {
            setStatus({
              ...getStatus(),
              running: true,
              ...(patch.lastInboundAt ? { lastInboundAt: patch.lastInboundAt } : {}),
              ...(Object.prototype.hasOwnProperty.call(patch, "lastError")
                ? { lastError: patch.lastError ?? null }
                : {}),
            });
          },
          log: (message) => {
            ctx.log?.info(message);
          },
        });

        ctx.log?.info(
          `wechat-ipad[${accountId}]: webhook 已启动（wxid=${wxid}，路由=${resolvedWebhookPath}）`,
        );
        setWechatIpadWebhookRegistration(accountId, { unregister });
        setStatus({
          ...getStatus(),
          running: true,
          connected: true,
          lastConnectedAt: Date.now(),
          lastStartAt: Date.now(),
          lastError: null,
        });

        return new Promise<void>((resolve) => {
          const cleanup = () => {
            clearWechatIpadWebhookRegistration(accountId);
            resolve();
          };

          if (abortSignal.aborted) {
            cleanup();
            return;
          }

          abortSignal.addEventListener("abort", cleanup, { once: true });
        });
      }

      const poller = createWechatIpadPoller({
        baseUrl: account.baseUrl,
        apiToken: account.apiToken,
        robotId: account.robotId,
        wxid,
        accountId,
        pollingConfig: account.inbound.polling,
        abortSignal,
        log: (message) => {
          ctx.log?.info(message);
        },
        onMessage: async (msg) => {
          try {
            await handleWechatIpadInboundMessage(msg, {
              cfg: cfg as OpenClawConfig,
              runtime: pluginRuntime,
              accountId,
              baseUrl: account.baseUrl,
              apiToken: account.apiToken,
              robotId: account.robotId,
              wxid,
              allowFrom: account.config.allowFrom,
              dmPolicy: account.config.dmPolicy,
              groupPolicy: account.config.groupPolicy,
              commandAllowFrom: account.config.commandAllowFrom,
              safetyPrefix: account.config.safetyPrefix,
              requireMention: account.config.requireMention,
              log: (message) => {
                ctx.log?.info(message);
              },
            });

            setStatus({
              ...getStatus(),
              running: true,
              lastInboundAt: Date.now(),
              lastError: null,
            });
          } catch (error) {
            setStatus({
              ...getStatus(),
              lastError: error instanceof Error ? error.message : String(error),
            });
          }
        },
        onError: (error) => {
          setStatus({
            ...getStatus(),
            lastError: error.message,
          });
        },
      });

      setWechatIpadPoller(accountId, poller);
      await poller.start();
      setStatus({
        ...getStatus(),
        running: true,
        connected: true,
        lastConnectedAt: Date.now(),
        lastStartAt: Date.now(),
        lastError: null,
      });

      return new Promise<void>((resolve) => {
        const cleanup = () => {
          clearWechatIpadPoller(accountId);
          resolve();
        };

        if (abortSignal.aborted) {
          cleanup();
          return;
        }

        abortSignal.addEventListener("abort", cleanup, { once: true });
      });
    },
    stopAccount: async (ctx: ChannelGatewayContext<ResolvedWechatIpadAccount>) => {
      const { accountId, setStatus, getStatus } = ctx;
      clearWechatIpadPoller(accountId);
      clearWechatIpadWebhookRegistration(accountId);
      clearWechatIpadMessageStore(accountId);
      setStatus({
        ...getStatus(),
        running: false,
        connected: false,
        lastStopAt: Date.now(),
      });
    },
    logoutAccount: async ({ accountId }) => {
      const resolvedAccountId = normalizeAccountId(accountId);
      clearWechatIpadPoller(resolvedAccountId);
      clearWechatIpadWebhookRegistration(resolvedAccountId);
      clearWechatIpadMessageStore(resolvedAccountId);
      clearWechatIpadLoginSession(resolvedAccountId);
      return {
        loggedOut: true,
        cleared: true,
      };
    },
  },
};
