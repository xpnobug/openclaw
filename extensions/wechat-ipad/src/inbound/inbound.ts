import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentMediaPayload, OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import { buildAgentMediaPayload, detectMime, extensionForMime } from "openclaw/plugin-sdk";
import { downloadImageViaApi, parseImageXml } from "../api/api.js";
import { getWechatIpadLoginSession, getWechatIpadMessageStore } from "../infra/runtime.js";
import { sendWechatIpadText } from "../outbound/send.js";
import type { WechatIpadInboundMessage } from "../types.js";

export type WechatIpadInboundContext = {
  cfg: OpenClawConfig;
  runtime: PluginRuntime;
  accountId: string;
  baseUrl: string;
  apiToken: string;
  robotId: string;
  wxid?: string;
  allowFrom?: string[];
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  groupPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  commandAllowFrom?: string[];
  safetyPrefix?: string;
  requireMention?: boolean;
  log?: (message: string) => void;
};

function emitWechatIpadLog(
  deps: Pick<WechatIpadInboundContext, "runtime" | "log">,
  message: string,
): void {
  if (typeof deps.log === "function") {
    deps.log(message);
    return;
  }
  const runtimeWithOptionalLog = deps.runtime as PluginRuntime & {
    log?: (message: string) => void;
  };
  runtimeWithOptionalLog.log?.(message);
}

function normalizeIdentity(entry: string): string {
  return entry
    .trim()
    .replace(/^(wechat-ipad|wechat|wx):/i, "")
    .toLowerCase();
}

function formatQuotedMessageFallbackPrefix(
  quotedMessage?: WechatIpadInboundMessage["quotedMessage"],
): string {
  if (!quotedMessage?.quotedBody?.trim()) {
    return "";
  }

  const sender =
    quotedMessage.quotedSender?.trim() || quotedMessage.quotedSenderWxid?.trim() || "原消息";
  const body = quotedMessage.quotedBody.trim();
  const preview = body.length > 120 ? `${body.slice(0, 120)}…` : body;
  return `【引用 ${sender}】\n${preview}\n\n`;
}

function buildLogPrefix(accountId: string): string {
  return `wechat-ipad[${accountId}]`;
}

function formatChatTypeLabel(chatType: WechatIpadInboundMessage["chatType"]): string {
  return chatType === "group" ? "群聊" : "私聊";
}

function formatSenderLabel(msg: WechatIpadInboundMessage, senderId: string): string {
  const senderName = msg.senderName?.trim();
  return senderName ? `${senderName}(${senderId})` : senderId;
}

function formatMessagePreview(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "空消息";
  }
  return collapsed.length > 60 ? `${collapsed.slice(0, 60)}…` : collapsed;
}

/**
 * 下载图片并保存到 agent 工作目录。
 * 任何步骤失败均记日志并返回 null，不阻塞消息处理。
 */
async function downloadAndSaveInboundImage(params: {
  msg: WechatIpadInboundMessage;
  deps: WechatIpadInboundContext;
  wxid: string;
  imageDir: string;
}): Promise<{ path: string; contentType: string } | null> {
  const { msg, deps, wxid, imageDir } = params;
  try {
    const parsed = parseImageXml(msg.body);
    if (!parsed) {
      emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 图片 XML 解析失败，跳过下载`);
      return null;
    }

    const { buffer, contentType: fallbackContentType } = await downloadImageViaApi({
      options: {
        baseUrl: deps.baseUrl,
        apiToken: deps.apiToken,
        robotId: deps.robotId,
      },
      wxid,
      aesKey: parsed.aesKey,
      cdnMidImgUrl: parsed.cdnMidImgUrl,
    });

    // 检测实际 MIME 类型
    const detectedMime = await detectMime({ buffer });
    const contentType = detectedMime ?? fallbackContentType;
    const ext = extensionForMime(contentType) ?? ".jpg";

    const contactId = msg.chatType === "group" ? msg.chatId : msg.senderId;
    const timestamp = Math.floor((msg.timestamp || Date.now()) / 1000);
    const msgId = msg.msgId ?? msg.id;
    const fileName = `${timestamp}_${msgId}${ext}`;
    const dir = join(imageDir, contactId);
    const filePath = join(dir, fileName);

    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, buffer);

    return { path: filePath, contentType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 图片下载/保存失败：${message}`);
    return null;
  }
}

/**
 * 统一处理 wechat-ipad 入站：策略校验 + 路由 + 回复派发。
 */
