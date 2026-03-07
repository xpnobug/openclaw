/**
 * WeChat message polling for receiving inbound messages.
 * 微信消息轮询模块，用于接收入站消息
 *
 * 使用 /api/v1/chat/history 端点轮询新消息
 */

import { getChatHistory, getContactList, getChatRoomList, getRobotInfo } from "./api.js";
import { parseWeChatQuotedMessage, type WeChatQuotedMessage } from "./quote-parser.js";
import type {
  WeChatAppMessageType,
  WeChatChatHistoryItem,
  WeChatMessageType,
  WeChatPollingConfig,
} from "./types.js";

/** 引用消息上下文 */
export type WeChatInboundQuotedMessage = {
  messageId?: string;
  sender?: string;
  senderWxid?: string;
  chatId?: string;
  body: string;
  messageType?: number;
};

/** 入站消息类型 */
export type WeChatInboundMessage = {
  id: string; // 消息唯一标识（contactId:msgId）
  msgId: number; // 消息 ID
  from: string; // 来源（群聊为群 ID，私聊为发送者 wxid）
  senderWxid: string; // 发送者微信 ID
  senderNickname?: string; // 发送者昵称
  toWxid: string; // 接收者微信 ID
  body: string; // 消息内容
  timestamp: number; // 时间戳（毫秒）
  chatType: "direct" | "group"; // 聊天类型
  chatId: string; // 聊天 ID（联系人 ID）
  isAtMe: boolean; // 是否 @了我
  isRecalled: boolean; // 是否已撤回
  messageType: WeChatMessageType; // 消息类型
  appMessageType?: WeChatAppMessageType; // 应用消息子类型
  attachmentUrl?: string; // 附件 URL
  quotedMessage?: WeChatInboundQuotedMessage; // 被引用消息上下文
};

/** 轮询器配置选项 */
export type WeChatPollingOptions = {
  baseUrl: string; // API 服务地址
  apiToken: string; // API Token
  robotId: number; // 机器人 ID
  accountId: string; // 账户 ID
  pollingConfig?: WeChatPollingConfig; // 轮询配置
  onMessage: (msg: WeChatInboundMessage) => Promise<void>; // 消息回调
  onError?: (error: Error) => void; // 错误回调
  abortSignal?: AbortSignal; // 中止信号
};

type WeChatMessageCursor = {
  timestamp: number;
  msgId: number;
};

/** 默认轮询间隔（毫秒） */
const DEFAULT_POLLING_INTERVAL_MS = 3000;
/** 默认最大轮询联系人数 */
const DEFAULT_MAX_POLL_CONTACTS = 50;
/** 后端单页聊天记录条数（当前后端固定 20） */
const CHAT_HISTORY_PAGE_SIZE = 20;
/** 单次轮询每个联系人最多补拉页数，避免极端情况下无限翻页 */
const MAX_HISTORY_PAGES_PER_POLL = 10;
/** 启动时默认回看窗口，避免重启瞬间漏掉最近消息 */
const INITIAL_LOOKBACK_SECONDS = 120;
/** 轮询重叠窗口，覆盖秒级时间戳和后端写入延迟 */
const CURSOR_OVERLAP_SECONDS = 2;
/** seen 集合最大保留数 */
const MAX_SEEN_MESSAGE_IDS = 20000;
/** seen 集合裁剪后保留数 */
const TRIMMED_SEEN_MESSAGE_IDS = 10000;

function buildMessageKey(contactId: string, msgId: number): string {
  return `${contactId}:${msgId}`;
}

function compareCursor(a: WeChatMessageCursor, b: WeChatMessageCursor): number {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }
  return a.msgId - b.msgId;
}

function compareItemToCursor(item: WeChatChatHistoryItem, cursor: WeChatMessageCursor): number {
  return compareCursor({ timestamp: item.created_at, msgId: item.msg_id }, cursor);
}

function compareItemsAscending(a: WeChatChatHistoryItem, b: WeChatChatHistoryItem): number {
  const timestampDelta = a.created_at - b.created_at;
  if (timestampDelta !== 0) {
    return timestampDelta;
  }
  return a.msg_id - b.msg_id;
}

