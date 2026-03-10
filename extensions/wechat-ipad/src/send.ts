import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { resolveWechatIpadAccount } from "./accounts.js";
import {
  fetchBotProfileViaApi,
  sendLinkCardViaApi,
  sendLongTextViaApi,
  sendMediaViaApi,
  sendQuoteTextViaApi,
  sendTextViaApi,
} from "./api.js";
import {
  getWechatIpadBotProfile,
  getWechatIpadLoginSession,
  isWechatIpadBotProfileStale,
  isWechatIpadProfileFetching,
  markWechatIpadProfileFetching,
  resolveWechatIpadRuntimeWxid,
  setWechatIpadBotProfile,
  unmarkWechatIpadProfileFetching,
} from "./runtime.js";
import type { ResolvedWechatIpadAccount, WechatIpadLinkCard } from "./types.js";

const DEFAULT_TEXT_CHUNK_LIMIT = 1800;
const DEFAULT_LONG_TEXT_THRESHOLD = 1800;

export type WechatIpadSendOptions = {
  cfg?: OpenClawConfig;
  accountId?: string;
  baseUrl?: string;
  apiToken?: string;
  robotId?: string;
  wxid?: string;
  mediaUrl?: string;
  replyToId?: string;
  forceLongText?: boolean;
};

function isValidHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type WechatIpadSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  endpoints?: string[];
};

/**
 * 标准化发送目标，支持 wechat-ipad: / wechat: / wx: 前缀。
 */
export function normalizeWechatIpadTarget(raw: string): string {
  return raw.trim().replace(/^(wechat-ipad|wechat|wx|group):/i, "");
}

function resolveSendContext(options: WechatIpadSendOptions): {
  baseUrl: string;
  apiToken: string;
  robotId: string;
  wxid?: string;
  account?: ResolvedWechatIpadAccount;
} {
  if (options.cfg) {
    const account = resolveWechatIpadAccount({
      cfg: options.cfg,
      accountId: options.accountId,
    });
    return {
      baseUrl: options.baseUrl ?? account.baseUrl,
      apiToken: options.apiToken ?? account.apiToken,
      robotId: options.robotId ?? account.robotId,
      wxid:
        options.wxid?.trim() ||
        resolveWechatIpadRuntimeWxid(account.accountId, account.config.wxid) ||
        undefined,
      account,
    };
  }

  return {
    baseUrl: options.baseUrl ?? "http://localhost:9000",
    apiToken: options.apiToken ?? "",
    robotId: options.robotId ?? "default",
    wxid: options.wxid?.trim() || undefined,
  };
}

/**
 * 按换行与空格优先分块，避免超长文本被后端拒绝。
 */
