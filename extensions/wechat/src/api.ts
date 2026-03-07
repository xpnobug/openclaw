/**
 * WeChat Robot Admin Backend API client.
 * 微信机器人后台 API 客户端
 * @see wechat-robot-admin-backend documentation
 */

import type {
  WeChatApiResponse,
  WeChatChatHistoryItem,
  WeChatChatRoom,
  WeChatContact,
  WeChatRobotInfo,
  WeChatRobotState,
  WeChatSendMessageResult,
} from "./types.js";

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 10000;

export type WeChatFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** API 调用错误 */
export class WeChatApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly response?: string,
  ) {
    super(message);
    this.name = "WeChatApiError";
  }
}

/** API 调用参数 */
export type WeChatApiCallOptions = {
  baseUrl: string; // API 服务地址
  apiToken: string; // API 访问令牌
  robotId: number; // 机器人 ID
  timeoutMs?: number; // 超时时间（毫秒）
  fetch?: WeChatFetch; // 自定义 fetch 函数
};

function createAbortContext(options: WeChatApiCallOptions) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetcher = options.fetch ?? fetch;
  return { controller, timeoutId, fetcher };
}

async function parseApiResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<WeChatApiResponse<T>> {
  const data = (await response.json()) as WeChatApiResponse<T>;
  if (data.code !== 200) {
    throw new WeChatApiError(data.message ?? fallbackMessage, data.code, JSON.stringify(data));
  }
  return data;
}

/**
 * Generic API call helper.
 * 通用 API 调用辅助函数
 */
