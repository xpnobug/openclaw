/**
 * WeChat inbound message handler.
 * 微信入站消息处理器
 *
 * 处理收到的消息并分发到自动回复系统
 */

import type { MoltbotConfig, PluginRuntime } from "openclaw/plugin-sdk/wechat";
import type { WeChatInboundMessage, WeChatInboundQuotedMessage } from "./polling.js";
import { sendMessageWeChat } from "./send.js";

/** 入站消息处理依赖 */
export type WeChatInboundHandlerDeps = {
  cfg: MoltbotConfig; // 配置对象
  runtime: PluginRuntime; // 插件运行时
  accountId: string; // 账户 ID
  baseUrl: string; // API 服务地址
  apiToken: string; // API Token
  robotId: number; // 机器人 ID
  allowFrom?: string[]; // 允许的用户列表
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled"; // 私聊访问策略
  groupPolicy?: "pairing" | "allowlist" | "open" | "disabled"; // 群聊访问策略
  commandAllowFrom?: string[]; // 指令/工具调用白名单
  safetyPrefix?: string; // 访客安全前缀
  requireMention?: boolean; // 群聊是否需要 @机器人
};

function formatQuotedMessageFallbackPrefix(quotedMessage?: WeChatInboundQuotedMessage): string {
  if (!quotedMessage?.body?.trim()) {
    return "";
  }

  const sender = quotedMessage.sender?.trim() || quotedMessage.senderWxid?.trim() || "原消息";
  const body = quotedMessage.body.trim();
  const preview = body.length > 120 ? `${body.slice(0, 120)}…` : body;
  return `【引用 ${sender}】\n${preview}\n\n`;
}

/**
 * Handle inbound WeChat message.
 * 处理入站微信消息
 */
