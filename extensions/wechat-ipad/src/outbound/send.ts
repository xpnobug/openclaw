import type { OpenClawConfig } from "openclaw/plugin-sdk/wechat-ipad";
import { loadOutboundMediaFromUrl } from "openclaw/plugin-sdk/wechat-ipad";
import {
  fetchBotProfileViaApi,
  revokeMessageViaApi,
  sendCdnFileViaApi,
  sendCdnImageViaApi,
  sendCdnVideoViaApi,
  sendEmojiViaApi,
  sendFileViaUploadApi,
  sendLinkCardViaApi,
  sendLongTextViaApi,
  sendMediaViaApi,
  sendQuoteTextViaApi,
  sendTextViaApi,
  sendVideoViaApi,
  sendVoiceViaApi,
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
import type {
  ResolvedWechatIpadAccount,
  WechatIpadCdnForward,
  WechatIpadEmojiData,
  WechatIpadLinkCard,
} from "../types.js";
import {
  DEFAULT_VOICE_DURATION_MS,
  extractAudioDuration,
  prepareVideoPayload,
  resolveVoiceType,
} from "./video.js";

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
  at?: string[];
  /** 与 at 平行的昵称数组，用于在文本前缀 @昵称\u2005（微信协议要求）。 */
  atNicknames?: string[];
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
    return { ok: false, error: "未指定发送目标" };
  }

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "WeChat iPad wxid 未配置（channels.wechat-ipad.accounts.<accountId>.wxid）",
    };
  }

  const payload = text.trim();
  if (!payload) {
    return { ok: false, error: "未提供消息内容" };
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
          at: index === 0 ? options.at : undefined,
          atNicknames: index === 0 ? options.atNicknames : undefined,
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
    return { ok: false, error: "未指定发送目标" };
  }

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "WeChat iPad wxid 未配置（channels.wechat-ipad.accounts.<accountId>.wxid）",
    };
  }

  const title = card.title.trim();
  const url = card.url.trim();
  if (!title || !url) {
    return { ok: false, error: "wechat-ipad 链接卡片需要 title 和 url" };
  }
  if (!isValidHttpUrl(url)) {
    return { ok: false, error: "wechat-ipad 链接卡片 url 必须为 http 或 https" };
  }
  if (card.thumbUrl?.trim() && !isValidHttpUrl(card.thumbUrl)) {
    return { ok: false, error: "wechat-ipad 链接卡片 thumbUrl 必须为 http 或 https" };
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

type MediaKind = "image" | "video" | "audio" | "other";

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
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  if (mime.startsWith("image/")) {
    return "image";
  }
  return "other";
}

type ResolvedMedia =
  | { kind: "video"; buffer: Buffer; dataUrl: string; mime: string }
  | { kind: "audio"; buffer: Buffer; dataUrl: string }
  | { kind: "image" | "other"; dataUrl: string };

