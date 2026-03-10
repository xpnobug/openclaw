import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  sendTextViaApi: vi.fn(),
  sendQuoteTextViaApi: vi.fn(),
  sendLinkCardViaApi: vi.fn(),
  sendMediaViaApi: vi.fn(),
  sendLongTextViaApi: vi.fn(),
  fetchBotProfileViaApi: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
  resolveWechatIpadRuntimeWxid: vi.fn(
    (_accountId?: string, configuredWxid?: string | null) => configuredWxid?.trim() || undefined,
  ),
  getWechatIpadLoginSession: vi.fn<() => { accountId: string; nickname?: string } | null>(
    () => null,
  ),
  getWechatIpadBotProfile: vi.fn<
    () => { nickname: string; headImgUrl: string; fetchedAt: number } | null
  >(() => null),
  isWechatIpadBotProfileStale: vi.fn(() => false),
  isWechatIpadProfileFetching: vi.fn(() => false),
  markWechatIpadProfileFetching: vi.fn(),
  unmarkWechatIpadProfileFetching: vi.fn(),
  setWechatIpadBotProfile: vi.fn(),
}));

const accountMocks = vi.hoisted(() => ({
  resolveWechatIpadAccount: vi.fn<
    () => {
      accountId?: string;
      baseUrl: string;
      apiToken: string;
      robotId: string;
      config: { wxid?: string; longTextThreshold?: number; longTextTitle?: string };
    }
  >(() => ({
    accountId: "default",
    baseUrl: "http://localhost:9000",
    apiToken: "token",
    robotId: "default",
    config: { wxid: "wxid_bot" },
  })),
}));

vi.mock("./api.js", () => ({
  sendTextViaApi: apiMocks.sendTextViaApi,
  sendQuoteTextViaApi: apiMocks.sendQuoteTextViaApi,
  sendLinkCardViaApi: apiMocks.sendLinkCardViaApi,
  sendMediaViaApi: apiMocks.sendMediaViaApi,
  sendLongTextViaApi: apiMocks.sendLongTextViaApi,
  fetchBotProfileViaApi: apiMocks.fetchBotProfileViaApi,
}));

vi.mock("./accounts.js", () => ({
  resolveWechatIpadAccount: accountMocks.resolveWechatIpadAccount,
}));

vi.mock("./runtime.js", () => ({
  resolveWechatIpadRuntimeWxid: runtimeMocks.resolveWechatIpadRuntimeWxid,
  getWechatIpadLoginSession: runtimeMocks.getWechatIpadLoginSession,
  getWechatIpadBotProfile: runtimeMocks.getWechatIpadBotProfile,
  isWechatIpadBotProfileStale: runtimeMocks.isWechatIpadBotProfileStale,
  isWechatIpadProfileFetching: runtimeMocks.isWechatIpadProfileFetching,
  markWechatIpadProfileFetching: runtimeMocks.markWechatIpadProfileFetching,
  unmarkWechatIpadProfileFetching: runtimeMocks.unmarkWechatIpadProfileFetching,
  setWechatIpadBotProfile: runtimeMocks.setWechatIpadBotProfile,
}));

import {
  chunkWechatIpadText,
  normalizeWechatIpadTarget,
  sendWechatIpadLinkCard,
  sendWechatIpadMedia,
  sendWechatIpadText,
} from "./send.js";

