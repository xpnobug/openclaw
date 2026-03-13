import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { loadOutboundMediaFromUrl } from "openclaw/plugin-sdk";
import {
  fetchBotProfileViaApi,
  sendLinkCardViaApi,
  sendLongTextViaApi,
  sendMediaViaApi,
  sendQuoteTextViaApi,
  sendTextViaApi,
  sendVideoViaApi,
} from "../api/api.js";
import { resolveWechatIpadAccount } from "../config/accounts.js";
import {
  getWechatIpadBotProfile,
  getWechatIpadContact,
  getWechatIpadLoginSession,
  getWechatIpadMessageStore,
  isWechatIpadBotProfileStale,
  isWechatIpadProfileFetching,
  markWechatIpadProfileFetching,
  resolveWechatIpadRuntimeWxid,
  setWechatIpadBotProfile,
  unmarkWechatIpadProfileFetching,
} from "../infra/runtime.js";
import type { ResolvedWechatIpadAccount, WechatIpadLinkCard } from "../types.js";
import { prepareVideoPayload } from "./video.js";

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
  log?: (message: string) => void;
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
 * 格式化出站目标标签：从联系人缓存中读取昵称，仅读缓存不触发网络请求。
 */
function formatTargetLabel(accountId: string, wxid: string): string {
  const cached = getWechatIpadContact(accountId, wxid);
  if (cached) {
    const label = cached.remark || cached.nickname;
    if (label) return `${label}(${wxid})`;
  }
  return wxid;
}

/**
 * 尝试将出站消息存入 SQLite，失败不阻塞发送。
 */
function tryStoreOutboundMessage(params: {
  accountId: string;
  messageId: string | undefined;
  wxid: string;
  target: string;
  text: string;
  log?: (message: string) => void;
}): void {
  if (!params.messageId || !params.accountId) return;
  const store = getWechatIpadMessageStore(params.accountId);
  if (!store) return;
  try {
    store.store({
      msgId: params.messageId,
      senderId: params.wxid,
      chatId: params.target,
      chatType: params.target.includes("@chatroom") ? "group" : "direct",
      msgType: 1,
      contentType: "text",
      body: params.text,
    });
    params.log?.(
      `wechat-ipad[${params.accountId}]: 出站消息已入库：msgId=${params.messageId}，目标=${formatTargetLabel(params.accountId, params.target)}`,
    );
  } catch {
    // 存储失败不阻塞发送
  }
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
    const storeAccountId = ctx.account?.accountId ?? options.accountId ?? "";

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
      tryStoreOutboundMessage({
        accountId: storeAccountId,
        messageId: result.messageId,
        wxid,
        target,
        text: payload,
        log: options.log,
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
          const messageStore = storeAccountId ? getWechatIpadMessageStore(storeAccountId) : null;
          result = await sendQuoteTextViaApi({
            options: ctx,
            wxid,
            toWxid: target,
            text: chunk,
            replyToId: options.replyToId,
            messageStore,
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
      tryStoreOutboundMessage({
        accountId: storeAccountId,
        messageId: result.messageId,
        wxid,
        target,
        text: chunk,
        log: options.log,
      });
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

type MediaKind = "image" | "video" | "other";

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

function resolveMediaKind(mime: string): MediaKind {
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime.startsWith("image/")) {
    return "image";
  }
  return "other";
}

type ResolvedMedia =
  | { kind: "video"; buffer: Buffer; dataUrl: string }
  | { kind: "image" | "other"; dataUrl: string };

async function resolveMediaContent(mediaUrl: string): Promise<ResolvedMedia> {
  const trimmed = mediaUrl.trim();

  // data: URL — 直接解析
  if (trimmed.startsWith("data:")) {
    const parsed = parseDataUrl(trimmed);
    if (parsed && resolveMediaKind(parsed.mime) === "video") {
      return { kind: "video", buffer: parsed.buffer, dataUrl: trimmed };
    }
    // 已经排除了 video，这里只可能是 image 或 other
    const rawKind = parsed ? resolveMediaKind(parsed.mime) : ("image" as const);
    const kind: "image" | "other" = rawKind === "video" ? "other" : rawKind;
    return { kind, dataUrl: trimmed };
  }

  // http(s):// URL — 下载并检测类型
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const result = await loadOutboundMediaFromUrl(trimmed);
      if (result.kind === "video") {
        const base64 = `data:${result.contentType ?? "video/mp4"};base64,${result.buffer.toString("base64")}`;
        return { kind: "video", buffer: result.buffer, dataUrl: base64 };
      }
      const contentType = result.contentType ?? "application/octet-stream";
      const base64 = `data:${contentType};base64,${result.buffer.toString("base64")}`;
      return { kind: result.kind === "image" ? "image" : "other", dataUrl: base64 };
    } catch {
      // 下载失败，按原始 URL 直传（向后兼容）
      return { kind: "image", dataUrl: trimmed };
    }
  }

  // 其他格式 — 当作 image 直传（向后兼容）
  return { kind: "image", dataUrl: trimmed };
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
    const media = await resolveMediaContent(mediaUrl);
    let result: { messageId?: string };

    if (media.kind === "video") {
      const payload = await prepareVideoPayload(media.buffer, options.log);
      result = await sendVideoViaApi({
        options: ctx,
        wxid,
        toWxid: target,
        base64: payload.videoBase64,
        imageBase64: payload.thumbnailBase64,
        playLength: payload.playLength,
      });
    } else {
      result = await sendMediaViaApi({
        options: ctx,
        wxid,
        toWxid: target,
        base64: media.dataUrl,
      });
    }

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
