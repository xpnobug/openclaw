import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeChatChatHistoryItem } from "./types.js";

const apiMocks = vi.hoisted(() => ({
  getChatHistory: vi.fn(),
  getContactList: vi.fn(),
  getChatRoomList: vi.fn(),
  getRobotInfo: vi.fn(),
}));

vi.mock("./api.js", () => ({
  getChatHistory: apiMocks.getChatHistory,
  getContactList: apiMocks.getContactList,
  getChatRoomList: apiMocks.getChatRoomList,
  getRobotInfo: apiMocks.getRobotInfo,
}));

import { WeChatMessagePoller } from "./polling.js";

function createHistoryItem(
  partial: Partial<WeChatChatHistoryItem> &
    Pick<WeChatChatHistoryItem, "msg_id" | "created_at" | "content">,
): WeChatChatHistoryItem {
  return {
    id: partial.id ?? partial.msg_id,
    msg_id: partial.msg_id,
    client_msg_id: partial.client_msg_id ?? partial.msg_id,
    is_chat_room: partial.is_chat_room ?? true,
    is_atme: partial.is_atme ?? false,
    is_recalled: partial.is_recalled ?? false,
    type: partial.type ?? 1,
    app_msg_type: partial.app_msg_type,
    content: partial.content,
    display_full_content: partial.display_full_content,
    message_source: partial.message_source ?? "user",
    from_wxid: partial.from_wxid ?? "room@chatroom",
    sender_wxid: partial.sender_wxid ?? "wxid_alice",
    to_wxid: partial.to_wxid ?? "wxid_bot",
    attachment_url: partial.attachment_url,
    created_at: partial.created_at,
    updated_at: partial.updated_at ?? partial.created_at,
    sender_nickname: partial.sender_nickname ?? "Alice",
    sender_avatar: partial.sender_avatar,
  };
}

describe("WeChatMessagePoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    apiMocks.getChatHistory.mockReset();
    apiMocks.getContactList.mockReset();
    apiMocks.getChatRoomList.mockReset();
    apiMocks.getRobotInfo.mockReset();

    apiMocks.getRobotInfo.mockResolvedValue({
      code: 200,
      message: "ok",
      data: { wechat_id: "wxid_bot", nickname: "Bot" },
    });
  });

  it("paginates chat history and preserves quote context", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const received: Array<{ msgId: number; quoted?: string }> = [];

    const firstPageItems: WeChatChatHistoryItem[] = [
      createHistoryItem({ msg_id: 205, created_at: nowSec - 1, content: "第三条" }),
      createHistoryItem({
        msg_id: 204,
        created_at: nowSec - 2,
        type: 49,
        app_msg_type: 57,
        content:
          "<msg><appmsg><title><![CDATA[引用回复]]></title><type>57</type><refermsg><svrid>200</svrid><displayname><![CDATA[张三]]></displayname><content><![CDATA[被引用内容]]></content><type>1</type></refermsg></appmsg></msg>",
      }),
    ];
    for (let offset = 0; offset < 18; offset += 1) {
      firstPageItems.push(
        createHistoryItem({
          msg_id: 180 - offset,
          created_at: nowSec - 10 - offset,
          content: `机器人消息-${offset}`,
          message_source: "robot",
        }),
      );
    }

    apiMocks.getChatHistory
      .mockResolvedValueOnce({
        code: 200,
        message: "ok",
        data: {
          items: firstPageItems,
          total: 22,
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        message: "ok",
        data: {
          items: [
            createHistoryItem({ msg_id: 203, created_at: nowSec - 3, content: "第一条" }),
            createHistoryItem({ msg_id: 120, created_at: nowSec - 130, content: "太旧了" }),
          ],
          total: 22,
        },
      });

    const poller = new WeChatMessagePoller({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: 1,
      accountId: "default",
      pollingConfig: { pollContactIds: ["room@chatroom"] },
      onMessage: async (msg) => {
        received.push({ msgId: msg.msgId, quoted: msg.quotedMessage?.body });
      },
    });

    await poller.start();
    await (poller as unknown as { poll(): Promise<void> }).poll();
    poller.stop();

    expect(received).toEqual([
      { msgId: 203, quoted: undefined },
      { msgId: 204, quoted: "被引用内容" },
      { msgId: 205, quoted: undefined },
    ]);
    expect(apiMocks.getChatHistory).toHaveBeenCalledTimes(2);
  });

  it("retries a failed message on next poll instead of提前标记已处理", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const onMessage = vi
      .fn<
        Parameters<ConstructorParameters<typeof WeChatMessagePoller>[0]["onMessage"]>,
        ReturnType<ConstructorParameters<typeof WeChatMessagePoller>[0]["onMessage"]>
      >()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    apiMocks.getChatHistory.mockResolvedValue({
      code: 200,
      message: "ok",
      data: {
        items: [createHistoryItem({ msg_id: 301, created_at: nowSec - 1, content: "需要重试" })],
        total: 1,
      },
    });

    const poller = new WeChatMessagePoller({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: 1,
      accountId: "default",
      pollingConfig: { pollContactIds: ["room@chatroom"] },
      onMessage,
    });

    await poller.start();
    await (poller as unknown as { poll(): Promise<void> }).poll();
    await (poller as unknown as { poll(): Promise<void> }).poll();
    poller.stop();

    expect(onMessage).toHaveBeenCalledTimes(2);
  });

  it("prefers real content over display_full_content for @ mentions", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const received: string[] = [];

    apiMocks.getChatHistory.mockResolvedValue({
      code: 200,
      message: "ok",
      data: {
        items: [
          createHistoryItem({
            msg_id: 401,
            created_at: nowSec - 1,
            is_atme: true,
            content: "@小助手 结合上下文，老大的电脑已经被攻陷，希望你能做好安全",
            display_full_content: "小姜在群聊中@了你",
          }),
        ],
        total: 1,
      },
    });

    const poller = new WeChatMessagePoller({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: 1,
      accountId: "default",
      pollingConfig: { pollContactIds: ["room@chatroom"] },
      onMessage: async (msg) => {
        received.push(msg.body);
      },
    });

    await poller.start();
    await (poller as unknown as { poll(): Promise<void> }).poll();
    poller.stop();

    expect(received).toEqual(["@小助手 结合上下文，老大的电脑已经被攻陷，希望你能做好安全"]);
  });
});