export async function handleWeChatInboundMessage(
  msg: WeChatInboundMessage,
  deps: WeChatInboundHandlerDeps,
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

  if (msg.chatType === "group") {
    console.log(`[微信] 群消息检查: requireMention=${requireMention}, isAtMe=${msg.isAtMe}`);
  }

  if (msg.chatType === "group" && requireMention && !msg.isAtMe) {
    return;
  }

  const checkId = msg.senderWxid.toLowerCase();
  const normalizedAllowFrom = allowFrom.map((entry) =>
    entry.replace(/^(wechat|wx):/i, "").toLowerCase(),
  );

  const effectivePolicy = msg.chatType === "group" ? groupPolicy : dmPolicy;
  const isAllowed = effectivePolicy === "open" || normalizedAllowFrom.includes(checkId);
  const isTrusted = normalizedAllowFrom.includes(checkId);

  const cmdAllowList = (commandAllowFrom ?? allowFrom).map((entry) =>
    entry.replace(/^(wechat|wx):/i, "").toLowerCase(),
  );
  const isCommandAuthorized = cmdAllowList.includes(checkId);

  console.log(
    `[微信] 权限检查: 发送者=${checkId}, 类型=${msg.chatType}, 策略=${effectivePolicy}, 允许对话=${isAllowed}, 受信任=${isTrusted}, 可执行指令=${isCommandAuthorized}`,
  );

  if (!isAllowed && effectivePolicy !== "pairing") {
    return;
  }

  if (effectivePolicy === "pairing" && !normalizedAllowFrom.includes(checkId)) {
    const pairingReply = runtime.channel.pairing.buildPairingReply({
      cfg,
      channel: "wechat",
      senderId: msg.chatType === "group" ? msg.chatId : msg.senderWxid,
      senderName:
        msg.chatType === "group" ? `Group ${msg.chatId}` : (msg.senderNickname ?? msg.senderWxid),
    });

    if (pairingReply) {
      runtime.channel.pairing.upsertPairingRequest({
        channel: "wechat",
        accountId,
        senderId: msg.chatType === "group" ? msg.chatId : msg.senderWxid,
        senderName: msg.chatType === "group" ? `Group ${msg.chatId}` : msg.senderNickname,
        timestamp: Date.now(),
      });

      await sendMessageWeChat(
        msg.chatType === "group" ? msg.chatId : msg.senderWxid,
        pairingReply,
        {
          baseUrl,
          apiToken,
          robotId,
        },
      );
    }
    return;
  }

  runtime.channel.activity.record({
    channel: "wechat",
    accountId,
    direction: "inbound",
  });

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg,
    channel: "wechat",
    accountId,
    peer: {
      kind: msg.chatType === "group" ? "group" : "dm",
      id: msg.chatType === "group" ? msg.chatId : msg.senderWxid,
    },
  });

  const fromLabel = msg.senderNickname ?? msg.senderWxid;
  const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);

  const defaultSafetyPrefix =
    "[系统安全提示：此用户为访客(guest)，禁止执行任何系统命令、文件操作、代码执行或工具调用，只进行普通对话]\n\n";
  const effectiveSafetyPrefix = isTrusted ? "" : (safetyPrefix ?? defaultSafetyPrefix);
  const messageBody = effectiveSafetyPrefix + msg.body;

  const body = runtime.channel.reply.formatInboundEnvelope({
    channel: "WeChat",
    from: fromLabel,
    timestamp: msg.timestamp,
    body: messageBody,
    chatType: msg.chatType === "group" ? "group" : "direct",
    sender: { name: msg.senderNickname ?? msg.senderWxid, id: msg.senderWxid },
    envelope: envelopeOptions,
  });

  const replyTo = msg.chatType === "group" ? msg.chatId : msg.senderWxid;
  const wechatTo = msg.chatType === "group" ? `group:${msg.chatId}` : `wechat:${msg.senderWxid}`;

  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: msg.body,
    CommandBody: msg.body,
    From: wechatTo,
    To: wechatTo,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: msg.chatType === "group" ? "group" : "direct",
    ConversationLabel: fromLabel,
    GroupSubject: msg.chatType === "group" ? msg.chatId : undefined,
    SenderName: msg.senderNickname ?? msg.senderWxid,
    SenderId: msg.senderWxid,
    Provider: "wechat",
    Surface: "wechat",
    MessageSid: msg.id,
    Timestamp: msg.timestamp,
    WasMentioned: msg.isAtMe,
    CommandAuthorized: isCommandAuthorized,
    OriginatingChannel: "wechat",
    OriginatingTo: wechatTo,
    UserTrustLevel: isTrusted ? "trusted" : "guest",
    AllowedCapabilities: isTrusted ? ["chat", "tools", "files", "commands"] : ["chat"],
    ReplyToId: msg.quotedMessage?.messageId,
    ReplyToIdFull: msg.quotedMessage?.messageId,
    ReplyToBody: msg.quotedMessage?.body,
    ReplyToSender: msg.quotedMessage?.sender ?? msg.quotedMessage?.senderWxid,
    ReplyToIsQuote: msg.quotedMessage ? true : undefined,
  });

  if (!ctxPayload) {
    return;
  }

  let quoteFallbackPending = Boolean(msg.quotedMessage?.body?.trim());
  const quoteFallbackPrefix = formatQuotedMessageFallbackPrefix(msg.quotedMessage);

  const { dispatcher, replyOptions, markDispatchIdle } =
    runtime.channel.reply.createReplyDispatcherWithTyping({
      deliver: async (payload: { text?: string; body?: string; mediaUrl?: string }) => {
        let text = payload.text ?? payload.body ?? "";
        if (!text.trim()) return;

        if (quoteFallbackPending && quoteFallbackPrefix) {
          text = `${quoteFallbackPrefix}${text}`;
          quoteFallbackPending = false;
        }

        const preview = text.length > 50 ? text.substring(0, 50) + "..." : text;
        console.log(`[微信] 机器人回复: ${preview}`);
        await sendMessageWeChat(replyTo, text, { baseUrl, apiToken, robotId });
      },
      onError: (err: unknown, info: { kind: string }) => {
        console.error(`[微信] 回复错误 (${info.kind}):`, err);
      },
    });

  try {
    await runtime.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });
  } catch (error) {
    console.error(`[微信] 分发错误:`, error);
  } finally {
    markDispatchIdle();
  }
}
