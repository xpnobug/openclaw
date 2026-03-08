import type {
  ChannelAccountSnapshot,
  ChannelDock,
  ChannelGatewayContext,
  ChannelPlugin,
  OpenClawConfig,
} from "openclaw/plugin-sdk";
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
} from "openclaw/plugin-sdk";
import {
  listWechatIpadAccountIds,
  resolveDefaultWechatIpadAccountId,
  resolveWechatIpadAccount,
} from "./accounts.js";
import {
  checkLoginQr,
  enableAutoHeartbeat,
  requestLoginQr,
  submitVerificationCode,
} from "./api.js";
import { WechatIpadConfigSchema } from "./config-schema.js";
import { handleWechatIpadInboundMessage } from "./inbound.js";
import { createWechatIpadPoller } from "./polling.js";
import { probeWechatIpad } from "./probe.js";
import {
  clearWechatIpadLoginSession,
  clearWechatIpadPoller,
  getWechatIpadLoginSession,
  getWechatIpadRuntime,
  setWechatIpadLoginSession,
  setWechatIpadPoller,
} from "./runtime.js";
import { normalizeWechatIpadTarget, sendWechatIpadMedia, sendWechatIpadText } from "./send.js";
import { collectWechatIpadStatusIssues } from "./status-issues.js";
import type {
  ResolvedWechatIpadAccount,
  WechatIpadLoginSession,
  WechatIpadLoginType,
} from "./types.js";

const meta = {
  id: "wechat-ipad",
  label: "WeChat iPad",
  selectionLabel: "WeChat iPad (HTTP bridge)",
  docsPath: "/channels/wechat-ipad",
  docsLabel: "wechat-ipad",
  blurb: "WeChat iPad bridge via external HTTP API.",
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

  if (accountId === DEFAULT_ACCOUNT_ID) {
    next = {
      ...cfg,
      channels: {
        ...cfg.channels,
        "wechat-ipad": {
          ...channelCfg,
          wxid: normalizedWxid,
        },
      },
    };
  } else {
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
  }

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
    resolveReplyToMode: () => "off",
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
  gatewayMethods: ["web.login.start", "web.login.wait", "wechat-ipad.login.submitVerificationCode"],
  configSchema: buildChannelConfigSchema(WechatIpadConfigSchema),
  config: {
    listAccountIds: (cfg) => listWechatIpadAccountIds(cfg as OpenClawConfig),
    resolveAccount: (cfg, accountId) =>
      resolveWechatIpadAccount({ cfg: cfg as OpenClawConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultWechatIpadAccountId(cfg as OpenClawConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as OpenClawConfig,
        sectionKey: "wechat-ipad",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as OpenClawConfig,
        sectionKey: "wechat-ipad",
        accountId,
        clearBaseFields: ["apiToken", "tokenFile", "name", "baseUrl", "robotId"],
      }),
    isConfigured: (account) => Boolean(account.baseUrl?.trim()),
    unconfiguredReason: (account) =>
      account.baseUrl?.trim()
        ? account.accountId === DEFAULT_ACCOUNT_ID
          ? "请先扫码登录获取 wxid，或手动填写 channels.wechat-ipad.wxid。"
          : `请先为账户 ${account.accountId} 扫码登录获取 wxid，或手动填写 channels.wechat-ipad.accounts.${account.accountId}.wxid。`
        : "缺少 baseUrl。",
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
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "WECHAT_IPAD_API_TOKEN can only be used for the default account.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg as OpenClawConfig,
        channelKey: "wechat-ipad",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "wechat-ipad",
            })
          : namedConfig;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            "wechat-ipad": {
              ...next.channels?.["wechat-ipad"],
              enabled: true,
              ...(input.useEnv
                ? {}
                : input.tokenFile
                  ? { tokenFile: input.tokenFile }
                  : input.token
                    ? { apiToken: input.token }
                    : {}),
              ...(readStringField(input, "baseUrl")
                ? { baseUrl: readStringField(input, "baseUrl") }
                : {}),
              ...(readStringField(input, "robotId")
                ? { robotId: readStringField(input, "robotId") }
                : {}),
            },
          },
        } as OpenClawConfig;
      }

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
                ...(input.tokenFile
                  ? { tokenFile: input.tokenFile }
                  : input.token
                    ? { apiToken: input.token }
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
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        (cfg as OpenClawConfig).channels?.["wechat-ipad"]?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.wechat-ipad.accounts.${resolvedAccountId}.`
        : "channels.wechat-ipad.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
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
    resolveReplyToMode: () => "off",
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
        throw new Error(sendResult.error ?? "wechat-ipad notify approval failed");
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
      hint: "<wxid|chatRoomId>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunkerMode: "text",
    textChunkLimit: 1800,
    sendText: async ({ to, text, accountId, cfg }) => {
      const result = await sendWechatIpadText(to, text, {
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
    sendMedia: async ({ to, text, mediaUrl, accountId, cfg }) => {
      if (!mediaUrl) {
        return {
          channel: "wechat-ipad",
          ok: false,
          messageId: "",
          error: new Error("mediaUrl is required"),
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
        throw new Error("wechat-ipad login requires baseUrl");
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
      const wxidHint =
        account.accountId === DEFAULT_ACCOUNT_ID
          ? "wxid not ready; scan QR first or set channels.wechat-ipad.wxid"
          : `wxid not ready; scan QR first or set channels.wechat-ipad.accounts.${account.accountId}.wxid`;
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        tokenSource: account.tokenSource,
        baseUrl: account.baseUrl,
        mode: account.inbound.mode,
        running: runtime?.running ?? false,
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
        throw new Error("wechat-ipad login requires baseUrl");
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
        throw new Error("wechat-ipad account baseUrl not configured");
      }

      if (account.inbound.mode !== "polling") {
        setStatus({
          ...getStatus(),
          running: false,
          lastStartAt: Date.now(),
          lastError: "webhook mode is reserved; use polling mode in MVP",
        });
        return null;
      }

      const pluginRuntime = getWechatIpadRuntime();
      const wxid = account.config.wxid?.trim();

      if (!wxid) {
        setStatus({
          ...getStatus(),
          running: false,
          lastStartAt: Date.now(),
          lastError: "wxid not ready; waiting for QR login",
        });
        return null;
      }

      clearWechatIpadPoller(accountId);
      const poller = createWechatIpadPoller({
        baseUrl: account.baseUrl,
        apiToken: account.apiToken,
        robotId: account.robotId,
        wxid,
        accountId,
        pollingConfig: account.inbound.polling,
        abortSignal,
        onMessage: async (msg) => {
          try {
            await handleWechatIpadInboundMessage(msg, {
              cfg: cfg as OpenClawConfig,
              runtime: pluginRuntime,
              accountId,
              baseUrl: account.baseUrl,
              apiToken: account.apiToken,
              robotId: account.robotId,
              allowFrom: account.config.allowFrom,
              dmPolicy: account.config.dmPolicy,
              groupPolicy: account.config.groupPolicy,
              commandAllowFrom: account.config.commandAllowFrom,
              safetyPrefix: account.config.safetyPrefix,
              requireMention: account.config.requireMention,
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
      setStatus({
        ...getStatus(),
        running: false,
        lastStopAt: Date.now(),
      });
    },
    logoutAccount: async ({ accountId }) => {
      const resolvedAccountId = normalizeAccountId(accountId);
      clearWechatIpadPoller(resolvedAccountId);
      clearWechatIpadLoginSession(resolvedAccountId);
      return {
        loggedOut: true,
        cleared: true,
      };
    },
  },
};
