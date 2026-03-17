/**
 * WeChat message sending module.
 * 微信消息发送模块
 *
 * 支持发送文本、长文本、图片、语音、视频和文件消息
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { MoltbotConfig } from "openclaw/plugin-sdk/wechat";
import { resolveWeChatAccount } from "./accounts.js";
import {
  revokeMessage,
  sendFileChunkMessage,
  sendImageMessage,
  sendLongTextMessage,
  sendTextMessage,
  sendVideoMessage,
  sendVoiceMessage,
} from "./api.js";

const DEFAULT_LONG_TEXT_THRESHOLD = 2000;
const FILE_CHUNK_SIZE = 50_000;
const MEDIA_PATH_PREFIX = "MEDIA:";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const VOICE_EXTENSIONS = new Set([".amr", ".mp3", ".wav", ".m4a", ".ogg", ".aac"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".avi", ".mov", ".mkv", ".flv", ".webm"]);

type WeChatMediaKind = "image" | "voice" | "video" | "file";

type ResolvedMediaInput = {
  data: Uint8Array;
  filename: string;
  kind: WeChatMediaKind;
};

function resolveLongTextThreshold(options: WeChatSendOptions): number {
  if (!options.cfg) {
    return DEFAULT_LONG_TEXT_THRESHOLD;
  }
  const account = resolveWeChatAccount({
    cfg: options.cfg,
    accountId: options.accountId,
  });
  const configuredThreshold = account.config.longTextThreshold;
  if (typeof configuredThreshold !== "number" || !Number.isFinite(configuredThreshold)) {
    return DEFAULT_LONG_TEXT_THRESHOLD;
  }
  const normalizedThreshold = Math.floor(configuredThreshold);
  return normalizedThreshold > 0 ? normalizedThreshold : DEFAULT_LONG_TEXT_THRESHOLD;
}

/** 发送选项 */
export type WeChatSendOptions = {
  apiToken?: string; // API Token（可选，优先使用）
  baseUrl?: string; // API 服务地址（可选，优先使用）
  robotId?: number; // 机器人 ID（可选，优先使用）
  accountId?: string; // 账户 ID
  cfg?: MoltbotConfig; // 配置对象
  mediaUrl?: string; // 媒体 URL 或本地路径
  voiceFilePath?: string; // 语音文件路径（发送语音时使用）
  at?: string[]; // 群聊中 @的用户 wxid 列表
};

/** 发送结果 */
export type WeChatSendResult = {
  ok: boolean; // 是否成功
  messageId?: string; // 消息 ID
  error?: string; // 错误信息
};

function resolveSendContext(options: WeChatSendOptions): {
  baseUrl: string;
  apiToken: string;
  robotId: number;
} {
  if (options.cfg) {
    const account = resolveWeChatAccount({
      cfg: options.cfg,
      accountId: options.accountId,
    });
    return {
      baseUrl: options.baseUrl ?? account.baseUrl,
      apiToken: options.apiToken ?? account.apiToken,
      robotId: options.robotId ?? account.robotId,
    };
  }

  return {
    baseUrl: options.baseUrl ?? "http://localhost:9000",
    apiToken: options.apiToken ?? "",
    robotId: options.robotId ?? 1,
  };
}

function trimMediaPathPrefix(raw: string): string {
  return raw.startsWith(MEDIA_PATH_PREFIX) ? raw.slice(MEDIA_PATH_PREFIX.length) : raw;
}

function guessMediaKind(params: {
  filename: string;
  contentType?: string | null;
}): WeChatMediaKind {
  const ext = path.extname(params.filename).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (VOICE_EXTENSIONS.has(ext)) {
    return "voice";
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return "video";
  }

  const contentType = params.contentType?.toLowerCase() ?? "";
  if (contentType.startsWith("image/")) {
    return "image";
  }
  if (contentType.startsWith("audio/")) {
    return "voice";
  }
  if (contentType.startsWith("video/")) {
    return "video";
  }
  return "file";
}

async function loadMediaFromUrl(mediaUrl: string): Promise<ResolvedMediaInput> {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }

  const urlPath = new URL(mediaUrl).pathname;
  const fallbackFilename = urlPath.split("/").pop() || "attachment";
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const filenameToken = contentDisposition
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("filename=") || entry.startsWith("filename*="));
  const rawFilename = filenameToken
    ? filenameToken
        .split("=")
        .slice(1)
        .join("=")
        .replace(/^UTF-8''/, "")
    : fallbackFilename;
  const filename = decodeURIComponent(rawFilename.replace(/^"/, "").replace(/"$/, ""));
  const contentType = response.headers.get("content-type");
  return {
    data: new Uint8Array(await response.arrayBuffer()),
    filename,
    kind: guessMediaKind({ filename, contentType }),
  };
}

async function loadMediaFromFile(filePath: string): Promise<ResolvedMediaInput> {
  const normalizedPath = trimMediaPathPrefix(filePath);
  const fileData = await fs.promises.readFile(normalizedPath);
  const filename = path.basename(normalizedPath) || "attachment";
  return {
    data: new Uint8Array(fileData),
    filename,
    kind: guessMediaKind({ filename }),
  };
}

async function resolveMediaInput(mediaUrl: string): Promise<ResolvedMediaInput> {
  const normalized = trimMediaPathPrefix(mediaUrl);
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return await loadMediaFromUrl(normalized);
  }
  return await loadMediaFromFile(normalized);
}

