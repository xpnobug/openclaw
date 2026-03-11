import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWechatIpadMessageStore } from "./message-store.js";
import type { WechatIpadStoredMessage } from "./message-store.js";

// node:sqlite 仅在 Node 22+ 可用
let nodeSqliteAvailable = false;
let requireNodeSqliteFn: () => typeof import("node:sqlite");
try {
  const mod = require("node:sqlite") as typeof import("node:sqlite");
  if (mod?.DatabaseSync) {
    nodeSqliteAvailable = true;
    requireNodeSqliteFn = () => mod;
  }
} catch {
  // node:sqlite 不可用
}

function makeTempDbPath(): string {
  const dir = join(
    tmpdir(),
    `wechat-ipad-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  return join(dir, "messages.db");
}

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const p of cleanupPaths) {
    rmSync(p, { recursive: true, force: true });
  }
  cleanupPaths.length = 0;
});

function makeTestMessage(
  overrides: Partial<WechatIpadStoredMessage> = {},
): WechatIpadStoredMessage {
  return {
    msgId: "msg-001",
    senderId: "wxid_sender",
    chatId: "wxid_chat",
    chatType: "direct",
    ...overrides,
  };
}

describe("wechat-ipad message-store", () => {
  it("returns null when requireNodeSqlite throws", () => {
    const store = createWechatIpadMessageStore({
      dbPath: makeTempDbPath(),
      requireNodeSqlite: () => {
        throw new Error("node:sqlite not available");
      },
    });
    expect(store).toBeNull();
  });

  it.skipIf(!nodeSqliteAvailable)("creates database and stores/lookups messages", () => {
    const dbPath = makeTempDbPath();
    cleanupPaths.push(join(dbPath, ".."));

    const store = createWechatIpadMessageStore({
      dbPath,
      requireNodeSqlite: requireNodeSqliteFn!,
    });
    expect(store).not.toBeNull();

    const msg = makeTestMessage({
      msgId: "100",
      msgSeq: "200",
      createTime: 1700000000,
      msgSource: "<msgsource></msgsource>",
      senderId: "wxid_a",
      senderName: "张三",
      chatId: "room@chatroom",
      chatType: "group",
      msgType: 49,
      appMsgType: 5,
      contentType: "link",
      body: "文章标题",
      rawContent: "<msg><appmsg><title>文章标题</title><type>5</type></appmsg></msg>",
    });

    store!.store(msg);
    const result = store!.lookup("100");
    expect(result).toEqual(msg);

    store!.close();
    expect(existsSync(dbPath)).toBe(true);
  });

  it.skipIf(!nodeSqliteAvailable)("returns null for non-existent message", () => {
    const dbPath = makeTempDbPath();
    cleanupPaths.push(join(dbPath, ".."));

    const store = createWechatIpadMessageStore({
      dbPath,
      requireNodeSqlite: requireNodeSqliteFn!,
    });
    expect(store).not.toBeNull();

    const result = store!.lookup("non-existent");
    expect(result).toBeNull();

    store!.close();
  });

  it.skipIf(!nodeSqliteAvailable)("upserts (replaces) existing message on same msgId", () => {
    const dbPath = makeTempDbPath();
    cleanupPaths.push(join(dbPath, ".."));

    const store = createWechatIpadMessageStore({
      dbPath,
      requireNodeSqlite: requireNodeSqliteFn!,
    });
    expect(store).not.toBeNull();

    store!.store(makeTestMessage({ msgId: "dup-1", body: "first" }));
    store!.store(makeTestMessage({ msgId: "dup-1", body: "second" }));

    const result = store!.lookup("dup-1");
    expect(result?.body).toBe("second");

    store!.close();
  });

  it.skipIf(!nodeSqliteAvailable)("prunes expired messages", () => {
    const dbPath = makeTempDbPath();
    cleanupPaths.push(join(dbPath, ".."));

    const store = createWechatIpadMessageStore({
      dbPath,
      requireNodeSqlite: requireNodeSqliteFn!,
      retentionMs: 1,
    });
    expect(store).not.toBeNull();

    store!.store(makeTestMessage({ msgId: "old-1" }));
    store!.store(makeTestMessage({ msgId: "old-2" }));

    const deleted = store!.prune();
    expect(deleted).toBeGreaterThanOrEqual(2);

    expect(store!.lookup("old-1")).toBeNull();
    expect(store!.lookup("old-2")).toBeNull();

    store!.close();
  });

  it.skipIf(!nodeSqliteAvailable)("auto-prunes on store interval", () => {
    const dbPath = makeTempDbPath();
    cleanupPaths.push(join(dbPath, ".."));

    const logs: string[] = [];
    const store = createWechatIpadMessageStore({
      dbPath,
      requireNodeSqlite: requireNodeSqliteFn!,
      retentionMs: 1,
      pruneInterval: 3,
      log: (msg) => logs.push(msg),
    });
    expect(store).not.toBeNull();

    store!.store(makeTestMessage({ msgId: "auto-1" }));
    store!.store(makeTestMessage({ msgId: "auto-2" }));
    store!.store(makeTestMessage({ msgId: "auto-3" }));

    const pruneLog = logs.find((l) => l.includes("清理过期消息"));
    expect(pruneLog).toBeTruthy();

    store!.close();
  });

  it.skipIf(!nodeSqliteAvailable)("handles optional fields as null/undefined", () => {
    const dbPath = makeTempDbPath();
    cleanupPaths.push(join(dbPath, ".."));

    const store = createWechatIpadMessageStore({
      dbPath,
      requireNodeSqlite: requireNodeSqliteFn!,
    });
    expect(store).not.toBeNull();

    const msg = makeTestMessage({ msgId: "minimal" });
    store!.store(msg);

    const result = store!.lookup("minimal");
    expect(result?.msgSeq).toBeUndefined();
    expect(result?.createTime).toBeUndefined();
    expect(result?.msgSource).toBeUndefined();
    expect(result?.senderName).toBeUndefined();
    expect(result?.msgType).toBeUndefined();
    expect(result?.appMsgType).toBeUndefined();
    expect(result?.contentType).toBeUndefined();
    expect(result?.body).toBeUndefined();
    expect(result?.rawContent).toBeUndefined();

    store!.close();
  });

  it.skipIf(!nodeSqliteAvailable)("creates parent directories if they do not exist", () => {
    const dbPath = join(tmpdir(), `nested-${Date.now()}`, "sub", "dir", "messages.db");
    cleanupPaths.push(join(dbPath, "..", "..", ".."));

    const store = createWechatIpadMessageStore({
      dbPath,
      requireNodeSqlite: requireNodeSqliteFn!,
    });
    expect(store).not.toBeNull();

    store!.store(makeTestMessage({ msgId: "nested-1" }));
    expect(store!.lookup("nested-1")).not.toBeNull();

    store!.close();
  });

  it.skipIf(!nodeSqliteAvailable)("close can be called multiple times safely", () => {
    const dbPath = makeTempDbPath();
    cleanupPaths.push(join(dbPath, ".."));

    const store = createWechatIpadMessageStore({
      dbPath,
      requireNodeSqlite: requireNodeSqliteFn!,
    });
    expect(store).not.toBeNull();

    store!.close();
    store!.close();
  });

  it.skipIf(!nodeSqliteAvailable)("setMeta / getMeta 读写正常", () => {
    const dbPath = makeTempDbPath();
    cleanupPaths.push(join(dbPath, ".."));

    const store = createWechatIpadMessageStore({
      dbPath,
      requireNodeSqlite: requireNodeSqliteFn!,
    });
    expect(store).not.toBeNull();

    store!.setMeta(
      "bot_profile",
      '{"nickname":"测试","headImgUrl":"https://example.com/img.png","fetchedAt":1700000000}',
    );
    const value = store!.getMeta("bot_profile");
    expect(value).toBe(
      '{"nickname":"测试","headImgUrl":"https://example.com/img.png","fetchedAt":1700000000}',
    );

    // 覆盖写入
    store!.setMeta(
      "bot_profile",
      '{"nickname":"新名称","headImgUrl":"https://example.com/new.png","fetchedAt":1700000001}',
    );
    const updated = store!.getMeta("bot_profile");
    expect(updated).toBe(
      '{"nickname":"新名称","headImgUrl":"https://example.com/new.png","fetchedAt":1700000001}',
    );

    store!.close();
  });

  it.skipIf(!nodeSqliteAvailable)("getMeta 返回 null 当 key 不存在", () => {
    const dbPath = makeTempDbPath();
    cleanupPaths.push(join(dbPath, ".."));

    const store = createWechatIpadMessageStore({
      dbPath,
      requireNodeSqlite: requireNodeSqliteFn!,
    });
    expect(store).not.toBeNull();

    const value = store!.getMeta("nonexistent_key");
    expect(value).toBeNull();

    store!.close();
  });
});