describe("wechat-ipad send", () => {
  beforeEach(() => {
    apiMocks.sendTextViaApi.mockReset();
    apiMocks.sendQuoteTextViaApi.mockReset();
    apiMocks.sendLinkCardViaApi.mockReset();
    apiMocks.sendMediaViaApi.mockReset();
    apiMocks.sendLongTextViaApi.mockReset();
    apiMocks.fetchBotProfileViaApi.mockReset();
    apiMocks.fetchBotProfileViaApi.mockResolvedValue({
      nickname: "Bot",
      headImgUrl: "",
      fetchedAt: Date.now(),
    });
    runtimeMocks.resolveWechatIpadRuntimeWxid.mockReset();
    runtimeMocks.resolveWechatIpadRuntimeWxid.mockImplementation(
      (_accountId?: string, configuredWxid?: string | null) => configuredWxid?.trim() || undefined,
    );
    runtimeMocks.getWechatIpadLoginSession.mockReset();
    runtimeMocks.getWechatIpadLoginSession.mockReturnValue(null);
    runtimeMocks.getWechatIpadBotProfile.mockReset();
    runtimeMocks.getWechatIpadBotProfile.mockReturnValue(null);
    runtimeMocks.isWechatIpadBotProfileStale.mockReset();
    runtimeMocks.isWechatIpadBotProfileStale.mockReturnValue(false);
    runtimeMocks.isWechatIpadProfileFetching.mockReset();
    runtimeMocks.isWechatIpadProfileFetching.mockReturnValue(false);
    runtimeMocks.markWechatIpadProfileFetching.mockReset();
    runtimeMocks.unmarkWechatIpadProfileFetching.mockReset();
    runtimeMocks.setWechatIpadBotProfile.mockReset();
    accountMocks.resolveWechatIpadAccount.mockReset();
    accountMocks.resolveWechatIpadAccount.mockReturnValue({
      accountId: "default",
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      config: { wxid: "wxid_bot" },
    });
  });

  it("normalizes target prefixes", () => {
    expect(normalizeWechatIpadTarget("wechat-ipad:wxid_a")).toBe("wxid_a");
    expect(normalizeWechatIpadTarget("wechat:wxid_a")).toBe("wxid_a");
    expect(normalizeWechatIpadTarget("group:123@chatroom")).toBe("123@chatroom");
  });

  it("chunks long text by separator", () => {
    const chunks = chunkWechatIpadText("hello world\\nthis is test", 8);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toContain("hello");
  });

  it("sends long text via SendApp chat history message", async () => {
    apiMocks.sendLongTextViaApi.mockResolvedValue({ messageId: "long-1" });
    runtimeMocks.getWechatIpadLoginSession.mockReturnValue({
      accountId: "default",
      nickname: "OpenClaw 机器人",
    });

    const result = await sendWechatIpadText("wechat:wxid_abc", "A".repeat(4000), {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(result.ok).toBe(true);
    expect(result.endpoints).toEqual(["/api/Msg/SendApp"]);
    expect(apiMocks.sendLongTextViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        wxid: "wxid_bot",
        toWxid: "wxid_abc",
        text: "A".repeat(4000),
        senderName: "OpenClaw 机器人",
      }),
    );
    expect(apiMocks.sendTextViaApi).not.toHaveBeenCalled();
  });

  it("uses native quote api for first chunk when replyToId carries full metadata", async () => {
    apiMocks.sendQuoteTextViaApi.mockResolvedValue({ messageId: "quote-1" });
    apiMocks.sendTextViaApi.mockResolvedValue({ messageId: "text-1" });

    const result = await sendWechatIpadText("wechat:wxid_abc", "第一段\n第二段", {
      cfg: { channels: {} },
      accountId: "default",
      replyToId:
        'wechat-ipad:{"msgId":"123456789","msgSeq":"778899","senderId":"wxid_sender","senderName":"张三","body":"原消息内容"}',
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.sendQuoteTextViaApi).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendQuoteTextViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToId:
          'wechat-ipad:{"msgId":"123456789","msgSeq":"778899","senderId":"wxid_sender","senderName":"张三","body":"原消息内容"}',
      }),
    );
  });

  it("falls back to plain text when native quote send fails", async () => {
    apiMocks.sendQuoteTextViaApi.mockRejectedValue(new Error("missing quote metadata"));
    apiMocks.sendTextViaApi.mockResolvedValue({ messageId: "text-fallback" });

    const result = await sendWechatIpadText("wechat:wxid_abc", "hello", {
      cfg: { channels: {} },
      accountId: "default",
      replyToId: 'wechat-ipad:{"msgId":"123456789"}',
    });

    expect(result.ok).toBe(true);
    expect(result.endpoints).toEqual(["/api/Msg/SendApp", "/api/Msg/SendTxt"]);
    expect(apiMocks.sendTextViaApi).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendLongTextViaApi).not.toHaveBeenCalled();
  });

  it("can force long text delivery for shorter payloads", async () => {
    apiMocks.sendLongTextViaApi.mockResolvedValue({ messageId: "long-force" });

    const result = await sendWechatIpadText("wechat:wxid_abc", "短消息", {
      cfg: { channels: {} },
      accountId: "default",
      forceLongText: true,
    });

    expect(result.ok).toBe(true);
    expect(result.endpoints).toEqual(["/api/Msg/SendApp"]);
    expect(apiMocks.sendLongTextViaApi).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendTextViaApi).not.toHaveBeenCalled();
  });

  it("sends link card via SendApp endpoint", async () => {
    apiMocks.sendLinkCardViaApi.mockResolvedValue({ messageId: "link-1" });

    const result = await sendWechatIpadLinkCard(
      "wxid_abc",
      {
        title: "OpenClaw",
        url: "https://openclaw.ai",
        desc: "文档入口",
        thumbUrl: "https://openclaw.ai/icon.png",
      },
      {
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        wxid: "wxid_bot",
      },
    );

    expect(result).toEqual({ ok: true, messageId: "link-1" });
    expect(apiMocks.sendLinkCardViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        wxid: "wxid_bot",
        toWxid: "wxid_abc",
        title: "OpenClaw",
        url: "https://openclaw.ai",
        desc: "文档入口",
        thumbUrl: "https://openclaw.ai/icon.png",
      }),
    );
  });

  it("rejects link card when url is not http or https", async () => {
    const result = await sendWechatIpadLinkCard(
      "wxid_abc",
      {
        title: "OpenClaw",
        url: "javascript:alert(1)",
      },
      {
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        wxid: "wxid_bot",
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("http or https");
    expect(apiMocks.sendLinkCardViaApi).not.toHaveBeenCalled();
  });

  it("sends media via upload image endpoint", async () => {
    apiMocks.sendMediaViaApi.mockResolvedValue({ messageId: "media-1" });
    apiMocks.sendTextViaApi.mockResolvedValue({ messageId: "text-2" });

    const result = await sendWechatIpadMedia("wxid_abc", "data:image/png;base64,AAAA", "说明", {
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      wxid: "wxid_bot",
    });

    expect(result).toEqual({ ok: true, messageId: "media-1" });
    expect(apiMocks.sendMediaViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        wxid: "wxid_bot",
        toWxid: "wxid_abc",
        base64: "data:image/png;base64,AAAA",
      }),
    );
    expect(apiMocks.sendTextViaApi).toHaveBeenCalled();
  });

  it("allows send without apiToken", async () => {
    accountMocks.resolveWechatIpadAccount.mockReturnValueOnce({
      baseUrl: "http://localhost:9000",
      apiToken: "",
      robotId: "default",
      config: { wxid: "wxid_bot" },
    });
    apiMocks.sendTextViaApi.mockResolvedValue({ messageId: "m-no-token" });

    const result = await sendWechatIpadText("wechat:wxid_abc", "hello", {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.sendTextViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          apiToken: "",
        }),
      }),
    );
  });

  it("falls back to runtime wxid when config wxid missing", async () => {
    accountMocks.resolveWechatIpadAccount.mockReturnValueOnce({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      config: {},
    });
    runtimeMocks.resolveWechatIpadRuntimeWxid.mockReturnValueOnce("wxid_runtime");
    apiMocks.sendTextViaApi.mockResolvedValue({ messageId: "m-runtime" });

    const result = await sendWechatIpadText("wechat:wxid_abc", "hello", {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.sendTextViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        wxid: "wxid_runtime",
      }),
    );
  });

  it("uses default long text threshold when config is absent", async () => {
    apiMocks.sendLongTextViaApi.mockResolvedValue({ messageId: "long-default" });

    const result = await sendWechatIpadText("wechat:wxid_abc", "A".repeat(1801), {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.sendLongTextViaApi).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendTextViaApi).not.toHaveBeenCalled();
  });

  it("uses account-level long text threshold from resolved account config", async () => {
    accountMocks.resolveWechatIpadAccount.mockReturnValueOnce({
      accountId: "main",
      baseUrl: "http://localhost:9001",
      apiToken: "token-main",
      robotId: "main-robot",
      config: { wxid: "wxid_main", longTextThreshold: 5 },
    });
    apiMocks.sendLongTextViaApi.mockResolvedValue({ messageId: "long-custom-low" });

    const result = await sendWechatIpadText("wechat:wxid_abc", "123456", {
      cfg: { channels: {} },
      accountId: "main",
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.sendLongTextViaApi).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendLongTextViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        wxid: "wxid_main",
        options: expect.objectContaining({
          baseUrl: "http://localhost:9001",
          apiToken: "token-main",
          robotId: "main-robot",
        }),
      }),
    );
    expect(apiMocks.sendTextViaApi).not.toHaveBeenCalled();
  });

  it("keeps account-specific baseUrl and wxid when threshold allows plain text", async () => {
    accountMocks.resolveWechatIpadAccount.mockReturnValueOnce({
      accountId: "ops",
      baseUrl: "http://localhost:9002",
      apiToken: "token-ops",
      robotId: "ops-robot",
      config: { wxid: "wxid_ops", longTextThreshold: 2500 },
    });
    apiMocks.sendTextViaApi.mockResolvedValue({ messageId: "text-custom-high" });

    const result = await sendWechatIpadText("wechat:wxid_abc", "A".repeat(2000), {
      cfg: { channels: {} },
      accountId: "ops",
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.sendLongTextViaApi).not.toHaveBeenCalled();
    expect(apiMocks.sendTextViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        wxid: "wxid_ops",
        options: expect.objectContaining({
          baseUrl: "http://localhost:9002",
          apiToken: "token-ops",
          robotId: "ops-robot",
        }),
      }),
    );
  });

  it("rejects send when wxid missing", async () => {
    accountMocks.resolveWechatIpadAccount.mockReturnValueOnce({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      config: {},
    });

    const result = await sendWechatIpadText("wechat:wxid_abc", "hello", {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("channels.wechat-ipad.accounts.<accountId>.wxid");
  });

  it("uses bot profile nickname and headImgUrl for long text", async () => {
    apiMocks.sendLongTextViaApi.mockResolvedValue({ messageId: "long-profile" });
    runtimeMocks.getWechatIpadBotProfile.mockReturnValue({
      nickname: "Profile昵称",
      headImgUrl: "https://wx.qlogo.cn/avatar.png",
      fetchedAt: Date.now(),
    });

    const result = await sendWechatIpadText("wechat:wxid_abc", "A".repeat(4000), {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.sendLongTextViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        senderName: "Profile昵称",
        sourceHeadUrl: "https://wx.qlogo.cn/avatar.png",
      }),
    );
  });

  it("falls back to loginSession nickname when bot profile is absent", async () => {
    apiMocks.sendLongTextViaApi.mockResolvedValue({ messageId: "long-session" });
    runtimeMocks.getWechatIpadBotProfile.mockReturnValue(null);
    runtimeMocks.getWechatIpadLoginSession.mockReturnValue({
      accountId: "default",
      nickname: "Session昵称",
    });

    const result = await sendWechatIpadText("wechat:wxid_abc", "A".repeat(4000), {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.sendLongTextViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        senderName: "Session昵称",
        sourceHeadUrl: "",
      }),
    );
  });

  it("passes longTextTitle from account config", async () => {
    apiMocks.sendLongTextViaApi.mockResolvedValue({ messageId: "long-title" });
    accountMocks.resolveWechatIpadAccount.mockReturnValueOnce({
      accountId: "default",
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: "default",
      config: { wxid: "wxid_bot", longTextTitle: "自定义标题" },
    });

    const result = await sendWechatIpadText("wechat:wxid_abc", "A".repeat(4000), {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.sendLongTextViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "自定义标题",
      }),
    );
  });

  it("triggers background profile fetch when cache is stale", async () => {
    apiMocks.sendLongTextViaApi.mockResolvedValue({ messageId: "long-stale" });
    runtimeMocks.getWechatIpadBotProfile.mockReturnValue({
      nickname: "旧昵称",
      headImgUrl: "https://old.png",
      fetchedAt: Date.now() - 60 * 60_000,
    });
    runtimeMocks.isWechatIpadBotProfileStale.mockReturnValue(true);
    runtimeMocks.isWechatIpadProfileFetching.mockReturnValue(false);

    const result = await sendWechatIpadText("wechat:wxid_abc", "A".repeat(4000), {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(result.ok).toBe(true);
    // 使用旧缓存值发送
    expect(apiMocks.sendLongTextViaApi).toHaveBeenCalledWith(
      expect.objectContaining({
        senderName: "旧昵称",
        sourceHeadUrl: "https://old.png",
      }),
    );
    // 后台触发了 fetch
    expect(runtimeMocks.markWechatIpadProfileFetching).toHaveBeenCalledWith("default");
    expect(apiMocks.fetchBotProfileViaApi).toHaveBeenCalled();
  });

  it("does not trigger background fetch when already fetching", async () => {
    apiMocks.sendLongTextViaApi.mockResolvedValue({ messageId: "long-fetching" });
    runtimeMocks.getWechatIpadBotProfile.mockReturnValue({
      nickname: "旧昵称",
      headImgUrl: "",
      fetchedAt: Date.now() - 60 * 60_000,
    });
    runtimeMocks.isWechatIpadBotProfileStale.mockReturnValue(true);
    runtimeMocks.isWechatIpadProfileFetching.mockReturnValue(true);

    await sendWechatIpadText("wechat:wxid_abc", "A".repeat(4000), {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(runtimeMocks.markWechatIpadProfileFetching).not.toHaveBeenCalled();
    expect(apiMocks.fetchBotProfileViaApi).not.toHaveBeenCalled();
  });
});
