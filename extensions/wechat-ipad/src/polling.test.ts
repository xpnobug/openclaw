import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  pollInboundMessages: vi.fn(),
}));

vi.mock("./api.js", () => ({
  pollInboundMessages: apiMocks.pollInboundMessages,
}));

import { WechatIpadMessagePoller } from "./polling.js";

describe("WechatIpadMessagePoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMocks.pollInboundMessages.mockReset();
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
          },
        ],
      })
      .mockResolvedValue({ items: [] });

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
});
