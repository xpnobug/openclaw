import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWechatIpadAccount } from "./accounts.js";

const apiMocks = vi.hoisted(() => ({
  pollInboundMessages: vi.fn(),
  listContactIdsViaApi: vi.fn(),
}));

vi.mock("./api.js", () => ({
  pollInboundMessages: apiMocks.pollInboundMessages,
  listContactIdsViaApi: apiMocks.listContactIdsViaApi,
  collectInboundContactIds: (
    items: Array<{ chatType: string; chatId: string; senderId: string }>,
  ) => {
    const ids = new Set<string>();
    for (const item of items) {
      ids.add(item.chatType === "group" ? item.chatId : item.senderId);
    }
    return Array.from(ids);
  },
}));

import { WechatIpadMessagePoller } from "./polling.js";

describe("WechatIpadMessagePoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMocks.pollInboundMessages.mockReset();
    apiMocks.listContactIdsViaApi.mockReset();
  });

  it("reads polling config only from the selected account", () => {
    const account = resolveWechatIpadAccount({
      cfg: {
        channels: {
          "wechat-ipad": {
            accounts: {
              main: {
                apiToken: "token-main",
                inbound: {
                  mode: "polling",
                  polling: {
                    intervalMs: 1500,
                    pollContactIds: ["wxid_main"],
                  },
                },
              },
              ops: {
                apiToken: "token-ops",
                inbound: {
                  mode: "polling",
                  polling: {
                    intervalMs: 9000,
                    pollContactIds: ["wxid_ops"],
                  },
                },
              },
            },
          },
        },
      },
      accountId: "main",
    });

    expect(account.inbound.polling.intervalMs).toBe(1500);
    expect(account.inbound.polling.pollContactIds).toEqual(["wxid_main"]);
  });

  it("logs poller startup and sync counts", async () => {
    const log = vi.fn();
    const now = Date.now();
    apiMocks.pollInboundMessages.mockResolvedValueOnce({
      items: [
        {
          id: "wxid_a:100",
          msgId: "100",
          from: "wxid_a",
          senderId: "wxid_a",
          chatId: "wxid_a",
          chatType: "direct",
          body: "hello",
          timestamp: now,
          isAtMe: false,
          contentType: "text",
        },
      ],
      contactIds: ["wxid_a"],
    });

    const poller = new WechatIpadMessagePoller({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      wxid: "wxid_bot",
      accountId: "default",
      pollingConfig: {
        intervalMs: 1000,
        lookbackSeconds: 120,
        maxPagesPerPoll: 1,
        pollAllContacts: false,
        pollContactIds: ["wxid_a"],
      },
      log,
      onMessage: async () => {},
    });

    await poller.start();
    await vi.runOnlyPendingTimersAsync();
    poller.stop();

    expect(log).toHaveBeenCalledWith(
      "wechat-ipad[default]: 轮询已启动（wxid=wxid_bot，pollContactIds=wxid_a，pollAllContacts=false）",
    );
    expect(log).toHaveBeenCalledWith(
      "wechat-ipad[default]: /api/Msg/Sync 完成（contact=wxid_a，返回消息数=1，命中消息数=1）",
    );
  });

  it("polls configured contacts and deduplicates messages", async () => {
    const received: string[] = [];
    const now = Date.now();
    apiMocks.pollInboundMessages
      .mockResolvedValueOnce({
        items: [
          {
            id: "wxid_a:100",
            msgId: "100",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "hello",
            timestamp: now,
            isAtMe: false,
            contentType: "text",
          },
        ],
        contactIds: ["wxid_a"],
      })
      .mockResolvedValue({ items: [], contactIds: [] });

    const poller = new WechatIpadMessagePoller({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      wxid: "wxid_bot",
      accountId: "default",
      pollingConfig: {
        intervalMs: 1000,
        lookbackSeconds: 120,
        maxPagesPerPoll: 2,
        pollAllContacts: false,
        pollContactIds: ["wxid_a"],
      },
      onMessage: async (msg) => {
        received.push(msg.id);
      },
    });

    await poller.start();
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
    poller.stop();

    expect(received).toEqual(["wxid_a:100"]);
  });

  it("discovers contacts from contact list api when pollAllContacts is enabled", async () => {
    const received: string[] = [];
    const now = Date.now();

    apiMocks.listContactIdsViaApi.mockResolvedValueOnce({
      contactIds: ["wxid_a", "room@chatroom"],
      currentWxcontactSeq: 10,
      currentChatRoomContactSeq: 20,
    });

    apiMocks.pollInboundMessages
      .mockResolvedValueOnce({
        items: [
          {
            id: "wxid_a:100",
            msgId: "100",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "hello",
            timestamp: now,
            isAtMe: false,
            contentType: "text",
          },
          {
            id: "wxid_a:101",
            msgId: "101",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "follow-up",
            timestamp: now + 10,
            isAtMe: false,
            contentType: "text",
          },
        ],
        contactIds: ["wxid_a"],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "room@chatroom:200",
            msgId: "200",
            from: "room@chatroom",
            senderId: "wxid_member",
            chatId: "room@chatroom",
            chatType: "group",
            body: "群消息",
            timestamp: now + 1,
            isAtMe: false,
            contentType: "text",
          },
          {
            id: "room@chatroom:201",
            msgId: "201",
            from: "room@chatroom",
            senderId: "wxid_member",
            chatId: "room@chatroom",
            chatType: "group",
            body: "新群消息",
            timestamp: now + 20,
            isAtMe: false,
            contentType: "text",
          },
        ],
        contactIds: ["room@chatroom"],
      })
      .mockResolvedValue({ items: [], contactIds: [] });

    const poller = new WechatIpadMessagePoller({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      wxid: "wxid_bot",
      accountId: "default",
      pollingConfig: {
        intervalMs: 1000,
        lookbackSeconds: 120,
        maxPagesPerPoll: 2,
        pollAllContacts: true,
        pollContactIds: [],
      },
      onMessage: async (msg) => {
        received.push(msg.id);
      },
    });

    await poller.start();
    await vi.runOnlyPendingTimersAsync();
    poller.stop();

    expect(received).toEqual([
      "wxid_a:100",
      "wxid_a:101",
      "room@chatroom:200",
      "room@chatroom:201",
    ]);
    expect(apiMocks.listContactIdsViaApi).toHaveBeenCalledTimes(1);
    expect(apiMocks.pollInboundMessages).toHaveBeenCalledTimes(2);
  });

  it("keeps known contacts when later contact list pages are empty", async () => {
    const received: string[] = [];
    const now = Date.now();

    apiMocks.listContactIdsViaApi
      .mockResolvedValueOnce({
        contactIds: ["wxid_a"],
        currentWxcontactSeq: 10,
        currentChatRoomContactSeq: 20,
      })
      .mockResolvedValueOnce({
        contactIds: [],
        currentWxcontactSeq: 11,
        currentChatRoomContactSeq: 21,
      });

    apiMocks.pollInboundMessages
      .mockResolvedValueOnce({
        items: [
          {
            id: "wxid_a:100",
            msgId: "100",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "hello",
            timestamp: now,
            isAtMe: false,
            contentType: "text",
          },
        ],
        contactIds: ["wxid_a"],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "wxid_a:101",
            msgId: "101",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "follow-up",
            timestamp: now + 10,
            isAtMe: false,
            contentType: "text",
          },
        ],
        contactIds: ["wxid_a"],
      })
      .mockResolvedValue({ items: [], contactIds: [] });

    const poller = new WechatIpadMessagePoller({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      wxid: "wxid_bot",
      accountId: "default",
      pollingConfig: {
        intervalMs: 1000,
        lookbackSeconds: 120,
        maxPagesPerPoll: 2,
        pollAllContacts: true,
        pollContactIds: [],
      },
      onMessage: async (msg) => {
        received.push(msg.id);
      },
    });

    await poller.start();
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
    poller.stop();

    expect(received).toEqual(["wxid_a:100", "wxid_a:101"]);
    expect(apiMocks.listContactIdsViaApi).toHaveBeenCalledTimes(2);
    expect(apiMocks.pollInboundMessages).toHaveBeenCalledTimes(2);
  });

  it("falls back to sync-discovered contacts when contact list api fails", async () => {
    const received: string[] = [];
    const now = Date.now();

    apiMocks.listContactIdsViaApi.mockRejectedValueOnce(new Error("contact api unavailable"));

    apiMocks.pollInboundMessages
      .mockResolvedValueOnce({
        items: [
          {
            id: "wxid_a:100",
            msgId: "100",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "hello",
            timestamp: now,
            isAtMe: false,
            contentType: "text",
          },
          {
            id: "room@chatroom:200",
            msgId: "200",
            from: "room@chatroom",
            senderId: "wxid_member",
            chatId: "room@chatroom",
            chatType: "group",
            body: "群消息",
            timestamp: now + 1,
            isAtMe: false,
            contentType: "text",
          },
        ],
        contactIds: ["wxid_a", "wxid_a", "room@chatroom"],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "wxid_a:100",
            msgId: "100",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "hello",
            timestamp: now,
            isAtMe: false,
            contentType: "text",
          },
          {
            id: "wxid_a:101",
            msgId: "101",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "follow-up",
            timestamp: now + 10,
            isAtMe: false,
            contentType: "text",
          },
        ],
        contactIds: ["wxid_a"],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "room@chatroom:200",
            msgId: "200",
            from: "room@chatroom",
            senderId: "wxid_member",
            chatId: "room@chatroom",
            chatType: "group",
            body: "群消息",
            timestamp: now + 1,
            isAtMe: false,
            contentType: "text",
          },
          {
            id: "room@chatroom:201",
            msgId: "201",
            from: "room@chatroom",
            senderId: "wxid_member",
            chatId: "room@chatroom",
            chatType: "group",
            body: "新群消息",
            timestamp: now + 20,
            isAtMe: false,
            contentType: "text",
          },
        ],
        contactIds: ["room@chatroom"],
      })
      .mockResolvedValue({ items: [], contactIds: [] });

    const poller = new WechatIpadMessagePoller({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      wxid: "wxid_bot",
      accountId: "default",
      pollingConfig: {
        intervalMs: 1000,
        lookbackSeconds: 120,
        maxPagesPerPoll: 2,
        pollAllContacts: true,
        pollContactIds: [],
      },
      onMessage: async (msg) => {
        received.push(msg.id);
      },
    });

    await poller.start();
    await vi.runOnlyPendingTimersAsync();
    poller.stop();

    expect(received).toEqual([
      "wxid_a:100",
      "wxid_a:101",
      "room@chatroom:200",
      "room@chatroom:201",
    ]);
    expect(apiMocks.listContactIdsViaApi).toHaveBeenCalledTimes(1);
    expect(apiMocks.pollInboundMessages).toHaveBeenCalledTimes(3);
  });

  it("skips unsupported inbound content types", async () => {
    const received: string[] = [];
    const now = Date.now();

    apiMocks.pollInboundMessages
      .mockResolvedValueOnce({
        items: [
          {
            id: "wxid_a:100",
            msgId: "100",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "系统提示",
            timestamp: now,
            isAtMe: false,
            contentType: "system",
          },
          {
            id: "wxid_a:101",
            msgId: "101",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "状态消息",
            timestamp: now + 1,
            isAtMe: false,
            contentType: "status",
          },
          {
            id: "wxid_a:102",
            msgId: "102",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "引用回复",
            timestamp: now + 2,
            isAtMe: false,
            contentType: "quote",
          },
          {
            id: "wxid_a:103",
            msgId: "103",
            from: "wxid_a",
            senderId: "wxid_a",
            chatId: "wxid_a",
            chatType: "direct",
            body: "未知类型",
            timestamp: now + 3,
            isAtMe: false,
            contentType: "unknown",
          },
        ],
        contactIds: ["wxid_a"],
      })
      .mockResolvedValue({ items: [], contactIds: [] });

    const poller = new WechatIpadMessagePoller({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      wxid: "wxid_bot",
      accountId: "default",
      pollingConfig: {
        intervalMs: 1000,
        lookbackSeconds: 120,
        maxPagesPerPoll: 2,
        pollAllContacts: false,
        pollContactIds: ["wxid_a"],
      },
      onMessage: async (msg) => {
        received.push(msg.id);
      },
    });

    await poller.start();
    await vi.runOnlyPendingTimersAsync();
    poller.stop();

    expect(received).toEqual(["wxid_a:102"]);
  });
});