export function chunkWechatIpadText(text: string, limit = DEFAULT_TEXT_CHUNK_LIMIT): string[] {
  if (!text) {
    return [];
  }
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const breakAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const splitIndex = breakAt > 0 ? breakAt : limit;
    const current = remaining.slice(0, splitIndex).trimEnd();
    if (current) {
      chunks.push(current);
    }
    const consume = /\s/.test(remaining[splitIndex] ?? "") ? 1 : 0;
    remaining = remaining.slice(splitIndex + consume).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

/**
 * 发送文本消息；当文本过长时自动分块串行发送。
 */
export async function sendWechatIpadText(
  to: string,
  text: string,
  options: WechatIpadSendOptions = {},
): Promise<WechatIpadSendResult> {
  const ctx = resolveSendContext(options);

  const target = normalizeWechatIpadTarget(to);
  if (!target) {
    return { ok: false, error: "No target specified" };
  }

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "No WeChat iPad wxid configured (channels.wechat-ipad.accounts.<accountId>.wxid)",
    };
  }

  const payload = text.trim();
  if (!payload) {
    return { ok: false, error: "No message content provided" };
  }

  const longTextThreshold = ctx.account?.config.longTextThreshold ?? DEFAULT_LONG_TEXT_THRESHOLD;
  const endpoints: string[] = [];

  try {
    if (!options.replyToId && (options.forceLongText || payload.length > longTextThreshold)) {
      const accountId = ctx.account?.accountId ?? options.accountId ?? "";
      const profile = accountId ? getWechatIpadBotProfile(accountId) : null;
      const loginSession = accountId ? getWechatIpadLoginSession(accountId) : null;
      const senderName = profile?.nickname ?? loginSession?.nickname;
      const sourceHeadUrl = profile?.headImgUrl ?? "";
      const title = ctx.account?.config.longTextTitle;

      // 缓存过期或不存在时后台异步刷新
      if (
        accountId &&
        wxid &&
        (!profile || isWechatIpadBotProfileStale(profile)) &&
        !isWechatIpadProfileFetching(accountId)
      ) {
        markWechatIpadProfileFetching(accountId);
        fetchBotProfileViaApi({ options: ctx, wxid })
          .then((p) => setWechatIpadBotProfile(accountId, p))
          .catch(() => undefined)
          .finally(() => unmarkWechatIpadProfileFetching(accountId));
      }

      endpoints.push("/api/Msg/SendApp");
      const result = await sendLongTextViaApi({
        options: ctx,
        wxid,
        toWxid: target,
        text: payload,
        senderName,
        sourceHeadUrl,
        title,
      });
      return { ok: true, messageId: result.messageId, endpoints };
    }

    const chunks = chunkWechatIpadText(payload);
    let messageId: string | undefined;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]!;
      let result;
      if (index === 0 && options.replyToId?.trim().startsWith("wechat-ipad:")) {
        try {
          endpoints.push("/api/Msg/SendApp");
          result = await sendQuoteTextViaApi({
            options: ctx,
            wxid,
            toWxid: target,
            text: chunk,
            replyToId: options.replyToId,
          });
        } catch {
          endpoints.push("/api/Msg/SendTxt");
          result = await sendTextViaApi({
            options: ctx,
            wxid,
            toWxid: target,
            text: chunk,
          });
        }
      } else {
        endpoints.push("/api/Msg/SendTxt");
        result = await sendTextViaApi({
          options: ctx,
          wxid,
          toWxid: target,
          text: chunk,
        });
      }
      messageId = result.messageId ?? messageId;
    }

    return { ok: true, messageId, endpoints };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      endpoints,
    };
  }
}

/**
 * 发送链接卡片消息。
 */
export async function sendWechatIpadLinkCard(
  to: string,
  card: WechatIpadLinkCard,
  options: WechatIpadSendOptions = {},
): Promise<WechatIpadSendResult> {
  const ctx = resolveSendContext(options);

  const target = normalizeWechatIpadTarget(to);
  if (!target) {
    return { ok: false, error: "No target specified" };
  }

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "No WeChat iPad wxid configured (channels.wechat-ipad.accounts.<accountId>.wxid)",
    };
  }

  const title = card.title.trim();
  const url = card.url.trim();
  if (!title || !url) {
    return { ok: false, error: "wechat-ipad link card requires title and url" };
  }
  if (!isValidHttpUrl(url)) {
    return { ok: false, error: "wechat-ipad link card url must be http or https" };
  }
  if (card.thumbUrl?.trim() && !isValidHttpUrl(card.thumbUrl)) {
    return { ok: false, error: "wechat-ipad link card thumbUrl must be http or https" };
  }

  try {
    const result = await sendLinkCardViaApi({
      options: ctx,
      wxid,
      toWxid: target,
      title,
      url,
      desc: card.desc,
      thumbUrl: card.thumbUrl,
    });
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendWechatIpadMedia(
  to: string,
  mediaUrl: string,
  text: string,
  options: WechatIpadSendOptions = {},
): Promise<WechatIpadSendResult> {
  const ctx = resolveSendContext(options);

  const target = normalizeWechatIpadTarget(to);
  if (!target) {
    return { ok: false, error: "No target specified" };
  }

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "No WeChat iPad wxid configured (channels.wechat-ipad.accounts.<accountId>.wxid)",
    };
  }

  if (!mediaUrl.trim()) {
    return { ok: false, error: "No media content provided" };
  }

  try {
    const result = await sendMediaViaApi({
      options: ctx,
      wxid,
      toWxid: target,
      base64: mediaUrl.trim(),
    });
    if (text.trim()) {
      const textResult = await sendWechatIpadText(to, text, options);
      if (!textResult.ok) {
        return textResult;
      }
    }
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
