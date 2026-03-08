import { describe, expect, it, vi } from "vitest";
import { handleWechatIpadInboundMessage } from "./inbound.js";
import * as sendModule from "./send.js";

function createRuntimeMocks() {
  const dispatchReplyFromConfig = vi.fn().mockResolvedValue(undefined);
  const createReplyDispatcherWithTyping = vi.fn(() => ({
    dispatcher: vi.fn(),
    replyOptions: {},
    markDispatchIdle: vi.fn(),
  }));

  return {
    runtime: {
      channel: {
        pairing: {
          buildPairingReply: vi.fn(() => "请先配对"),
          upsertPairingRequest: vi.fn().mockResolvedValue({ code: "PAIR-123" }),
        },
        activity: { record: vi.fn() },
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: "s1",
            accountId: "default",
          })),
        },
        reply: {
          resolveEnvelopeFormatOptions: vi.fn(() => ({})),
          formatInboundEnvelope: vi.fn(() => "wrapped"),
          finalizeInboundContext: vi.fn(() => ({ ok: true })),
          createReplyDispatcherWithTyping,
          dispatchReplyFromConfig,
        },
      },
    },
    dispatchReplyFromConfig,
  };
}

describe("wechat-ipad inbound", () => {
  it("adds quoted fallback prefix to first outbound reply", async () => {
    const { runtime } = createRuntimeMocks();
    const sendSpy = vi
      .spyOn(sendModule, "sendWechatIpadText")
      .mockResolvedValue({ ok: true, messageId: "m1" });
    const dispatcherFactory = runtime.channel.reply.createReplyDispatcherWithTyping as ReturnType<
      typeof vi.fn
    >;

    await handleWechatIpadInboundMessage(
      {
        id: "m-quote-fallback",
        from: "wxid_a",
        senderId: "wxid_a",
        chatId: "wxid_a",
        chatType: "direct",
        body: "我来回复一下",
        timestamp: Date.now(),
        isAtMe: false,
        quotedMessage: {
          currentBody: "我来回复一下",
          quotedBody: "原消息内容比较长，需要作为降级前缀",
          quotedSender: "张三",
          quotedSenderWxid: "wxid_sender",
          quotedChatId: "wxid_a",
          quotedMessageId: "123456789",
          quotedMessageType: 1,
          rawXml: "<appmsg></appmsg>",
        },
      },
      {
        cfg: { channels: {} },
        runtime: runtime as never,
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        dmPolicy: "open",
      },
    );

    const deliver = dispatcherFactory.mock.calls[0]?.[0]?.deliver as
      | ((payload: { text?: string; body?: string }) => Promise<void>)
      | undefined;
    expect(deliver).toBeTruthy();

    await deliver?.({ text: "第一条回复" });
    await deliver?.({ text: "第二条回复" });

    expect(sendSpy).toHaveBeenNthCalledWith(
      1,
      "wxid_a",
      "【引用 张三】\n原消息内容比较长，需要作为降级前缀\n\n第一条回复",
      expect.objectContaining({
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
      }),
    );
    expect(sendSpy).toHaveBeenNthCalledWith(2, "wxid_a", "第二条回复", expect.any(Object));

    sendSpy.mockRestore();
  });

  it("blocks group message without mention when requireMention=true", async () => {
    const { runtime, dispatchReplyFromConfig } = createRuntimeMocks();

    await handleWechatIpadInboundMessage(
      {
        id: "m1",
        from: "123@chatroom",
        senderId: "wxid_a",
        chatId: "123@chatroom",
        chatType: "group",
        body: "hello",
        timestamp: Date.now(),
        isAtMe: false,
      },
      {
        cfg: { channels: {} },
        runtime: runtime as never,
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        requireMention: true,
      },
    );

    expect(dispatchReplyFromConfig).not.toHaveBeenCalled();
  });

  it("allows group message with mention when requireMention=true", async () => {
    const { runtime, dispatchReplyFromConfig } = createRuntimeMocks();

    await handleWechatIpadInboundMessage(
      {
        id: "m-group-mention",
        from: "123@chatroom",
        senderId: "wxid_member",
        chatId: "123@chatroom",
        chatType: "group",
        body: "hello",
        timestamp: Date.now(),
        isAtMe: true,
      },
      {
        cfg: { channels: {} },
        runtime: runtime as never,
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        requireMention: true,
        groupPolicy: "open",
      },
    );

    expect(dispatchReplyFromConfig).toHaveBeenCalled();
  });

  it("writes quoted reply metadata into inbound context", async () => {
    const { runtime, dispatchReplyFromConfig } = createRuntimeMocks();

    await handleWechatIpadInboundMessage(
      {
        id: "m-quote",
        from: "wxid_a",
        senderId: "wxid_a",
        chatId: "wxid_a",
        chatType: "direct",
        body: "我来回复一下",
        timestamp: Date.now(),
        isAtMe: false,
        quotedMessage: {
          currentBody: "我来回复一下",
          quotedBody: "原消息内容",
          quotedSender: "张三",
          quotedSenderWxid: "wxid_sender",
          quotedChatId: "wxid_a",
          quotedMessageId: "123456789",
          quotedMessageType: 1,
          rawXml: "<appmsg></appmsg>",
        },
      },
      {
        cfg: { channels: {} },
        runtime: runtime as never,
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        dmPolicy: "open",
      },
    );

    expect(runtime.channel.reply.finalizeInboundContext).toHaveBeenCalledWith(
      expect.objectContaining({
        ReplyToId: "123456789",
        ReplyToIdFull: "123456789",
        ReplyToBody: "原消息内容",
        ReplyToSender: "张三",
        ReplyToIsQuote: true,
      }),
    );
    expect(dispatchReplyFromConfig).toHaveBeenCalled();
  });

  it("creates pairing reply for unauthorized dm", async () => {
    const { runtime } = createRuntimeMocks();

    await handleWechatIpadInboundMessage(
      {
        id: "m1",
        from: "wxid_a",
        senderId: "wxid_a",
        chatId: "wxid_a",
        chatType: "direct",
        body: "hello",
        timestamp: Date.now(),
        isAtMe: false,
      },
      {
        cfg: { channels: {} },
        runtime: runtime as never,
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        dmPolicy: "pairing",
        allowFrom: [],
      },
    );

    expect(runtime.channel.pairing.upsertPairingRequest).toHaveBeenCalled();
  });
});
