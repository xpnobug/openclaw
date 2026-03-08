import { pollInboundMessages } from "./api.js";
import type { WechatIpadInboundMessage, WechatIpadPollingConfig } from "./types.js";

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
};

const MAX_GLOBAL_SEEN = 20000;
const TRIM_GLOBAL_SEEN_TO = 10000;
const SYNC_BATCH_SIZE = 50;
const SELF_MSG_SOURCE_MARKER =
  ":\n<msgsource><bizflag>0</bizflag><silence>0</silence><membercount>0</membercount><signature>0</signature><tmp_node>0</tmp_node><sec_msg_node><alnode><fr>0</fr></alnode></sec_msg_node></msgsource>";

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

/**
 * wechat-ipad 轮询器（MVP）。
 */
export class WechatIpadMessagePoller {
  private readonly options: WechatIpadPollingOptions;
  private readonly seen = new Set<string>();
  private readonly lastTimestampByContact = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(options: WechatIpadPollingOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

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
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }

      this.schedule();
    }, this.options.pollingConfig.intervalMs);
  }

  private async pollOnce(): Promise<void> {
    const contacts = this.resolveContacts();
    if (contacts.length === 0) {
      return;
    }

    for (const contactId of contacts) {
      await this.pollContact(contactId);
    }
  }

  private resolveContacts(): string[] {
    const cfg = this.options.pollingConfig;
    if (cfg.pollContactIds.length > 0) {
      return cfg.pollContactIds;
    }
    if (cfg.pollAllContacts) {
      // MVP 阶段要求显式联系人列表；pollAllContacts 预留给后端聚合端点。
      return [];
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
      if (items.length === 0) {
        break;
      }

      const filteredItems = items.filter((item) => {
        if (item.chatType === "direct") {
          return item.senderId === contactId;
        }
        return item.chatId === contactId;
      });

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
