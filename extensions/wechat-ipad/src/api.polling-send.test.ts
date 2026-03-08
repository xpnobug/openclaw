import { describe, expect, it, vi } from "vitest";
import { pollInboundMessages, sendMediaViaApi, sendTextViaApi } from "./api.js";

type RequestArg = {
  options: unknown;
  method: "GET" | "POST";
  endpoint: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
};

describe("wechat-ipad api polling/send compatibility", () => {
  it("maps /api/Msg/Sync AddMsgs payload", async () => {
    const requestFn = vi.fn(async (_arg: RequestArg) => ({
      AddMsgs: [
        {
          MsgId: 123,
          NewMsgId: 456,
          FromUserName: { string: "wxid_a" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 1,
          Content: { string: "hi" },
          CreateTime: 1700000000,
        },
        {
          MsgId: 124,
          NewMsgId: 457,
          FromUserName: { string: "room123@chatroom" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 1,
          Content: { string: "wxid_member:\n群消息" },
          MsgSource: "<msgsource><atuserlist>wxid_bot,wxid_other</atuserlist></msgsource>",
          CreateTime: 1700000001,
        },
      ],
    }));

    const result = await pollInboundMessages(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
      },
      requestFn,
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.msgId).toBe("456");
    expect(result.items[0]?.senderId).toBe("wxid_a");
    expect(result.items[0]?.chatType).toBe("direct");
    expect(result.items[1]?.msgId).toBe("457");
    expect(result.items[1]?.chatType).toBe("group");
    expect(result.items[1]?.chatId).toBe("room123@chatroom");
    expect(result.items[1]?.senderId).toBe("wxid_member");
    expect(result.items[1]?.body).toBe("群消息");
    expect(result.items[1]?.isAtMe).toBe(true);
    expect(result.items[1]?.isFromSelf).toBe(false);
    expect(result.contactIds).toEqual(["wxid_a", "room123@chatroom"]);

    const callArg = requestFn.mock.calls[0]?.[0] as RequestArg & { body?: Record<string, unknown> };
    expect(callArg.method).toBe("POST");
    expect(callArg.endpoint).toBe("/api/Msg/Sync");
    expect(callArg.body?.Wxid).toBe("wxid_bot");
    expect(callArg.body?.Scene).toBe(0);
  });

  it("normalizes send message id aliases from /api/Msg endpoints", async () => {
    const textRequestFn = vi.fn(async (_arg: RequestArg) => ({
      List: [{ NewMsgId: 101 }],
    }));
    const mediaRequestFn = vi.fn(async (_arg: RequestArg) => ({ Newmsgid: 202 }));

    const textResult = await sendTextViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
        toWxid: "wxid_a",
        text: "hello",
      },
      textRequestFn,
    );

    const mediaResult = await sendMediaViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
        toWxid: "wxid_a",
        base64: "data:image/png;base64,AAAA",
      },
      mediaRequestFn,
    );

    expect(textResult.messageId).toBe("101");
    expect(mediaResult.messageId).toBe("202");

    const textCallArg = textRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(textCallArg.endpoint).toBe("/api/Msg/SendTxt");
    expect(textCallArg.body?.Wxid).toBe("wxid_bot");
    expect(textCallArg.body?.ToWxid).toBe("wxid_a");
    expect(textCallArg.body?.Content).toBe("hello");
    expect(textCallArg.body?.Type).toBe(1);

    const mediaCallArg = mediaRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(mediaCallArg.endpoint).toBe("/api/Msg/UploadImg");
    expect(mediaCallArg.body?.Wxid).toBe("wxid_bot");
    expect(mediaCallArg.body?.ToWxid).toBe("wxid_a");
    expect(mediaCallArg.body?.Base64).toBe("data:image/png;base64,AAAA");
  });
});