function maxCursor(
  current: WeChatMessageCursor,
  item: Pick<WeChatChatHistoryItem, "created_at" | "msg_id">,
): WeChatMessageCursor {
  const candidate = { timestamp: item.created_at, msgId: item.msg_id };
  return compareCursor(candidate, current) > 0 ? candidate : current;
}

function buildScanCursor(cursor: WeChatMessageCursor): WeChatMessageCursor {
  return {
    timestamp: Math.max(0, cursor.timestamp - CURSOR_OVERLAP_SECONDS),
    msgId: 0,
  };
}

function isQuotedReplyMessage(item: WeChatChatHistoryItem): boolean {
  return item.type === 49 && item.app_msg_type === 57;
}

function isSupportedInboundMessage(item: WeChatChatHistoryItem): boolean {
  return item.type === 1 || isQuotedReplyMessage(item);
}

function fallbackMessageBody(item: WeChatChatHistoryItem): string {
  // 微信后端的 display_full_content 在群聊 @ 场景下经常是“某某在群聊中@了你”这类系统提示，
  // 不能覆盖真实用户正文，否则 Agent 只会看到提示语而看不到实际消息内容。
  return item.content?.trim() || item.display_full_content?.trim() || "";
}

function buildQuotedInboundContext(
  quotedMessage: WeChatQuotedMessage | null,
): WeChatInboundQuotedMessage | undefined {
  if (!quotedMessage?.quotedBody?.trim()) {
    return undefined;
  }
  return {
    messageId: quotedMessage.quotedMessageId,
    sender: quotedMessage.quotedSender,
    senderWxid: quotedMessage.quotedSenderWxid,
    chatId: quotedMessage.quotedChatId,
    body: quotedMessage.quotedBody.trim(),
    messageType: quotedMessage.quotedMessageType,
  };
}

/**
 * WeChat message poller class.
 * 微信消息轮询器类
 */
export class WeChatMessagePoller {
  private readonly options: WeChatPollingOptions;
  /** 已处理的消息 ID 集合（用于去重） */
  private readonly seenMessageIds = new Set<string>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  /** 每个联系人的最后已确认游标 */
  private readonly lastPollCursors = new Map<string, WeChatMessageCursor>();
  /** 机器人微信 ID */
  private robotWxid: string | null = null;
  /** 机器人昵称 */
  private robotNickname: string | null = null;

  constructor(options: WeChatPollingOptions) {
    this.options = options;
  }

  /**
   * Start polling for messages.
   * 启动消息轮询
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[微信] 轮询已启动`);

    if (this.options.abortSignal) {
      if (this.options.abortSignal.aborted) {
        this.stop();
        return;
      }
      this.options.abortSignal.addEventListener(
        "abort",
        () => {
          console.log(`[微信] 收到中止信号，停止轮询`);
          this.stop();
        },
        { once: true },
      );
    }

    try {
      const robotInfo = await getRobotInfo({
        baseUrl: this.options.baseUrl,
        apiToken: this.options.apiToken,
        robotId: this.options.robotId,
      });
      this.robotWxid = robotInfo.data?.wechat_id ?? null;
      this.robotNickname = robotInfo.data?.nickname ?? null;
      if (this.robotNickname) {
        console.log(`[微信] 机器人昵称: ${this.robotNickname}`);
      }
    } catch {
      // 忽略获取机器人信息时的错误
    }

    // 预热联系人游标，但不要直接跳到当前时间，否则重启时容易漏掉刚到达的消息。
    const contactIds = await this.resolveContactIds();
    for (const contactId of contactIds) {
      this.ensureContactCursor(contactId);
    }

    this.schedulePoll();
  }

  /**
   * Stop polling.
   * 停止轮询
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Schedule next poll.
   * 调度下一次轮询
   */
  private schedulePoll(): void {
    if (!this.isRunning) return;

    const intervalMs = this.options.pollingConfig?.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS;

    this.pollTimer = setTimeout(async () => {
      if (!this.isRunning) return;
      if (this.options.abortSignal?.aborted) {
        this.stop();
        return;
      }

      try {
        await this.poll();
      } catch (error) {
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }

      this.schedulePoll();
    }, intervalMs);
  }

