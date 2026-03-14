import { collectInboundContactIds, listContactIdsViaApi, pollInboundMessages } from "../api/api.js";
import type { WechatIpadInboundMessage, WechatIpadPollingConfig } from "../types.js";

export type WechatIpadPollingOptions = {
  baseUrl: string;
  apiToken: string;
  robotId: string;
  wxid: string;
  accountId: string;
  pollingConfig: Required<WechatIpadPollingConfig>;
  onMessage: (msg: WechatIpadInboundMessage) => Promise<void>;
  onError?: (error: Error) => void;
  abortSignal?: AbortSignal;
  log?: (message: string) => void;
};

const MAX_GLOBAL_SEEN = 20000;
const TRIM_GLOBAL_SEEN_TO = 10000;
const SYNC_BATCH_SIZE = 50;
const SELF_MSG_SOURCE_MARKER =
  ":\n<msgsource><bizflag>0</bizflag><silence>0</silence><membercount>0</membercount><signature>0</signature><tmp_node>0</tmp_node><sec_msg_node><alnode><fr>0</fr></alnode></sec_msg_node></msgsource>";
const SUPPORTED_INBOUND_CONTENT_TYPES = new Set([
  "text",
  "quote",
  "image",
  "voice",
  "video",
  "file",
  "link",
  "emoji",
  "card",
  "location",
]);

function buildSeenKey(accountId: string, chatId: string, id: string): string {
  return `${accountId}:${chatId}:${id}`;
}

function normalizeMessageId(msg: WechatIpadInboundMessage): string {
  const id = msg.msgId?.trim();
  if (id) {
    return id;
  }
  return `${msg.chatId}:${msg.timestamp}:${msg.senderId}`;
}

function buildLogPrefix(accountId: string): string {
  return `wechat-ipad[${accountId}]`;
}

/**
 * wechat-ipad 轮询器（MVP）。
 */
export class WechatIpadMessagePoller {
  private readonly options: WechatIpadPollingOptions;
  private readonly seen = new Set<string>();
  private readonly lastTimestampByContact = new Map<string, number>();
  private readonly knownContactIds = new Set<string>();
  private currentWxcontactSeq = 0;
  private currentChatRoomContactSeq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(options: WechatIpadPollingOptions) {
    this.options = options;
  }

