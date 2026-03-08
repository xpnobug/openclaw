import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { resolveWechatIpadAccount } from "./accounts.js";
import { sendMediaViaApi, sendTextViaApi } from "./api.js";
import type { ResolvedWechatIpadAccount } from "./types.js";

const DEFAULT_TEXT_CHUNK_LIMIT = 1800;

export type WechatIpadSendOptions = {
  cfg?: OpenClawConfig;
  accountId?: string;
  baseUrl?: string;
  apiToken?: string;
  robotId?: string;
  wxid?: string;
  mediaUrl?: string;
};

export type WechatIpadSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
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
      wxid: options.wxid?.trim() || account.config.wxid?.trim() || undefined,
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
    return { ok: false, error: "No WeChat iPad wxid configured (channels.wechat-ipad.wxid)" };
  }

  const payload = text.trim();
  if (!payload) {
    return { ok: false, error: "No message content provided" };
  }

  try {
    const chunks = chunkWechatIpadText(payload);
    let messageId: string | undefined;

    for (const chunk of chunks) {
      const result = await sendTextViaApi({
        options: ctx,
        wxid,
        toWxid: target,
        text: chunk,
      });
      messageId = result.messageId ?? messageId;
    }

    return { ok: true, messageId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 发送媒体消息（可附带文本）。
 */
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
    return { ok: false, error: "No WeChat iPad wxid configured (channels.wechat-ipad.wxid)" };
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
