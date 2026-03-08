import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  sendTextViaApi: vi.fn(),
  sendMediaViaApi: vi.fn(),
}));

const accountMocks = vi.hoisted(() => ({
  resolveWechatIpadAccount: vi.fn<
    () => {
      baseUrl: string;
      apiToken: string;
      robotId: string;
      config: { wxid?: string };
    }
  >(() => ({
    baseUrl: "http://localhost:9000",
    apiToken: "token",
    robotId: "default",
    config: { wxid: "wxid_bot" },
  })),
}));

vi.mock("./api.js", () => ({
  sendTextViaApi: apiMocks.sendTextViaApi,
  sendMediaViaApi: apiMocks.sendMediaViaApi,
}));

vi.mock("./accounts.js", () => ({
  resolveWechatIpadAccount: accountMocks.resolveWechatIpadAccount,
}));

import {
  chunkWechatIpadText,
  normalizeWechatIpadTarget,
  sendWechatIpadMedia,
  sendWechatIpadText,
} from "./send.js";

describe("wechat-ipad send", () => {
  beforeEach(() => {
    apiMocks.sendTextViaApi.mockReset();
    apiMocks.sendMediaViaApi.mockReset();
    accountMocks.resolveWechatIpadAccount.mockReset();
    accountMocks.resolveWechatIpadAccount.mockReturnValue({
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

  it("sends text chunks sequentially", async () => {
    apiMocks.sendTextViaApi.mockResolvedValue({ messageId: "m-1" });

    const result = await sendWechatIpadText("wechat:wxid_abc", "A".repeat(4000), {
      cfg: { channels: {} },
      accountId: "default",
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.sendTextViaApi).toHaveBeenCalled();
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
    expect(result.error).toContain("wxid");
  });
});