async function sendPlainText(params: {
  baseUrl: string;
  apiToken: string;
  robotId: number;
  toWxid: string;
  text: string;
  at?: string[];
  longTextThreshold: number;
}): Promise<string | undefined> {
  const trimmed = params.text.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!params.at?.length && trimmed.length > params.longTextThreshold) {
    const response = await sendLongTextMessage(
      {
        baseUrl: params.baseUrl,
        apiToken: params.apiToken,
        robotId: params.robotId,
      },
      {
        to_wxid: params.toWxid,
        content: trimmed,
      },
    );
    return response.data?.message_id;
  }

  const response = await sendTextMessage(
    {
      baseUrl: params.baseUrl,
      apiToken: params.apiToken,
      robotId: params.robotId,
    },
    {
      to_wxid: params.toWxid,
      content: trimmed,
      at: params.at,
    },
  );
  return response.data?.message_id;
}

async function sendFileInChunks(params: {
  baseUrl: string;
  apiToken: string;
  robotId: number;
  toWxid: string;
  fileData: Uint8Array;
  filename: string;
}): Promise<string | undefined> {
  const clientAppDataId = crypto.randomUUID();
  const fileHash = crypto.createHash("md5").update(params.fileData).digest("hex");
  const totalChunks = Math.ceil(params.fileData.length / FILE_CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * FILE_CHUNK_SIZE;
    const end = Math.min(start + FILE_CHUNK_SIZE, params.fileData.length);
    const chunkData = params.fileData.slice(start, end);
    const response = await sendFileChunkMessage(
      {
        baseUrl: params.baseUrl,
        apiToken: params.apiToken,
        robotId: params.robotId,
      },
      {
        to_wxid: params.toWxid,
        chunkData,
        chunkFilename: `${params.filename}.part${chunkIndex + 1}`,
        client_app_data_id: clientAppDataId,
        filename: params.filename,
        file_hash: fileHash,
        file_size: params.fileData.length,
        chunk_index: chunkIndex,
        total_chunks: totalChunks,
      },
    );

    if (chunkIndex === totalChunks - 1 && response.data?.message_id) {
      return response.data.message_id;
    }
  }

  return undefined;
}

/**
 * Send message to WeChat user or group.
 * 发送消息到微信用户或群聊
 */
export async function sendMessageWeChat(
  toWxid: string,
  text: string,
  options: WeChatSendOptions = {},
): Promise<WeChatSendResult> {
  const { baseUrl, apiToken, robotId } = resolveSendContext(options);
  const longTextThreshold = resolveLongTextThreshold(options);

  if (!apiToken) {
    return { ok: false, error: "No WeChat API token configured" };
  }

  const normalizedTo = toWxid?.trim();
  if (!normalizedTo) {
    return { ok: false, error: "No to_wxid provided" };
  }

  try {
    if (options.voiceFilePath) {
      const voiceData = await fs.promises.readFile(options.voiceFilePath);
      const filename = path.basename(options.voiceFilePath) || "voice.mp3";
      const mediaResponse = await sendVoiceMessage(
        { baseUrl, apiToken, robotId },
        { to_wxid: normalizedTo, voiceData, filename },
      );
      const textMessageId = await sendPlainText({
        baseUrl,
        apiToken,
        robotId,
        toWxid: normalizedTo,
        text,
        at: options.at,
        longTextThreshold,
      });
      return { ok: true, messageId: mediaResponse.data?.message_id ?? textMessageId };
    }

    if (options.mediaUrl) {
      const media = await resolveMediaInput(options.mediaUrl);
      let messageId: string | undefined;

      if (media.kind === "image") {
        const response = await sendImageMessage(
          { baseUrl, apiToken, robotId },
          { to_wxid: normalizedTo, imageData: media.data, filename: media.filename },
        );
        messageId = response.data?.message_id;
      } else if (media.kind === "voice") {
        const response = await sendVoiceMessage(
          { baseUrl, apiToken, robotId },
          { to_wxid: normalizedTo, voiceData: media.data, filename: media.filename },
        );
        messageId = response.data?.message_id;
      } else if (media.kind === "video") {
        const response = await sendVideoMessage(
          { baseUrl, apiToken, robotId },
          { to_wxid: normalizedTo, videoData: media.data, filename: media.filename },
        );
        messageId = response.data?.message_id;
      } else {
        messageId = await sendFileInChunks({
          baseUrl,
          apiToken,
          robotId,
          toWxid: normalizedTo,
          fileData: media.data,
          filename: media.filename,
        });
      }

      const textMessageId = await sendPlainText({
        baseUrl,
        apiToken,
        robotId,
        toWxid: normalizedTo,
        text,
        at: options.at,
        longTextThreshold,
      });
      return { ok: true, messageId: messageId ?? textMessageId };
    }

    if (!text?.trim()) {
      return { ok: false, error: "No message content provided" };
    }

    const messageId = await sendPlainText({
      baseUrl,
      apiToken,
      robotId,
      toWxid: normalizedTo,
      text,
      at: options.at,
      longTextThreshold,
    });
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Revoke a WeChat message.
 * 撤回一条微信消息
 */
export async function revokeMessageWeChat(
  messageId: number,
  options: WeChatSendOptions = {},
): Promise<WeChatSendResult> {
  const { baseUrl, apiToken, robotId } = resolveSendContext(options);
  if (!apiToken) {
    return { ok: false, error: "No WeChat API token configured" };
  }
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return { ok: false, error: "Invalid message_id provided" };
  }

  try {
    await revokeMessage({ baseUrl, apiToken, robotId }, { message_id: messageId });
    return { ok: true, messageId: String(messageId) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