  private log(message: string): void {
    this.options.log?.(`${buildLogPrefix(this.options.accountId)}: ${message}`);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.log(
      `轮询已启动（wxid=${this.options.wxid}，pollContactIds=${this.options.pollingConfig.pollContactIds.join(",") || "无"}，pollAllContacts=${this.options.pollingConfig.pollAllContacts}）`,
    );

    if (this.options.abortSignal?.aborted) {
      this.stop();
      return;
    }

    this.options.abortSignal?.addEventListener(
      "abort",
      () => {
        this.stop();
      },
      { once: true },
    );

    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      if (!this.running) return;
      if (this.options.abortSignal?.aborted) {
        this.stop();
        return;
      }

      try {
        await this.pollOnce();
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        this.log(`轮询异常：${normalizedError.message}`);
        this.options.onError?.(normalizedError);
      }

      this.schedule();
    }, this.options.pollingConfig.intervalMs);
  }

  private async pollOnce(): Promise<void> {
    const contacts = await this.resolveContacts();
    if (contacts.length === 0) {
      return;
    }

    for (const contactId of contacts) {
      await this.pollContact(contactId);
    }
  }

  private async resolveContacts(): Promise<string[]> {
    const cfg = this.options.pollingConfig;
    if (cfg.pollContactIds.length > 0) {
      return cfg.pollContactIds;
    }
    if (cfg.pollAllContacts) {
      try {
        const response = await listContactIdsViaApi({
          options: {
            baseUrl: this.options.baseUrl,
            apiToken: this.options.apiToken,
            robotId: this.options.robotId,
          },
          wxid: this.options.wxid,
          currentWxcontactSeq: this.currentWxcontactSeq,
          currentChatRoomContactSeq: this.currentChatRoomContactSeq,
        });
        this.currentWxcontactSeq = response.currentWxcontactSeq;
        this.currentChatRoomContactSeq = response.currentChatRoomContactSeq;
        for (const contactId of response.contactIds) {
          this.knownContactIds.add(contactId);
        }
        if (this.knownContactIds.size > 0) {
          return Array.from(this.knownContactIds);
        }
      } catch {
        // 通讯录接口不可用时，回退到 Sync 推导联系人，避免阻断入站轮询。
      }

      const response = await pollInboundMessages({
        options: {
          baseUrl: this.options.baseUrl,
          apiToken: this.options.apiToken,
          robotId: this.options.robotId,
        },
        wxid: this.options.wxid,
        scene: 0,
      });
      const discovered =
        response.contactIds && response.contactIds.length > 0
          ? response.contactIds
          : collectInboundContactIds(response.items ?? []);
      for (const contactId of discovered) {
        this.knownContactIds.add(contactId);
      }
      return Array.from(this.knownContactIds);
    }
    return [];
  }

  private rememberSeen(key: string): void {
    if (this.seen.has(key)) {
      this.seen.delete(key);
    }
    this.seen.add(key);
    if (this.seen.size <= MAX_GLOBAL_SEEN) {
      return;
    }
    const stale = Array.from(this.seen).slice(0, this.seen.size - TRIM_GLOBAL_SEEN_TO);
    for (const item of stale) {
      this.seen.delete(item);
    }
  }

  private resolveLastTimestamp(contactId: string): number {
    const known = this.lastTimestampByContact.get(contactId);
    if (typeof known === "number" && Number.isFinite(known)) {
      return known;
    }
    const fallback = Math.max(0, Date.now() - this.options.pollingConfig.lookbackSeconds * 1000);
    this.lastTimestampByContact.set(contactId, fallback);
    return fallback;
  }

  private updateLastTimestamp(contactId: string, ts: number): void {
    this.lastTimestampByContact.set(contactId, ts);
  }

  private async pollContact(contactId: string): Promise<void> {
    const maxPages = this.options.pollingConfig.maxPagesPerPoll;
    let watermarkTs = this.resolveLastTimestamp(contactId);

    for (let page = 1; page <= maxPages; page += 1) {
      const response = await pollInboundMessages({
        options: {
          baseUrl: this.options.baseUrl,
          apiToken: this.options.apiToken,
          robotId: this.options.robotId,
        },
        wxid: this.options.wxid,
        scene: 0,
      });

      const items = response.items ?? [];

      const filteredItems = items.filter((item) => {
        if (item.chatType === "direct") {
          return item.senderId === contactId;
        }
        return item.chatId === contactId;
      });

      this.log(
        `/api/Msg/Sync 完成（contact=${contactId}，返回消息数=${items.length}，命中消息数=${filteredItems.length}）`,
      );

      if (items.length === 0) {
        break;
      }

      if (filteredItems.length === 0) {
        break;
      }

      const sortedItems = filteredItems.sort((a, b) => a.timestamp - b.timestamp);
      let latestTimestamp = watermarkTs;
      let delivered = 0;

      for (const item of sortedItems) {
        if (item.isFromSelf || item.body.includes(SELF_MSG_SOURCE_MARKER)) {
          continue;
        }
        if (!item.contentType || !SUPPORTED_INBOUND_CONTENT_TYPES.has(item.contentType)) {
          continue;
        }

        const ts = Number.isFinite(item.timestamp) ? item.timestamp : 0;
        if (ts < watermarkTs) {
          continue;
        }

        const messageId = normalizeMessageId(item);
        const seenKey = buildSeenKey(this.options.accountId, item.chatId, messageId);
        if (this.seen.has(seenKey)) {
          continue;
        }

        await this.options.onMessage(item);
        this.rememberSeen(seenKey);
        latestTimestamp = Math.max(latestTimestamp, ts);
        delivered += 1;
      }

      watermarkTs = Math.max(watermarkTs, latestTimestamp);
      this.updateLastTimestamp(contactId, watermarkTs);

      if (delivered === 0 || sortedItems.length < SYNC_BATCH_SIZE) {
        break;
      }
    }
  }
}

export function createWechatIpadPoller(options: WechatIpadPollingOptions): WechatIpadMessagePoller {
  return new WechatIpadMessagePoller(options);
}