export async function handleWechatIpadInboundMessage(
  msg: WechatIpadInboundMessage,
  deps: WechatIpadInboundContext,
): Promise<void> {
  const {
    cfg,
    runtime,
    accountId,
    baseUrl,
    apiToken,
    robotId,
    allowFrom = [],
    dmPolicy = "pairing",
    groupPolicy = "open",
    commandAllowFrom,
    safetyPrefix,
    requireMention = true,
  } = deps;

  const logPrefix = buildLogPrefix(accountId);

  // 持久化消息到 SQLite，在策略检查之前执行（被过滤的消息也可能被引用）
  const messageStore = getWechatIpadMessageStore(accountId);
  if (messageStore && msg.msgId) {
    try {
      messageStore.store({
        msgId: msg.msgId,
        msgSeq: msg.msgSeq,
        createTime: msg.timestamp ? Math.trunc(msg.timestamp / 1000) : undefined,
        msgSource: msg.rawMsgSource,
        senderId: msg.senderId || msg.from,
        senderName: msg.senderName,
        chatId: msg.chatId,
        chatType: msg.chatType,
        msgType: msg.messageType,
        appMsgType: msg.appMessageType,
        contentType: msg.contentType,
        body: msg.body,
        rawContent: msg.rawContent,
      });
      emitWechatIpadLog(
        deps,
        `${logPrefix}: 入站消息已入库：msgId=${msg.msgId}，发送者=${msg.senderId || msg.from}`,
      );
    } catch {
      // 存储失败不阻塞消息处理
    }
  }

  if (msg.chatType === "group" && requireMention && !msg.isAtMe) {
    emitWechatIpadLog(
      deps,
      `${logPrefix}: 忽略群消息：未 @ 当前账号，发送者=${msg.senderId || msg.from}，群=${msg.chatId}`,
    );
    return;
  }

  const senderId = normalizeIdentity(msg.senderId || msg.from);
  const normalizedAllowFrom = allowFrom.map(normalizeIdentity);
  const effectivePolicy = msg.chatType === "group" ? groupPolicy : dmPolicy;
  const isAllowed = effectivePolicy === "open" || normalizedAllowFrom.includes(senderId);
  const isTrusted = normalizedAllowFrom.includes(senderId);

  const cmdAllowList = (commandAllowFrom ?? allowFrom).map(normalizeIdentity);
  const isCommandAuthorized = cmdAllowList.includes(senderId);

  if (!isAllowed && effectivePolicy !== "pairing") {
    emitWechatIpadLog(
      deps,
      `${logPrefix}: 忽略消息：策略=${effectivePolicy}，发送者=${senderId} 不在 allowFrom 中`,
    );
    return;
  }

  if (effectivePolicy === "pairing" && !normalizedAllowFrom.includes(senderId)) {
    const pairingSenderId = msg.chatType === "group" ? msg.chatId : senderId;
    const pairingSenderName =
      msg.chatType === "group" ? `Group ${msg.chatId}` : (msg.senderName ?? senderId);
    const { code } = await runtime.channel.pairing.upsertPairingRequest({
      channel: "wechat-ipad",
      accountId,
      id: pairingSenderId,
      meta: { name: pairingSenderName },
    });

    const pairingReply = runtime.channel.pairing.buildPairingReply({
      channel: "wechat-ipad",
      idLine: `Your WeChat iPad user id: ${pairingSenderId}`,
      code,
    });

    await sendWechatIpadText(msg.from, pairingReply, {
      baseUrl,
      apiToken,
      robotId,
    });
    return;
  }

  const chatTypeLabel = formatChatTypeLabel(msg.chatType);
  const senderLabel = formatSenderLabel(msg, senderId);
  const chatLabel = msg.chatId || msg.from;

  emitWechatIpadLog(
    deps,
    `${logPrefix}: 收到消息：来自 ${senderId}，在 ${chatLabel}（${chatTypeLabel}）`,
  );

  runtime.channel.activity.record({
    channel: "wechat-ipad",
    accountId,
    direction: "inbound",
  });

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg,
    channel: "wechat-ipad",
    accountId,
    peer: {
      kind: msg.chatType === "group" ? "group" : "direct",
      id: msg.chatType === "group" ? msg.chatId : senderId,
    },
  });

  // 图片下载
  let mediaPayload: AgentMediaPayload = {};
  if (msg.contentType === "image") {
    const resolvedWxid =
      deps.wxid?.trim() || getWechatIpadLoginSession(accountId)?.wxid?.trim() || robotId;
    const stateDir = runtime.state.resolveStateDir();
    const imageDir = join(stateDir, "workspace", "wechat-ipad-data", accountId, "images");
    const saved = await downloadAndSaveInboundImage({
      msg,
      deps,
      wxid: resolvedWxid,
      imageDir,
    });
    if (saved) {
      mediaPayload = buildAgentMediaPayload([saved]);
      emitWechatIpadLog(deps, `${logPrefix}: 图片已保存至 ${saved.path}`);
    }
  }

  const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const defaultSafetyPrefix =
    "[系统安全提示：此用户为访客(guest)，禁止执行系统命令、文件操作、代码执行或工具调用，仅允许普通对话]\n\n";
  const effectiveSafetyPrefix = isTrusted ? "" : (safetyPrefix ?? defaultSafetyPrefix);

  // 图片消息：如果下载成功则使用描述性文本替代原始 XML
  const effectiveBody =
    msg.contentType === "image" && mediaPayload.MediaPath
      ? "[图片]"
      : `${effectiveSafetyPrefix}${msg.body}`;

  const body = runtime.channel.reply.formatInboundEnvelope({
    channel: "WeChat iPad",
    from: msg.senderName ?? senderId,
    timestamp: msg.timestamp,
    body: effectiveBody,
    chatType: msg.chatType,
    sender: {
      name: msg.senderName ?? senderId,
      id: senderId,
    },
    envelope: envelopeOptions,
  });

  const target = msg.from;
  const transportTo = msg.chatType === "group" ? `group:${msg.chatId}` : `wechat-ipad:${senderId}`;

  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: msg.body,
    CommandBody: msg.body,
    From: transportTo,
    To: transportTo,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: msg.chatType,
    ConversationLabel: msg.senderName ?? senderId,
    GroupSubject: msg.chatType === "group" ? msg.chatId : undefined,
    SenderName: msg.senderName ?? senderId,
    SenderId: senderId,
    Provider: "wechat-ipad",
    Surface: "wechat-ipad",
    MessageSid: msg.msgId ?? msg.id,
    MessageSidFull: msg.msgIdFull ?? msg.msgId ?? msg.id,
    Timestamp: msg.timestamp,
    WasMentioned: msg.isAtMe,
    CommandAuthorized: isCommandAuthorized,
    OriginatingChannel: "wechat-ipad",
    OriginatingTo: transportTo,
    UserTrustLevel: isTrusted ? "trusted" : "guest",
    AllowedCapabilities: isTrusted ? ["chat", "tools", "files", "commands"] : ["chat"],
    ReplyToId: msg.quotedMessage?.quotedMessageId,
    ReplyToIdFull: msg.quotedMessage?.quotedMessageIdFull ?? msg.quotedMessage?.quotedMessageId,
    ReplyToBody: msg.quotedMessage?.quotedBody,
    ReplyToSender: msg.quotedMessage?.quotedSender ?? msg.quotedMessage?.quotedSenderWxid,
    ReplyToIsQuote: msg.quotedMessage ? true : undefined,
    ...mediaPayload,
  });

  if (!ctxPayload) {
    return;
  }

  const messagePreview = formatMessagePreview(msg.body);
  if (msg.chatType === "group") {
    emitWechatIpadLog(
      deps,
      `${logPrefix}: 群聊消息：${senderLabel} @ ${chatLabel}：${messagePreview}`,
    );
  } else {
    emitWechatIpadLog(deps, `${logPrefix}: 私聊消息：${senderLabel}：${messagePreview}`);
  }

  let quoteFallbackPending = Boolean(msg.quotedMessage?.quotedBody?.trim());
  const quoteFallbackPrefix = formatQuotedMessageFallbackPrefix(msg.quotedMessage);

  const { dispatcher, replyOptions, markDispatchIdle } =
    runtime.channel.reply.createReplyDispatcherWithTyping({
      deliver: async (payload: { text?: string; body?: string }, info: { kind: string }) => {
        let text = payload.text ?? payload.body ?? "";
        if (!text.trim()) {
          return;
        }
        if (quoteFallbackPending && quoteFallbackPrefix) {
          text = `${quoteFallbackPrefix}${text}`;
          quoteFallbackPending = false;
        }
        const result = await sendWechatIpadText(target, text, {
          cfg,
          accountId,
          baseUrl,
          apiToken,
          robotId,
          log: (message: string) => emitWechatIpadLog(deps, message),
        });
        if (result.endpoints?.length) {
          emitWechatIpadLog(
            deps,
            `${logPrefix}: 回复发送接口：kind=${info.kind}，目标=${target}，接口=${result.endpoints.join(" -> ")}`,
          );
        }
        if (!result.ok) {
          emitWechatIpadLog(
            deps,
            `${logPrefix}: 回复发送失败：kind=${info.kind}，目标=${target}，错误=${result.error ?? "unknown error"}`,
          );
        }
      },
      onError: (error, info) => {
        const message = error instanceof Error ? error.message : String(error);
        emitWechatIpadLog(deps, `${logPrefix}: 回复发送异常：kind=${info.kind}，错误=${message}`);
      },
    });

  try {
    emitWechatIpadLog(deps, `${logPrefix}: 开始分发到 agent（session=${route.sessionKey}）`);
    const result = await runtime.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });
    emitWechatIpadLog(
      deps,
      `${logPrefix}: 分发完成（已入队最终回复=${result.queuedFinal}，回复数=${result.counts.final}）`,
    );
  } finally {
    markDispatchIdle();
  }
}