  /**
   * Resolve contact IDs to poll.
   * 解析要轮询的联系人 ID 列表
   */
  private async resolveContactIds(): Promise<string[]> {
    const config = this.options.pollingConfig;

    if (config?.pollContactIds && config.pollContactIds.length > 0) {
      return config.pollContactIds;
    }

    if (config?.pollAllContacts) {
      const contactIds: string[] = [];
      const maxContacts = config.maxPollContacts ?? DEFAULT_MAX_POLL_CONTACTS;

      try {
        const friendsResponse = await getContactList(
          {
            baseUrl: this.options.baseUrl,
            apiToken: this.options.apiToken,
            robotId: this.options.robotId,
          },
          "friend",
        );
        for (const contact of friendsResponse.data ?? []) {
          if (contactIds.length >= maxContacts) break;
          contactIds.push(contact.wechat_id);
        }

        if (contactIds.length < maxContacts) {
          const roomsResponse = await getChatRoomList({
            baseUrl: this.options.baseUrl,
            apiToken: this.options.apiToken,
            robotId: this.options.robotId,
          });
          for (const room of roomsResponse.data ?? []) {
            if (contactIds.length >= maxContacts) break;
            contactIds.push(room.wechat_id);
          }
        }
      } catch {
        // 忽略获取联系人列表时的错误
      }

      return contactIds;
    }

    return [];
  }

  /**
   * Poll for new messages.
   * 轮询新消息
   */
  private async poll(): Promise<void> {
    const contactIds = await this.resolveContactIds();
    if (contactIds.length === 0) return;

    for (const contactId of contactIds) {
      if (!this.isRunning) break;
      if (this.options.abortSignal?.aborted) break;

      try {
        await this.pollContact(contactId);
      } catch (error) {
        console.error(`[微信] 轮询错误 (${contactId}):`, error);
      }
    }
  }

  private ensureContactCursor(contactId: string): WeChatMessageCursor {
    const existing = this.lastPollCursors.get(contactId);
    if (existing) {
      return existing;
    }

    const initialCursor = {
      timestamp: Math.max(0, Math.floor(Date.now() / 1000) - INITIAL_LOOKBACK_SECONDS),
      msgId: 0,
    };
    this.lastPollCursors.set(contactId, initialCursor);
    return initialCursor;
  }

  private rememberSeenMessage(messageKey: string): void {
    if (this.seenMessageIds.has(messageKey)) {
      this.seenMessageIds.delete(messageKey);
    }
    this.seenMessageIds.add(messageKey);

    if (this.seenMessageIds.size <= MAX_SEEN_MESSAGE_IDS) {
      return;
    }

    const staleIds = Array.from(this.seenMessageIds).slice(
      0,
      this.seenMessageIds.size - TRIMMED_SEEN_MESSAGE_IDS,
    );
    for (const id of staleIds) {
      this.seenMessageIds.delete(id);
    }
  }

  private async pollContact(contactId: string): Promise<void> {
    const committedCursor = this.ensureContactCursor(contactId);
    const scanCursor = buildScanCursor(committedCursor);
    const items = await this.fetchPendingMessages(contactId, scanCursor);
    if (items.length === 0) {
      return;
    }

    let nextCursor = committedCursor;

    for (const item of items) {
      const messageKey = buildMessageKey(contactId, item.msg_id);

      if (this.seenMessageIds.has(messageKey)) {
        nextCursor = maxCursor(nextCursor, item);
        continue;
      }

      if (item.message_source === "robot") {
        this.rememberSeenMessage(messageKey);
        nextCursor = maxCursor(nextCursor, item);
        continue;
      }
      if (this.robotWxid && item.sender_wxid === this.robotWxid) {
        this.rememberSeenMessage(messageKey);
        nextCursor = maxCursor(nextCursor, item);
        continue;
      }
      if (item.is_recalled) {
        this.rememberSeenMessage(messageKey);
        nextCursor = maxCursor(nextCursor, item);
        continue;
      }
      if (!isSupportedInboundMessage(item)) {
        this.rememberSeenMessage(messageKey);
        nextCursor = maxCursor(nextCursor, item);
        continue;
      }

      const inboundMessage = this.convertToInboundMessage(item, contactId);
      const sender = item.sender_nickname ?? item.sender_wxid;
      const content =
        inboundMessage.body.length > 50
          ? inboundMessage.body.substring(0, 50) + "..."
          : inboundMessage.body;
      const atMe = inboundMessage.isAtMe ? " [@]" : "";
      const quoted = inboundMessage.quotedMessage ? " [引用]" : "";
      console.log(`[微信] 收到消息 ${sender}${atMe}${quoted}: ${content}`);

      await this.options.onMessage(inboundMessage);
      this.rememberSeenMessage(messageKey);
      nextCursor = maxCursor(nextCursor, item);
    }

    this.lastPollCursors.set(contactId, nextCursor);
  }

