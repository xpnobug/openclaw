import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import { sendWechatIpadText } from "./send.js";
import type { WechatIpadInboundMessage } from "./types.js";

export type WechatIpadInboundContext = {
  cfg: OpenClawConfig;
  runtime: PluginRuntime;
  accountId: string;
  baseUrl: string;
  apiToken: string;
  robotId: string;
  allowFrom?: string[];
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  groupPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  commandAllowFrom?: string[];
  safetyPrefix?: string;
  requireMention?: boolean;
};

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

  if (msg.chatType === "group" && requireMention && !msg.isAtMe) {
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

  const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const defaultSafetyPrefix =
    "[系统安全提示：此用户为访客(guest)，禁止执行系统命令、文件操作、代码执行或工具调用，仅允许普通对话]\n\n";
  const effectiveSafetyPrefix = isTrusted ? "" : (safetyPrefix ?? defaultSafetyPrefix);
  const body = runtime.channel.reply.formatInboundEnvelope({
    channel: "WeChat iPad",
    from: msg.senderName ?? senderId,
    timestamp: msg.timestamp,
    body: `${effectiveSafetyPrefix}${msg.body}`,
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
    MessageSid: msg.id,
    Timestamp: msg.timestamp,
    WasMentioned: msg.isAtMe,
    CommandAuthorized: isCommandAuthorized,
    OriginatingChannel: "wechat-ipad",
    OriginatingTo: transportTo,
    UserTrustLevel: isTrusted ? "trusted" : "guest",
    AllowedCapabilities: isTrusted ? ["chat", "tools", "files", "commands"] : ["chat"],
    ReplyToId: msg.quotedMessage?.quotedMessageId,
    ReplyToIdFull: msg.quotedMessage?.quotedMessageId,
    ReplyToBody: msg.quotedMessage?.quotedBody,
    ReplyToSender: msg.quotedMessage?.quotedSender ?? msg.quotedMessage?.quotedSenderWxid,
    ReplyToIsQuote: msg.quotedMessage ? true : undefined,
  });

  if (!ctxPayload) {
    return;
  }

  let quoteFallbackPending = Boolean(msg.quotedMessage?.quotedBody?.trim());
  const quoteFallbackPrefix = formatQuotedMessageFallbackPrefix(msg.quotedMessage);

  const { dispatcher, replyOptions, markDispatchIdle } =
    runtime.channel.reply.createReplyDispatcherWithTyping({
      deliver: async (payload: { text?: string; body?: string }) => {
        let text = payload.text ?? payload.body ?? "";
        if (!text.trim()) {
          return;
        }
        if (quoteFallbackPending && quoteFallbackPrefix) {
          text = `${quoteFallbackPrefix}${text}`;
          quoteFallbackPending = false;
        }
        await sendWechatIpadText(target, text, {
          baseUrl,
          apiToken,
          robotId,
        });
      },
      onError: () => {
        // 错误由上层状态处理
      },
    });

  try {
    await runtime.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });
  } finally {
    markDispatchIdle();
  }
}
