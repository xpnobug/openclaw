import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  revokeMessage: vi.fn(),
  sendFileChunkMessage: vi.fn(),
  sendImageMessage: vi.fn(),
  sendLongTextMessage: vi.fn(),
  sendTextMessage: vi.fn(),
  sendVideoMessage: vi.fn(),
  sendVoiceMessage: vi.fn(),
}));

vi.mock("./api.js", () => ({
  revokeMessage: apiMocks.revokeMessage,
  sendFileChunkMessage: apiMocks.sendFileChunkMessage,
  sendImageMessage: apiMocks.sendImageMessage,
  sendLongTextMessage: apiMocks.sendLongTextMessage,
  sendTextMessage: apiMocks.sendTextMessage,
  sendVideoMessage: apiMocks.sendVideoMessage,
  sendVoiceMessage: apiMocks.sendVoiceMessage,
}));

const accountMocks = vi.hoisted(() => ({
  resolveWeChatAccount: vi.fn(() => ({
    baseUrl: "http://localhost:9000",
    apiToken: "token",
    robotId: 1,
    config: {},
  })),
}));

vi.mock("./accounts.js", () => ({
  resolveWeChatAccount: accountMocks.resolveWeChatAccount,
}));

import { revokeMessageWeChat, sendMessageWeChat } from "./send.js";

const tempFiles: string[] = [];

async function createTempFile(filename: string, content: Uint8Array | string): Promise<string> {
  const filePath = path.join(os.tmpdir(), `${Date.now()}-${Math.random()}-${filename}`);
  await fs.writeFile(filePath, content);
  tempFiles.push(filePath);
  return filePath;
}

describe("sendMessageWeChat", () => {
  beforeEach(() => {
    accountMocks.resolveWeChatAccount.mockReset();
    accountMocks.resolveWeChatAccount.mockReturnValue({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: 1,
      config: {},
    });
    apiMocks.revokeMessage.mockReset();
    apiMocks.sendFileChunkMessage.mockReset();
    apiMocks.sendImageMessage.mockReset();
    apiMocks.sendLongTextMessage.mockReset();
    apiMocks.sendTextMessage.mockReset();
    apiMocks.sendVideoMessage.mockReset();
    apiMocks.sendVoiceMessage.mockReset();

    apiMocks.sendTextMessage.mockResolvedValue({
      code: 200,
      message: "ok",
      data: { message_id: "t-1" },
    });
    apiMocks.sendLongTextMessage.mockResolvedValue({
      code: 200,
      message: "ok",
      data: { message_id: "lt-1" },
    });
    apiMocks.sendImageMessage.mockResolvedValue({
      code: 200,
      message: "ok",
      data: { message_id: "img-1" },
    });
    apiMocks.sendVoiceMessage.mockResolvedValue({
      code: 200,
      message: "ok",
      data: { message_id: "voice-1" },
    });
    apiMocks.sendVideoMessage.mockResolvedValue({
      code: 200,
      message: "ok",
      data: { message_id: "video-1" },
    });
    apiMocks.sendFileChunkMessage.mockResolvedValue({ code: 200, message: "ok", data: {} });
    apiMocks.revokeMessage.mockResolvedValue({ code: 200, message: "ok", data: null });
  });

  afterEach(async () => {
    await Promise.all(tempFiles.splice(0).map((file) => fs.rm(file, { force: true })));
  });

  it("uses longtext endpoint for large plain text", async () => {
    const result = await sendMessageWeChat("wxid_test", "A".repeat(2500), {
      apiToken: "token",
      baseUrl: "http://localhost:9000",
      robotId: 1,
    });

    expect(result).toEqual({ ok: true, messageId: "lt-1" });
    expect(apiMocks.sendLongTextMessage).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendTextMessage).not.toHaveBeenCalled();
  });

  it("uses configured channels.wechat longTextThreshold when cfg is provided", async () => {
    accountMocks.resolveWeChatAccount.mockReturnValue({
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      robotId: 1,
      config: { longTextThreshold: 5000 },
    });

    const result = await sendMessageWeChat("wxid_test", "A".repeat(2500), {
      cfg: { channels: { wechat: { longTextThreshold: 5000 } } },
      accountId: "default",
    });

    expect(result).toEqual({ ok: true, messageId: "t-1" });
    expect(apiMocks.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendLongTextMessage).not.toHaveBeenCalled();
  });

  it("routes local mp4 media to video endpoint and sends companion text", async () => {
    const mediaPath = await createTempFile("clip.mp4", new Uint8Array([1, 2, 3, 4]));

    const result = await sendMessageWeChat("room@chatroom", "配套说明", {
      apiToken: "token",
      baseUrl: "http://localhost:9000",
      robotId: 1,
      mediaUrl: mediaPath,
    });

    expect(result).toEqual({ ok: true, messageId: "video-1" });
    expect(apiMocks.sendVideoMessage).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendTextMessage).toHaveBeenCalledTimes(1);
  });

  it("chunks generic files for upload", async () => {
    const mediaPath = await createTempFile("report.txt", "B".repeat(50_500));

    const result = await sendMessageWeChat("wxid_test", "", {
      apiToken: "token",
      baseUrl: "http://localhost:9000",
      robotId: 1,
      mediaUrl: mediaPath,
    });

    expect(result).toEqual({ ok: true, messageId: undefined });
    expect(apiMocks.sendFileChunkMessage).toHaveBeenCalledTimes(2);
    expect(apiMocks.sendFileChunkMessage.mock.calls[0]?.[1]).toMatchObject({
      chunk_index: 0,
      total_chunks: 2,
      filename: path.basename(mediaPath),
      file_size: 50_500,
    });
    expect(apiMocks.sendFileChunkMessage.mock.calls[1]?.[1]).toMatchObject({
      chunk_index: 1,
      total_chunks: 2,
    });
  });

  it("revokeMessageWeChat delegates to revoke api", async () => {
    const result = await revokeMessageWeChat(123456, {
      apiToken: "token",
      baseUrl: "http://localhost:9000",
      robotId: 1,
    });

    expect(result).toEqual({ ok: true, messageId: "123456" });
    expect(apiMocks.revokeMessage).toHaveBeenCalledWith(
      { apiToken: "token", baseUrl: "http://localhost:9000", robotId: 1 },
      { message_id: 123456 },
    );
  });
});
