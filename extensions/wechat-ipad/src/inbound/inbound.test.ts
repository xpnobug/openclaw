import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { normalizeWechatIpadSyncAddMsg } from "../api/api.js";
import * as sendModule from "../outbound/send.js";
import { handleWechatIpadInboundMessage } from "./inbound.js";

function createRuntimeMocks(stateDir?: string) {
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
      state: {
        resolveStateDir: vi.fn(() => stateDir ?? "/tmp/mock-state"),
      },
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

  it("downloads image and injects media payload for image messages", async () => {
    const { downloadImageViaApi } = await import("../api/api.js");

    const testDir = join(tmpdir(), `wechat-ipad-img-test-${Date.now()}`);
    vi.mocked(downloadImageViaApi).mockResolvedValue({
      buffer: Buffer.from("fake-png-bytes"),
      contentType: "image/png",
      extension: ".png",
    });

    const { runtime, dispatchReplyFromConfig, log } = createRuntimeMocks(testDir);

    const imageXml = `<msg><img aeskey="abc123" cdnmidimgurl="cdn456" length="100" md5="md5hash"/></msg>`;
    await handleWechatIpadInboundMessage(
      {
        id: "wxid_a:501",
        msgId: "501",
        from: "wxid_a",
        senderId: "wxid_a",
        chatId: "wxid_a",
        chatType: "direct",
        body: imageXml,
        timestamp: 1700000100000,
        isAtMe: false,
        contentType: "image",
        messageType: 3,
      },
      {
        cfg: { channels: {} },
        runtime: runtime as never,
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        wxid: "wxid_bot",
        dmPolicy: "open",
      },
    );

    // 验证 downloadImageViaApi 被调用
    expect(downloadImageViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        wxid: "wxid_bot",
        aesKey: "abc123",
        cdnMidImgUrl: "cdn456",
      }),
    );

    // 验证图片保存到磁盘（统一路径）
    const expectedDir = join(
      testDir,
      "workspace",
      "wechat-ipad-data",
      "default",
      "images",
      "wxid_a",
    );
    const expectedFile = join(expectedDir, "1700000100_501.png");
    expect(existsSync(expectedFile)).toBe(true);
    expect(readFileSync(expectedFile).toString()).toBe("fake-png-bytes");

    // 验证 ctxPayload 包含 MediaPath
    expect(runtime.channel.reply.finalizeInboundContext).toHaveBeenCalledWith(
      expect.objectContaining({
        MediaPath: expectedFile,
        MediaType: "image/png",
      }),
    );

    // 验证日志包含图片保存信息
    expect(log).toHaveBeenCalledWith(expect.stringContaining("图片已保存至"));

    // 验证 dispatch 被调用
    expect(dispatchReplyFromConfig).toHaveBeenCalled();

    // 清理
    rmSync(testDir, { recursive: true, force: true });
  });

  it("uses chatId for group image storage directory", async () => {
    const { downloadImageViaApi } = await import("../api/api.js");

    const testDir = join(tmpdir(), `wechat-ipad-grp-img-test-${Date.now()}`);
    vi.mocked(downloadImageViaApi).mockResolvedValue({
      buffer: Buffer.from("group-img"),
      contentType: "image/jpeg",
      extension: ".jpg",
    });

    const { runtime } = createRuntimeMocks(testDir);

    const imageXml = `<msg><img aeskey="grp123" cdnmidimgurl="grpcdn" length="200"/></msg>`;
    await handleWechatIpadInboundMessage(
      {
        id: "room@chatroom:502",
        msgId: "502",
        from: "room@chatroom",
        senderId: "wxid_member",
        chatId: "room@chatroom",
        chatType: "group",
        body: imageXml,
        timestamp: 1700000200000,
        isAtMe: true,
        contentType: "image",
        messageType: 3,
      },
      {
        cfg: { channels: {} },
        runtime: runtime as never,
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        wxid: "wxid_bot",
        groupPolicy: "open",
        requireMention: true,
      },
    );

    // 群聊使用 chatId 作为目录名
    const expectedFile = join(
      testDir,
      "workspace",
      "wechat-ipad-data",
      "default",
      "images",
      "room@chatroom",
      "1700000200_502.jpg",
    );
    expect(existsSync(expectedFile)).toBe(true);

    rmSync(testDir, { recursive: true, force: true });
  });

  it("gracefully handles image download failure without blocking message", async () => {
    const { downloadImageViaApi } = await import("../api/api.js");

    const testDir = join(tmpdir(), `wechat-ipad-fail-test-${Date.now()}`);
    vi.mocked(downloadImageViaApi).mockRejectedValue(new Error("CDN 下载超时"));

    const { runtime, dispatchReplyFromConfig, log } = createRuntimeMocks(testDir);

    const imageXml = `<msg><img aeskey="fail123" cdnmidimgurl="failcdn" length="100"/></msg>`;
    await handleWechatIpadInboundMessage(
      {
        id: "wxid_a:503",
        msgId: "503",
        from: "wxid_a",
        senderId: "wxid_a",
        chatId: "wxid_a",
        chatType: "direct",
        body: imageXml,
        timestamp: 1700000300000,
        isAtMe: false,
        contentType: "image",
        messageType: 3,
      },
      {
        cfg: { channels: {} },
        runtime: runtime as never,
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        wxid: "wxid_bot",
        dmPolicy: "open",
      },
    );

    // 下载失败不阻塞消息处理
    expect(dispatchReplyFromConfig).toHaveBeenCalled();

    // 记录错误日志
    expect(log).toHaveBeenCalledWith(expect.stringContaining("图片下载/保存失败"));

    // ctxPayload 不包含 MediaPath（因为下载失败）
    expect(runtime.channel.reply.finalizeInboundContext).toHaveBeenCalledWith(
      expect.not.objectContaining({
        MediaPath: expect.anything(),
      }),
    );

    rmSync(testDir, { recursive: true, force: true });
  });

  it("falls back to robotId when wxid is not available", async () => {
    const { downloadImageViaApi } = await import("../api/api.js");

    const testDir = join(tmpdir(), `wechat-ipad-noid-test-${Date.now()}`);
    vi.mocked(downloadImageViaApi).mockResolvedValue({
      buffer: Buffer.from("data"),
      contentType: "image/jpeg",
      extension: ".jpg",
    });

    const { runtime } = createRuntimeMocks(testDir);

    const imageXml = `<msg><img aeskey="k" cdnmidimgurl="u" length="1"/></msg>`;
    await handleWechatIpadInboundMessage(
      {
        id: "wxid_a:504",
        msgId: "504",
        from: "wxid_a",
        senderId: "wxid_a",
        chatId: "wxid_a",
        chatType: "direct",
        body: imageXml,
        timestamp: 1700000400000,
        isAtMe: false,
        contentType: "image",
        messageType: 3,
      },
      {
        cfg: { channels: {} },
        runtime: runtime as never,
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "my-robot-id",
        // 不传 wxid
        dmPolicy: "open",
      },
    );

    // 回退到 robotId
    expect(downloadImageViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        wxid: "my-robot-id",
      }),
    );

    rmSync(testDir, { recursive: true, force: true });
  });
});
