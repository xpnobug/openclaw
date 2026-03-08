import { describe, expect, it, vi } from "vitest";
import { handleWechatIpadInboundMessage } from "./inbound.js";

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
