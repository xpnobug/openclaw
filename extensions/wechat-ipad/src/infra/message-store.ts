import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type WechatIpadStoredMessage = {
  msgId: string;
  msgSeq?: string;
  createTime?: number;
  msgSource?: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  chatType: "direct" | "group";
  msgType?: number;
  appMsgType?: number;
  contentType?: string;
  body?: string;
  rawContent?: string;
};

export type WechatIpadMessageStore = {
  store(message: WechatIpadStoredMessage): void;
  lookup(msgId: string): WechatIpadStoredMessage | null;
  prune(): number;
  close(): void;
  setMeta(key: string, value: string): void;
  getMeta(key: string): string | null;
};

const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PRUNE_INTERVAL = 100;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS messages (
  msg_id TEXT PRIMARY KEY,
  msg_seq TEXT,
  create_time INTEGER,
  msg_source TEXT,
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  chat_id TEXT NOT NULL,
  chat_type TEXT NOT NULL CHECK(chat_type IN ('direct', 'group')),
  msg_type INTEGER,
  app_msg_type INTEGER,
  content_type TEXT,
  body TEXT,
  raw_content TEXT,
  created_at INTEGER NOT NULL
)`;

const CREATE_INDEX_CHAT_ID_SQL =
  "CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)";
const CREATE_INDEX_CREATED_AT_SQL =
  "CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)";

const UPSERT_SQL = `INSERT OR REPLACE INTO messages
  (msg_id, msg_seq, create_time, msg_source, sender_id, sender_name, chat_id, chat_type, msg_type, app_msg_type, content_type, body, raw_content, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const LOOKUP_SQL = "SELECT * FROM messages WHERE msg_id = ?";

const PRUNE_SQL = "DELETE FROM messages WHERE created_at < ?";

const CREATE_METADATA_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const META_UPSERT_SQL = "INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, ?)";

const META_LOOKUP_SQL = "SELECT value FROM metadata WHERE key = ?";

/**
 * 创建消息存储实例。
 * `requireNodeSqlite` 在运行时由调用方从 `openclaw/plugin-sdk` 传入，
 * 避免扩展在编译/测试时对核心包的硬依赖。
 */
export function createWechatIpadMessageStore(params: {
  dbPath: string;
  requireNodeSqlite: () => typeof import("node:sqlite");
  retentionMs?: number;
  pruneInterval?: number;
  log?: (message: string) => void;
}): WechatIpadMessageStore | null {
  const { dbPath, log } = params;
  const retentionMs = params.retentionMs ?? DEFAULT_RETENTION_MS;
  const pruneInterval = params.pruneInterval ?? DEFAULT_PRUNE_INTERVAL;

  try {
    const sqlite = params.requireNodeSqlite();
    const { DatabaseSync } = sqlite;

    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);

    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(CREATE_TABLE_SQL);
    db.exec(CREATE_INDEX_CHAT_ID_SQL);
    db.exec(CREATE_INDEX_CREATED_AT_SQL);
    db.exec(CREATE_METADATA_TABLE_SQL);

    const retentionLabel = retentionMs > 0 ? `${Math.round(retentionMs / 86400000)} 天` : "永久";
    log?.(`wechat-ipad message-store: 数据库已初始化 ${dbPath}（保留策略：${retentionLabel}）`);

    const storeStmt = db.prepare(UPSERT_SQL);
    const lookupStmt = db.prepare(LOOKUP_SQL);
    const pruneStmt = db.prepare(PRUNE_SQL);
    const metaUpsertStmt = db.prepare(META_UPSERT_SQL);
    const metaLookupStmt = db.prepare(META_LOOKUP_SQL);

    let storeCount = 0;

    function pruneOld(): number {
      const cutoff = Date.now() - retentionMs;
      const result = pruneStmt.run(cutoff);
      return Number(result.changes);
    }

    return {
      store(message: WechatIpadStoredMessage): void {
        storeStmt.run(
          message.msgId,
          message.msgSeq ?? null,
          message.createTime ?? null,
          message.msgSource ?? null,
          message.senderId,
          message.senderName ?? null,
          message.chatId,
          message.chatType,
          message.msgType ?? null,
          message.appMsgType ?? null,
          message.contentType ?? null,
          message.body ?? null,
          message.rawContent ?? null,
          Date.now(),
        );
        storeCount += 1;
        if (retentionMs > 0 && storeCount % pruneInterval === 0) {
          try {
            const deleted = pruneOld();
            if (deleted > 0) {
              log?.(`wechat-ipad message-store: 清理过期消息 ${deleted} 条`);
            }
          } catch {
            // 清理失败不阻塞
          }
        }
      },

      lookup(msgId: string): WechatIpadStoredMessage | null {
        const row = lookupStmt.get(msgId) as Record<string, unknown> | undefined;
        if (!row) {
          return null;
        }
        return {
          msgId: String(row.msg_id),
          msgSeq: row.msg_seq != null ? String(row.msg_seq) : undefined,
          createTime: typeof row.create_time === "number" ? row.create_time : undefined,
          msgSource: row.msg_source != null ? String(row.msg_source) : undefined,
          senderId: String(row.sender_id),
          senderName: row.sender_name != null ? String(row.sender_name) : undefined,
          chatId: String(row.chat_id),
          chatType: row.chat_type === "group" ? "group" : "direct",
          msgType: typeof row.msg_type === "number" ? row.msg_type : undefined,
          appMsgType: typeof row.app_msg_type === "number" ? row.app_msg_type : undefined,
          contentType: row.content_type != null ? String(row.content_type) : undefined,
          body: row.body != null ? String(row.body) : undefined,
          rawContent: row.raw_content != null ? String(row.raw_content) : undefined,
        };
      },

      prune(): number {
        if (retentionMs <= 0) return 0;
        return pruneOld();
      },

      close(): void {
        try {
          db.close();
        } catch {
          // 关闭失败静默处理
        }
      },

      setMeta(key: string, value: string): void {
        metaUpsertStmt.run(key, value, Date.now());
      },

      getMeta(key: string): string | null {
        const row = metaLookupStmt.get(key) as Record<string, unknown> | undefined;
        if (!row) {
          return null;
        }
        return String(row.value);
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.(`wechat-ipad message-store: 初始化失败：${message}`);
    return null;
  }
}