async function callApi<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  options: WeChatApiCallOptions,
  body?: Record<string, unknown>,
): Promise<WeChatApiResponse<T>> {
  const { baseUrl, apiToken, robotId } = options;
  const url = new URL(endpoint, baseUrl);
  url.searchParams.set("id", String(robotId));

  const { controller, timeoutId, fetcher } = createAbortContext(options);

  try {
    const response = await fetcher(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    return await parseApiResponse<T>(response, `API error: ${endpoint}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callMultipartApi<T = WeChatSendMessageResult>(params: {
  endpoint: string;
  options: WeChatApiCallOptions;
  fieldName: string;
  filename: string;
  data: Buffer | Uint8Array;
  mimeType: string;
  extraFields: Record<string, string>;
  errorMessage: string;
}): Promise<WeChatApiResponse<T>> {
  const { endpoint, options, fieldName, filename, data, mimeType, extraFields, errorMessage } =
    params;
  const url = new URL(endpoint, options.baseUrl);
  url.searchParams.set("id", String(options.robotId));

  const { controller, timeoutId, fetcher } = createAbortContext(options);

  try {
    const formData = new FormData();
    formData.append("id", String(options.robotId));
    for (const [key, value] of Object.entries(extraFields)) {
      formData.append(key, value);
    }
    const blob = new Blob([new Uint8Array(data)], { type: mimeType });
    formData.append(fieldName, blob, filename);

    const response = await fetcher(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiToken}`,
      },
      body: formData,
      signal: controller.signal,
    });

    return await parseApiResponse<T>(response, errorMessage);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get robot state/status.
 * 获取机器人状态
 */
export async function getRobotState(
  options: WeChatApiCallOptions,
): Promise<WeChatApiResponse<WeChatRobotState>> {
  return callApi<WeChatRobotState>("GET", "/api/v1/robot/state", options);
}

/**
 * Get robot info including wechat_id.
 * 获取机器人信息（包含微信 ID）
 */
export async function getRobotInfo(
  options: WeChatApiCallOptions,
): Promise<WeChatApiResponse<WeChatRobotInfo>> {
  return callApi<WeChatRobotInfo>("GET", "/api/v1/robot/view", options);
}

/**
 * Send text message.
 * 发送文本消息
 */
export async function sendTextMessage(
  options: WeChatApiCallOptions,
  params: { to_wxid: string; content: string; at?: string[] },
): Promise<WeChatApiResponse<WeChatSendMessageResult>> {
  return callApi<WeChatSendMessageResult>("POST", "/api/v1/message/send/text", options, {
    id: options.robotId,
    ...params,
  });
}

/**
 * Send long text message.
 * 发送长文本消息
 */
export async function sendLongTextMessage(
  options: WeChatApiCallOptions,
  params: { to_wxid: string; content: string },
): Promise<WeChatApiResponse<WeChatSendMessageResult>> {
  return callApi<WeChatSendMessageResult>("POST", "/api/v1/message/send/longtext", options, {
    id: options.robotId,
    ...params,
  });
}

/**
 * Revoke message.
 * 撤回消息
 */
export async function revokeMessage(
  options: WeChatApiCallOptions,
  params: { message_id: number },
): Promise<WeChatApiResponse<null>> {
  return callApi<null>("POST", "/api/v1/message/revoke", options, {
    id: options.robotId,
    ...params,
  });
}

/**
 * Send image message (multipart/form-data upload).
 * 发送图片消息（表单上传方式）
 */
export async function sendImageMessage(
  options: WeChatApiCallOptions,
  params: { to_wxid: string; imageData: Buffer | Uint8Array; filename: string },
): Promise<WeChatApiResponse<WeChatSendMessageResult>> {
  const ext = params.filename.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return await callMultipartApi<WeChatSendMessageResult>({
    endpoint: "/api/v1/message/send/image",
    options,
    fieldName: "image",
    filename: params.filename,
    data: params.imageData,
    mimeType: mimeMap[ext] ?? "image/jpeg",
    extraFields: { to_wxid: params.to_wxid },
    errorMessage: "Failed to send image message",
  });
}

/**
 * Send voice message (multipart/form-data upload).
 * 发送语音消息（表单上传方式）
 */
export async function sendVoiceMessage(
  options: WeChatApiCallOptions,
  params: { to_wxid: string; voiceData: Buffer | Uint8Array; filename?: string },
): Promise<WeChatApiResponse<WeChatSendMessageResult>> {
  return await callMultipartApi<WeChatSendMessageResult>({
    endpoint: "/api/v1/message/send/voice",
    options,
    fieldName: "voice",
    filename: params.filename ?? "voice.mp3",
    data: params.voiceData,
    mimeType: "audio/mpeg",
    extraFields: { to_wxid: params.to_wxid },
    errorMessage: "Failed to send voice message",
  });
}

/**
 * Send video message (multipart/form-data upload).
 * 发送视频消息（表单上传方式）
 */
export async function sendVideoMessage(
  options: WeChatApiCallOptions,
  params: { to_wxid: string; videoData: Buffer | Uint8Array; filename: string },
): Promise<WeChatApiResponse<WeChatSendMessageResult>> {
  const ext = params.filename.split(".").pop()?.toLowerCase() ?? "mp4";
  const mimeMap: Record<string, string> = {
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    flv: "video/x-flv",
    webm: "video/webm",
  };
  return await callMultipartApi<WeChatSendMessageResult>({
    endpoint: "/api/v1/message/send/video",
    options,
    fieldName: "video",
    filename: params.filename,
    data: params.videoData,
    mimeType: mimeMap[ext] ?? "video/mp4",
    extraFields: { to_wxid: params.to_wxid },
    errorMessage: "Failed to send video message",
  });
}

/**
 * Upload one file chunk.
 * 上传单个文件分片
 */
export async function sendFileChunkMessage(
  options: WeChatApiCallOptions,
  params: {
    to_wxid: string;
    chunkData: Buffer | Uint8Array;
    chunkFilename: string;
    client_app_data_id: string;
    filename: string;
    file_hash: string;
    file_size: number;
    chunk_index: number;
    total_chunks: number;
  },
): Promise<WeChatApiResponse<WeChatSendMessageResult>> {
  return await callMultipartApi<WeChatSendMessageResult>({
    endpoint: "/api/v1/message/send/file",
    options,
    fieldName: "chunk",
    filename: params.chunkFilename,
    data: params.chunkData,
    mimeType: "application/octet-stream",
    extraFields: {
      to_wxid: params.to_wxid,
      client_app_data_id: params.client_app_data_id,
      filename: params.filename,
      file_hash: params.file_hash,
      file_size: String(params.file_size),
      chunk_index: String(params.chunk_index),
      total_chunks: String(params.total_chunks),
    },
    errorMessage: "Failed to send file message",
  });
}

/**
 * Get contact list (friends or chat rooms).
 * 获取联系人列表（好友或群聊）
 */
export async function getContactList(
  options: WeChatApiCallOptions,
  type: "friend" | "chat_room" = "friend",
): Promise<WeChatApiResponse<WeChatContact[]>> {
  const { baseUrl, apiToken, robotId } = options;
  const url = new URL("/api/v1/contact/list", baseUrl);
  url.searchParams.set("id", String(robotId));
  url.searchParams.set("type", type);

  const { controller, timeoutId, fetcher } = createAbortContext(options);

  try {
    const response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      signal: controller.signal,
    });

    return await parseApiResponse<WeChatContact[]>(response, "Failed to get contact list");
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get chat room list.
 * 获取群聊列表
 */
export async function getChatRoomList(
  options: WeChatApiCallOptions,
): Promise<WeChatApiResponse<WeChatChatRoom[]>> {
  return getContactList(options, "chat_room") as Promise<WeChatApiResponse<WeChatChatRoom[]>>;
}

/**
 * Get chat room members.
 * 获取群成员列表
 */
export async function getChatRoomMembers(
  options: WeChatApiCallOptions,
  chatRoomId: string,
): Promise<WeChatApiResponse<WeChatContact[]>> {
  const { baseUrl, apiToken, robotId } = options;
  const url = new URL("/api/v1/chat-room/members", baseUrl);
  url.searchParams.set("id", String(robotId));
  url.searchParams.set("chat_room_id", chatRoomId);

  const { controller, timeoutId, fetcher } = createAbortContext(options);

  try {
    const response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      signal: controller.signal,
    });

    return await parseApiResponse<WeChatContact[]>(response, "Failed to get chat room members");
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 聊天记录查询参数 */
export type GetChatHistoryOptions = WeChatApiCallOptions & {
  contactId: string; // 联系人 ID（好友 wxid 或群聊 ID）
  keyword?: string; // 搜索关键词
  pageIndex?: number; // 页码（从 1 开始）
  pageSize?: number; // 每页数量
};

/**
 * Get chat history for a contact.
 * 获取与联系人的聊天记录
 */
export async function getChatHistory(
  options: GetChatHistoryOptions,
): Promise<WeChatApiResponse<{ items: WeChatChatHistoryItem[]; total: number }>> {
  const { baseUrl, apiToken, robotId, contactId, keyword, pageIndex = 1, pageSize = 20 } = options;
  const url = new URL("/api/v1/chat/history", baseUrl);
  url.searchParams.set("id", String(robotId));
  url.searchParams.set("contact_id", contactId);
  if (keyword) url.searchParams.set("keyword", keyword);
  url.searchParams.set("page_index", String(pageIndex));
  url.searchParams.set("page_size", String(pageSize));

  const { controller, timeoutId, fetcher } = createAbortContext(options);

  try {
    const response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      signal: controller.signal,
    });

    return await parseApiResponse<{ items: WeChatChatHistoryItem[]; total: number }>(
      response,
      "Failed to get chat history",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