  private async fetchPendingMessages(
    contactId: string,
    scanCursor: WeChatMessageCursor,
  ): Promise<WeChatChatHistoryItem[]> {
    const pendingItems = new Map<string, WeChatChatHistoryItem>();

    for (let pageIndex = 1; pageIndex <= MAX_HISTORY_PAGES_PER_POLL; pageIndex += 1) {
      const response = await getChatHistory({
        baseUrl: this.options.baseUrl,
        apiToken: this.options.apiToken,
        robotId: this.options.robotId,
        contactId,
        pageIndex,
        pageSize: CHAT_HISTORY_PAGE_SIZE,
      });

      const items = response.data?.items ?? [];
      if (items.length === 0) {
        break;
      }

      for (const item of items) {
        if (compareItemToCursor(item, scanCursor) > 0) {
          pendingItems.set(buildMessageKey(contactId, item.msg_id), item);
        }
      }

      const oldestItem = items[items.length - 1];
      const reachedCommittedWindow = compareItemToCursor(oldestItem, scanCursor) <= 0;
      if (reachedCommittedWindow) {
        break;
      }
      if (items.length < CHAT_HISTORY_PAGE_SIZE) {
        break;
      }
    }

    return Array.from(pendingItems.values()).sort(compareItemsAscending);
  }

  /**
   * Convert chat history item to inbound message.
   * 将聊天记录项转换为入站消息
   */
  private convertToInboundMessage(
    item: WeChatChatHistoryItem,
    contactId: string,
  ): WeChatInboundMessage {
    const isChatRoom = item.is_chat_room || contactId.endsWith("@chatroom");
    const content = item.content || "";
    const displayContent = item.display_full_content || "";
    const quotedMessage = isQuotedReplyMessage(item)
      ? parseWeChatQuotedMessage({
          content,
          displayFullContent: displayContent,
        })
      : null;
    const messageBody = quotedMessage?.currentBody?.trim() || fallbackMessageBody(item);

    let isAtMe = item.is_atme;
    if (!isAtMe && displayContent.includes("@了你")) {
      isAtMe = true;
    }
    if (!isAtMe && this.robotNickname && content) {
      isAtMe = content.includes(`@${this.robotNickname}`);
    }

    if (isChatRoom) {
      console.log(
        `[微信] @检测: api.is_atme=${item.is_atme}, robotNickname=${this.robotNickname}, content前30字="${content.slice(0, 30)}", 最终isAtMe=${isAtMe}`,
      );
    }

    return {
      id: buildMessageKey(contactId, item.msg_id),
      msgId: item.msg_id,
      from: isChatRoom ? contactId : item.sender_wxid,
      senderWxid: item.sender_wxid,
      senderNickname: item.sender_nickname,
      toWxid: item.to_wxid,
      body: messageBody,
      timestamp: item.created_at * 1000,
      chatType: isChatRoom ? "group" : "direct",
      chatId: contactId,
      isAtMe,
      isRecalled: item.is_recalled,
      messageType: item.type,
      appMessageType: item.app_msg_type,
      attachmentUrl: item.attachment_url,
      quotedMessage: buildQuotedInboundContext(quotedMessage),
    };
  }
}

/**
 * Create and start a WeChat message poller.
 * 创建并启动微信消息轮询器
 */
export function createWeChatPoller(options: WeChatPollingOptions): WeChatMessagePoller {
  return new WeChatMessagePoller(options);
}
