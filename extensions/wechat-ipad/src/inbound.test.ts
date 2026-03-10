import { describe, expect, it, vi } from "vitest";
import { normalizeWechatIpadSyncAddMsg } from "./api.js";
import { handleWechatIpadInboundMessage } from "./inbound.js";
import * as sendModule from "./send.js";

function createRuntimeMocks() {
  const dispatchReplyFromConfig = vi.fn().mockResolvedValue({
    queuedFinal: true,
    counts: { final: 1 },
  });
  const createReplyDispatcherWithTyping = vi.fn(() => ({
    dispatcher: vi.fn(),
    replyOptions: {},
    markDispatchIdle: vi.fn(),
  }));
  const log = vi.fn();

  return {
    runtime: {
      log,
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
    log,
  };
}

describe("wechat-ipad inbound", () => {
  it("accepts webhook-normalized group mention messages through the existing inbound chain", async () => {
    const { runtime, dispatchReplyFromConfig } = createRuntimeMocks();
    const msg = normalizeWechatIpadSyncAddMsg(
      {
        NewMsgId: 301,
        MsgId: 301,
        MsgSeq: 9001,
        FromUserName: { string: "room@chatroom" },
        ToUserName: { string: "wxid_bot" },
        MsgType: 1,
        MsgSource: "<msgsource><atuserlist><![CDATA[wxid_bot]]></atuserlist></msgsource>",
        Content: {
          string: "wxid_member:\n你好，帮我查一下订单",
        },
        CreateTime: 1700000200,
      },
      "wxid_bot",
    );

    expect(msg).toBeTruthy();

    await handleWechatIpadInboundMessage(msg as NonNullable<typeof msg>, {
      cfg: { channels: {} },
      runtime: runtime as never,
      accountId: "default",
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      requireMention: true,
      groupPolicy: "open",
    });

    expect(dispatchReplyFromConfig).toHaveBeenCalled();
    expect(runtime.channel.reply.finalizeInboundContext).toHaveBeenCalledWith(
      expect.objectContaining({
        MessageSid: "301",
        OriginatingChannel: "wechat-ipad",
        Surface: "wechat-ipad",
        WasMentioned: true,
        SenderId: "wxid_member",
        GroupSubject: "room@chatroom",
      }),
    );
  });
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
        cfg: { channels: {} },
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
      }),
    );
    expect(sendSpy).toHaveBeenNthCalledWith(
      2,
      "wxid_a",
      "第二条回复",
      expect.objectContaining({
        cfg: { channels: {} },
        accountId: "default",
      }),
    );

    sendSpy.mockRestore();
  });

  it("logs four chinese lifecycle messages for successful direct dispatch", async () => {
    const { runtime, log } = createRuntimeMocks();

    await handleWechatIpadInboundMessage(
      {
        id: "m-log-direct",
        from: "wxid_a",
        senderId: "wxid_a",
        senderName: "张三",
        chatId: "wxid_a",
        chatType: "direct",
        body: "你好，我想查询订单状态",
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
        dmPolicy: "open",
      },
    );

    expect(log.mock.calls).toEqual([
      ["wechat-ipad[default]: 收到消息：来自 wxid_a，在 wxid_a（私聊）"],
      ["wechat-ipad[default]: 私聊消息：张三(wxid_a)：你好，我想查询订单状态"],
      ["wechat-ipad[default]: 开始分发到 agent（session=s1）"],
      ["wechat-ipad[default]: 分发完成（已入队最终回复=true，回复数=1）"],
    ]);
  });

  it("logs outbound send endpoint and failure reason", async () => {
    const { runtime, log } = createRuntimeMocks();
    const sendSpy = vi.spyOn(sendModule, "sendWechatIpadText").mockResolvedValue({
      ok: false,
      error: "bridge timeout",
      endpoints: ["/api/Msg/SendTxt"],
    });
    const dispatcherFactory = runtime.channel.reply.createReplyDispatcherWithTyping as ReturnType<
      typeof vi.fn
    >;

    await handleWechatIpadInboundMessage(
      {
        id: "m-log-send-fail",
        from: "wxid_a",
        senderId: "wxid_a",
        senderName: "张三",
        chatId: "wxid_a",
        chatType: "direct",
        body: "帮我查一下订单",
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
        dmPolicy: "open",
      },
    );

    const deliver = dispatcherFactory.mock.calls[0]?.[0]?.deliver as
      | ((payload: { text?: string; body?: string }, info: { kind: string }) => Promise<void>)
      | undefined;
    expect(deliver).toBeTruthy();

    await deliver?.({ text: "回复内容" }, { kind: "final" });

    expect(log).toHaveBeenCalledWith(
      "wechat-ipad[default]: 回复发送接口：kind=final，目标=wxid_a，接口=/api/Msg/SendTxt",
    );
    expect(log).toHaveBeenCalledWith(
      "wechat-ipad[default]: 回复发送失败：kind=final，目标=wxid_a，错误=bridge timeout",
    );

    sendSpy.mockRestore();
  });

  it("truncates long preview in summary log", async () => {
    const { runtime, log } = createRuntimeMocks();
    const longBody = "这是一个很长的消息内容 ".repeat(8);

    await handleWechatIpadInboundMessage(
      {
        id: "m-log-preview",
        from: "wxid_a",
        senderId: "wxid_a",
        senderName: "张三",
        chatId: "wxid_a",
        chatType: "direct",
        body: longBody,
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
        dmPolicy: "open",
      },
    );

    const summaryLog = log.mock.calls.find(([entry]) => entry.includes("私聊消息"))?.[0];
    expect(summaryLog).toContain("wechat-ipad[default]: 私聊消息：张三(wxid_a)：");
    expect(summaryLog?.endsWith("…")).toBe(true);
  });

  it("logs skip reason for group message without mention", async () => {
    const { runtime, dispatchReplyFromConfig, log } = createRuntimeMocks();

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
    expect(log).toHaveBeenCalledWith(
      "wechat-ipad[default]: 忽略群消息：未 @ 当前账号，发送者=wxid_a，群=123@chatroom",
    );
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("开始分发到 agent"));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("分发完成"));
  });

  it("blocks group message without mention when requireMention=true", async () => {
    const { runtime, dispatchReplyFromConfig, log } = createRuntimeMocks();

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
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("开始分发到 agent"));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("分发完成"));
  });

  it("logs skip reason for allowlist blocked direct message", async () => {
    const { runtime, dispatchReplyFromConfig, log } = createRuntimeMocks();

    await handleWechatIpadInboundMessage(
      {
        id: "m-allowlist-block",
        from: "wxid_b",
        senderId: "wxid_b",
        chatId: "wxid_b",
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
        dmPolicy: "allowlist",
        allowFrom: ["wxid_a"],
      },
    );

    expect(dispatchReplyFromConfig).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "wechat-ipad[default]: 忽略消息：策略=allowlist，发送者=wxid_b 不在 allowFrom 中",
    );
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
        msgId: "987654321",
        msgIdFull:
          'wechat-ipad:{"msgId":"987654321","msgSeq":"778899","createTime":1700000104,"msgSource":"<msgsource><signature>sig-self</signature></msgsource>","senderId":"wxid_friend","senderName":"wxid_friend","body":"我来回复一下"}',
        quotedMessage: {
          currentBody: "我来回复一下",
          quotedBody: "原消息内容",
          quotedSender: "张三",
          quotedSenderWxid: "wxid_sender",
          quotedChatId: "wxid_a",
          quotedMessageId: "123456789",
          quotedMessageIdFull:
            'wechat-ipad:{"msgId":"123456789","msgSeq":"778899","msgSource":"<msgsource><sequence_id>778899</sequence_id></msgsource>","senderId":"wxid_sender","senderName":"张三","body":"原消息内容"}',
          quotedMessageType: 1,
          quotedMessageSequenceId: "778899",
          quotedMessageMsgSource: "<msgsource><sequence_id>778899</sequence_id></msgsource>",
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
        MessageSid: "987654321",
        MessageSidFull:
          'wechat-ipad:{"msgId":"987654321","msgSeq":"778899","createTime":1700000104,"msgSource":"<msgsource><signature>sig-self</signature></msgsource>","senderId":"wxid_friend","senderName":"wxid_friend","body":"我来回复一下"}',
        ReplyToId: "123456789",
        ReplyToIdFull:
          'wechat-ipad:{"msgId":"123456789","msgSeq":"778899","msgSource":"<msgsource><sequence_id>778899</sequence_id></msgsource>","senderId":"wxid_sender","senderName":"张三","body":"原消息内容"}',
        ReplyToBody: "原消息内容",
        ReplyToSender: "张三",
        ReplyToIsQuote: true,
      }),
    );
    expect(dispatchReplyFromConfig).toHaveBeenCalled();
  });

  it("logs dispatcher errors during outbound delivery", async () => {
    const { runtime, log } = createRuntimeMocks();
    const dispatcherFactory = runtime.channel.reply.createReplyDispatcherWithTyping as ReturnType<
      typeof vi.fn
    >;

    await handleWechatIpadInboundMessage(
      {
        id: "m-log-dispatch-error",
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
        dmPolicy: "open",
      },
    );

    const onError = dispatcherFactory.mock.calls[0]?.[0]?.onError as
      | ((error: unknown, info: { kind: string }) => void)
      | undefined;
    expect(onError).toBeTruthy();

    onError?.(new Error("unexpected transport failure"), { kind: "final" });

    expect(log).toHaveBeenCalledWith(
      "wechat-ipad[default]: 回复发送异常：kind=final，错误=unexpected transport failure",
    );
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