async function resolveMediaContent(mediaUrl: string): Promise<ResolvedMedia> {
  const trimmed = mediaUrl.trim();

  // data: URL — 直接解析
  if (trimmed.startsWith("data:")) {
    const parsed = parseDataUrl(trimmed);
    if (parsed && resolveMediaKind(parsed.mime) === "video") {
      return { kind: "video", buffer: parsed.buffer, dataUrl: trimmed, mime: parsed.mime };
    }
    if (parsed && resolveMediaKind(parsed.mime) === "audio") {
      return { kind: "audio", buffer: parsed.buffer, dataUrl: trimmed };
    }
    // 已经排除了 video 和 audio，这里只可能是 image 或 other
    const rawKind = parsed ? resolveMediaKind(parsed.mime) : ("image" as const);
    const kind: "image" | "other" = rawKind === "video" || rawKind === "audio" ? "other" : rawKind;
    return { kind, dataUrl: trimmed };
  }

  // http(s):// URL — 下载并检测类型
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const result = await loadOutboundMediaFromUrl(trimmed);
      if (result.kind === "video") {
        const base64 = `data:${result.contentType ?? "video/mp4"};base64,${result.buffer.toString("base64")}`;
        return {
          kind: "video",
          buffer: result.buffer,
          dataUrl: base64,
          mime: result.contentType ?? "video/mp4",
        };
      }
      const contentType = result.contentType ?? "application/octet-stream";
      const mediaKind = resolveMediaKind(contentType);
      if (mediaKind === "audio") {
        const base64 = `data:${contentType};base64,${result.buffer.toString("base64")}`;
        return { kind: "audio", buffer: result.buffer, dataUrl: base64 };
      }
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
    return { ok: false, error: "未指定发送目标" };
  }

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "WeChat iPad wxid 未配置（channels.wechat-ipad.accounts.<accountId>.wxid）",
    };
  }

  if (!mediaUrl.trim()) {
    return { ok: false, error: "未提供媒体内容" };
  }

  try {
    const media = await resolveMediaContent(mediaUrl);
    let result: { messageId?: string };

    if (media.kind === "video") {
      const payload = await prepareVideoPayload(media.buffer, options.log, media.mime);
      result = await sendVideoViaApi({
        options: ctx,
        wxid,
        toWxid: target,
        base64: payload.videoBase64,
        imageBase64: payload.thumbnailBase64,
        playLength: payload.playLength,
      });
    } else if (media.kind === "audio") {
      // 音频作为语音消息发送
      const voiceResult = await sendWechatIpadVoice(to, mediaUrl, text, options);
      return voiceResult;
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

// ─── 语音消息发送 ───

/**
 * 发送语音消息：下载音频 → 检测时长 → 选择编码类型 → 发送。
 */
export async function sendWechatIpadVoice(
  to: string,
  mediaUrl: string,
  text: string,
  options: WechatIpadSendOptions = {},
): Promise<WechatIpadSendResult> {
  const ctx = resolveSendContext(options);
  const target = normalizeWechatIpadTarget(to);
  if (!target) return { ok: false, error: "未指定发送目标" };

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "WeChat iPad wxid 未配置（channels.wechat-ipad.accounts.<accountId>.wxid）",
    };
  }

  try {
    const media = await resolveMediaContent(mediaUrl);
    if (media.kind !== "audio" && media.kind !== "other") {
      // 非音频类型降级为普通媒体发送
      return sendWechatIpadMedia(to, mediaUrl, text, options);
    }

    // 解析 data URL 获取 buffer 和 mime
    const parsed = parseDataUrl(media.dataUrl);
    if (!parsed) {
      return { ok: false, error: "无法解析音频内容" };
    }

    const { withTempDownloadPath } = await import("openclaw/plugin-sdk");

    const voiceResult = await withTempDownloadPath(
      { prefix: "wechat-ipad-voice", fileName: "voice.audio" },
      async (audioPath) => {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(audioPath, parsed.buffer);

        const duration = await extractAudioDuration(audioPath);
        // 微信语音上限 59 秒（Go 端 robot.go:629-633 同样截断）
        const rawMs = duration ? duration * 1000 : DEFAULT_VOICE_DURATION_MS;
        const voiceTimeMs = Math.min(rawMs, 59_000);
        const voiceType = resolveVoiceType(parsed.mime);
        const base64 = parsed.buffer.toString("base64");

        return sendVoiceViaApi({
          options: ctx,
          wxid,
          toWxid: target,
          base64,
          voiceTime: voiceTimeMs,
          voiceType,
        });
      },
    );

    // 如有附加文本，追加发送
    if (text.trim()) {
      const textResult = await sendWechatIpadText(to, text, options);
      if (!textResult.ok) return textResult;
    }

    return { ok: true, messageId: voiceResult.messageId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── 文件消息发送 ───

/**
 * 发送文件消息：分片上传 → UploadImg → 链接卡片降级。
 */
export async function sendWechatIpadFile(
  to: string,
  mediaUrl: string,
  fileName: string,
  text: string,
  options: WechatIpadSendOptions = {},
): Promise<WechatIpadSendResult> {
  const ctx = resolveSendContext(options);
  const target = normalizeWechatIpadTarget(to);
  if (!target) return { ok: false, error: "未指定发送目标" };

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "WeChat iPad wxid 未配置（channels.wechat-ipad.accounts.<accountId>.wxid）",
    };
  }

  try {
    const media = await resolveMediaContent(mediaUrl);
    const dataUrl = media.dataUrl;

    // 1. 优先尝试分片上传
    try {
      const parsed = parseDataUrl(dataUrl);
      if (parsed && parsed.buffer.length > 0) {
        const result = await sendFileViaUploadApi({
          options: ctx,
          wxid,
          toWxid: target,
          fileBuffer: parsed.buffer,
          fileName: fileName || "file",
        });

        if (text.trim()) {
          const textResult = await sendWechatIpadText(to, text, options);
          if (!textResult.ok) return textResult;
        }

        return { ok: true, messageId: result.messageId };
      }
    } catch {
      // 分片上传失败，继续尝试其他方式
      options.log?.("wechat-ipad: 文件分片上传失败，尝试 UploadImg 降级");
    }

    // 2. 尝试通过 UploadImg 发送（桥接服务会自动识别非图片内容）
    try {
      const result = await sendMediaViaApi({
        options: ctx,
        wxid,
        toWxid: target,
        base64: dataUrl,
      });

      if (text.trim()) {
        const textResult = await sendWechatIpadText(to, text, options);
        if (!textResult.ok) return textResult;
      }

      return { ok: true, messageId: result.messageId };
    } catch {
      // UploadImg 失败，降级为链接卡片
      if (isValidHttpUrl(mediaUrl.trim())) {
        const result = await sendLinkCardViaApi({
          options: ctx,
          wxid,
          toWxid: target,
          title: fileName || "文件",
          url: mediaUrl.trim(),
          desc: text || undefined,
        });
        return { ok: true, messageId: result.messageId };
      }
      return { ok: false, error: "文件发送失败且无可用下载链接" };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── 表情消息发送 ───

/**
 * 发送自定义表情消息。
 */
export async function sendWechatIpadEmoji(
  to: string,
  emoji: WechatIpadEmojiData,
  options: WechatIpadSendOptions = {},
): Promise<WechatIpadSendResult> {
  const ctx = resolveSendContext(options);
  const target = normalizeWechatIpadTarget(to);
  if (!target) return { ok: false, error: "未指定发送目标" };

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "WeChat iPad wxid 未配置（channels.wechat-ipad.accounts.<accountId>.wxid）",
    };
  }

  try {
    const result = await sendEmojiViaApi({
      options: ctx,
      wxid,
      toWxid: target,
      md5: emoji.md5,
      totalLen: emoji.totalLen,
    });
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── 消息撤回 ───

/**
 * 撤回已发送的消息。
 * 从 messageStore 中查找消息元数据后调用撤回 API。
 */
export async function revokeWechatIpadMessage(
  to: string,
  messageId: string,
  options: WechatIpadSendOptions = {},
): Promise<WechatIpadSendResult> {
  const ctx = resolveSendContext(options);
  const target = normalizeWechatIpadTarget(to);
  if (!target) return { ok: false, error: "未指定发送目标" };

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "WeChat iPad wxid 未配置（channels.wechat-ipad.accounts.<accountId>.wxid）",
    };
  }

  const accountId = ctx.account?.accountId ?? options.accountId ?? "";
  const store = accountId ? getWechatIpadMessageStore(accountId) : null;
  const stored = store?.lookup(messageId) ?? null;

  // 撤回需要 clientMsgId 和 createTime，从存储或 messageId 本身推导
  const clientMsgId = messageId;
  const newMsgId = messageId;
  const createTime = stored?.createTime ?? Math.trunc(Date.now() / 1000);

  try {
    await revokeMessageViaApi({
      options: ctx,
      wxid,
      toWxid: target,
      clientMsgId,
      newMsgId,
      createTime,
    });
    return { ok: true, messageId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── CDN 媒体转发 ───

/**
 * 转发 CDN 媒体（图片/视频/文件），根据类型分发到对应 CDN API。
 */
export async function forwardWechatIpadCdn(
  to: string,
  cdnForward: WechatIpadCdnForward,
  options: WechatIpadSendOptions = {},
): Promise<WechatIpadSendResult> {
  const ctx = resolveSendContext(options);
  const target = normalizeWechatIpadTarget(to);
  if (!target) return { ok: false, error: "未指定发送目标" };

  const wxid = ctx.wxid?.trim();
  if (!wxid) {
    return {
      ok: false,
      error: "WeChat iPad wxid 未配置（channels.wechat-ipad.accounts.<accountId>.wxid）",
    };
  }

  try {
    let result: { messageId?: string };
    const baseParams = {
      options: ctx,
      wxid,
      toWxid: target,
      content: cdnForward.content,
    };

    switch (cdnForward.type) {
      case "image":
        result = await sendCdnImageViaApi(baseParams);
        break;
      case "video":
        result = await sendCdnVideoViaApi(baseParams);
        break;
      case "file":
        result = await sendCdnFileViaApi(baseParams);
        break;
      default:
        return { ok: false, error: `不支持的 CDN 转发类型：${cdnForward.type}` };
    }
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
