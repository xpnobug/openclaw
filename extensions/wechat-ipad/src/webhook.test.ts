import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWechatIpadAccount } from "./accounts.js";
import { setWechatIpadLoginSession } from "./runtime.js";
import {
  clearWechatIpadWebhookSecurityStateForTest,
  handleWechatIpadWebhookRequest,
  registerWechatIpadWebhookTarget,
} from "./webhook.js";

const inboundMocks = vi.hoisted(() => ({
  handleWechatIpadInboundMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./inbound.js", () => ({
  handleWechatIpadInboundMessage: inboundMocks.handleWechatIpadInboundMessage,
}));

function createMockRequest(
  method: string,
  url: string,
  body?: unknown,
  opts?: { headers?: Record<string, string>; remoteAddress?: string },
): IncomingMessage {
  const socket = new Socket();
  Object.defineProperty(socket, "remoteAddress", {
    value: opts?.remoteAddress ?? "127.0.0.1",
    configurable: true,
  });
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000", ...(opts?.headers ?? {}) };

  if (body !== undefined) {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    process.nextTick(() => {
      req.emit("data", Buffer.from(text));
      req.emit("end");
    });
  } else {
    process.nextTick(() => {
      req.emit("end");
    });
  }

  return req;
}

function createMockResponse(): ServerResponse & {
  _getData: () => string;
  _getStatusCode: () => number;
} {
  const res = new ServerResponse({} as IncomingMessage);
  let data = "";
  let statusCode = 200;

  res.write = function (chunk: unknown) {
    data += String(chunk);
    return true;
  };

  res.end = function (chunk?: unknown) {
    if (chunk) {
      data += String(chunk);
    }
    return this;
  };

  Object.defineProperty(res, "statusCode", {
    get: () => statusCode,
    set: (code: number) => {
      statusCode = code;
    },
  });

  (res as unknown as { _getData: () => string })._getData = () => data;
  (res as unknown as { _getStatusCode: () => number })._getStatusCode = () => statusCode;
  return res as ServerResponse & { _getData: () => string; _getStatusCode: () => number };
}

function registerDefaultTarget(
  overrides?: Partial<Parameters<typeof registerWechatIpadWebhookTarget>[0]>,
) {
  return registerWechatIpadWebhookTarget({
    accountId: "default",
    account: {
      accountId: "default",
      enabled: true,
      baseUrl: "http://localhost:9000",
      apiToken: "token",
      tokenSource: "config",
      robotId: "default",
      inbound: {
        mode: "webhook",
        polling: {
          intervalMs: 3000,
          lookbackSeconds: 120,
          maxPagesPerPoll: 10,
          pollAllContacts: false,
          pollContactIds: [],
        },
        webhook: {
          path: "/plugins/wechat-ipad/webhook/default",
          secret: "secret-token",
          authMode: "header",
          maxBodyBytes: 1024 * 1024,
          dedupeWindowMs: 5 * 60_000,
          rateLimitPerMinute: 2,
        },
      },
      config: {
        dmPolicy: "open",
      },
    },
    cfg: { channels: {} },
    runtime: {
      error: vi.fn(),
    } as never,
    path: "/plugins/wechat-ipad/webhook/default",
    secret: "secret-token",
    authMode: "header",
    wxid: "wxid_bot",
    log: vi.fn(),
    statusSink: vi.fn(),
    ...overrides,
  });
}

describe("wechat-ipad webhook", () => {
  beforeEach(() => {
    inboundMocks.handleWechatIpadInboundMessage.mockClear();
    clearWechatIpadWebhookSecurityStateForTest();
  });

  it("reads webhook config only from the target account", () => {
    const account = resolveWechatIpadAccount({
      cfg: {
        channels: {
          "wechat-ipad": {
            accounts: {
              main: {
                apiToken: "token-main",
                wxid: "wxid_main",
                inbound: {
                  mode: "webhook",
                  webhook: {
                    path: "/plugins/wechat-ipad/webhook/main",
                    secret: "main-secret",
                    authMode: "query",
                  },
                },
              },
              ops: {
                apiToken: "token-ops",
                wxid: "wxid_ops",
                inbound: {
                  mode: "webhook",
                  webhook: {
                    path: "/plugins/wechat-ipad/webhook/ops",
                    secret: "ops-secret",
                    authMode: "header",
                  },
                },
              },
            },
          },
        },
      },
      accountId: "main",
    });

    expect(account.config.wxid).toBe("wxid_main");
    expect(account.inbound.webhook.path).toBe("/plugins/wechat-ipad/webhook/main");
    expect(account.inbound.webhook.secret).toBe("main-secret");
    expect(account.inbound.webhook.authMode).toBe("query");
  });

  it("acks valid callbacks and dispatches normalized messages once", async () => {
    const unregister = registerDefaultTarget();
    const req = createMockRequest(
      "POST",
      "/plugins/wechat-ipad/webhook/default",
      {
        Wxid: "wxid_bot",
        Data: {
          AddMsgs: [
            {
              NewMsgId: 123,
              MsgId: 123,
              FromUserName: { string: "wxid_friend" },
              ToUserName: { string: "wxid_bot" },
              MsgType: 1,
              Content: { string: "hello" },
              CreateTime: 1700000000,
            },
          ],
        },
      },
      {
        headers: {
          "content-type": "application/json",
          "x-wechat-ipad-secret": "secret-token",
        },
      },
    );
    const res = createMockResponse();

    await handleWechatIpadWebhookRequest(req, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toBe("ok");
    expect(inboundMocks.handleWechatIpadInboundMessage).toHaveBeenCalledTimes(1);
    expect(inboundMocks.handleWechatIpadInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "hello",
        chatType: "direct",
        senderId: "wxid_friend",
      }),
      expect.any(Object),
    );

    const duplicateReq = createMockRequest(
      "POST",
      "/plugins/wechat-ipad/webhook/default",
      {
        Wxid: "wxid_bot",
        Data: {
          AddMsgs: [
            {
              NewMsgId: 123,
              MsgId: 123,
              FromUserName: { string: "wxid_friend" },
              ToUserName: { string: "wxid_bot" },
              MsgType: 1,
              Content: { string: "hello" },
              CreateTime: 1700000000,
            },
          ],
        },
      },
      {
        headers: {
          "content-type": "application/json",
          "x-wechat-ipad-secret": "secret-token",
        },
      },
    );
    const duplicateRes = createMockResponse();

    await handleWechatIpadWebhookRequest(duplicateReq, duplicateRes);
    await new Promise((resolve) => setImmediate(resolve));

    expect(duplicateRes._getStatusCode()).toBe(200);
    expect(inboundMocks.handleWechatIpadInboundMessage).toHaveBeenCalledTimes(1);
    unregister();
  });

  it("ignores replayed history messages older than the latest successful login", async () => {
    setWechatIpadLoginSession({
      uuid: "login-1",
      accountId: "default",
      startedAt: 1_700_000_000_000,
      loginType: "ipad",
      wxid: "wxid_bot",
      connectedAt: 1_700_000_100_000,
    });

    const unregister = registerDefaultTarget();
    const replayReq = createMockRequest(
      "POST",
      "/plugins/wechat-ipad/webhook/default",
      {
        Wxid: "wxid_bot",
        Data: {
          AddMsgs: [
            {
              NewMsgId: 789,
              MsgId: 789,
              FromUserName: { string: "wxid_friend" },
              ToUserName: { string: "wxid_bot" },
              MsgType: 1,
              Content: { string: "old message" },
              CreateTime: 1_700_000_000,
            },
          ],
        },
      },
      {
        headers: {
          "content-type": "application/json",
          "x-wechat-ipad-secret": "secret-token",
        },
      },
    );
    const replayRes = createMockResponse();

    await handleWechatIpadWebhookRequest(replayReq, replayRes);
    await new Promise((resolve) => setImmediate(resolve));

    expect(replayRes._getStatusCode()).toBe(200);
    expect(inboundMocks.handleWechatIpadInboundMessage).not.toHaveBeenCalled();

    const freshReq = createMockRequest(
      "POST",
      "/plugins/wechat-ipad/webhook/default",
      {
        Wxid: "wxid_bot",
        Data: {
          AddMsgs: [
            {
              NewMsgId: 790,
              MsgId: 790,
              FromUserName: { string: "wxid_friend" },
              ToUserName: { string: "wxid_bot" },
              MsgType: 1,
              Content: { string: "fresh message" },
              CreateTime: 1_700_000_101,
            },
          ],
        },
      },
      {
        headers: {
          "content-type": "application/json",
          "x-wechat-ipad-secret": "secret-token",
        },
      },
    );
    const freshRes = createMockResponse();

    await handleWechatIpadWebhookRequest(freshReq, freshRes);
    await new Promise((resolve) => setImmediate(resolve));

    expect(freshRes._getStatusCode()).toBe(200);
    expect(inboundMocks.handleWechatIpadInboundMessage).toHaveBeenCalledTimes(1);
    expect(inboundMocks.handleWechatIpadInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "fresh message",
        msgId: "790",
      }),
      expect.any(Object),
    );
    unregister();
  });

  it("accepts callbacks without secret when authMode is none", async () => {
    const unregister = registerDefaultTarget({
      account: {
        accountId: "default",
        enabled: true,
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        tokenSource: "config",
        robotId: "default",
        inbound: {
          mode: "webhook",
          polling: {
            intervalMs: 3000,
            lookbackSeconds: 120,
            maxPagesPerPoll: 10,
            pollAllContacts: false,
            pollContactIds: [],
          },
          webhook: {
            path: "/plugins/wechat-ipad/webhook/default",
            secret: "",
            authMode: "none",
            maxBodyBytes: 1024 * 1024,
            dedupeWindowMs: 5 * 60_000,
            rateLimitPerMinute: 2,
          },
        },
        config: {
          dmPolicy: "open",
        },
      },
      secret: "",
      authMode: "none",
    });
    const req = createMockRequest(
      "POST",
      "/plugins/wechat-ipad/webhook/default",
      {
        Wxid: "wxid_bot",
        Data: {
          AddMsgs: [
            {
              NewMsgId: 456,
              MsgId: 456,
              FromUserName: { string: "wxid_friend" },
              ToUserName: { string: "wxid_bot" },
              MsgType: 1,
              Content: { string: "hello none" },
              CreateTime: 1700000001,
            },
          ],
        },
      },
      {
        headers: {
          "content-type": "application/json",
        },
      },
    );
    const res = createMockResponse();

    await handleWechatIpadWebhookRequest(req, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res._getStatusCode()).toBe(200);
    expect(inboundMocks.handleWechatIpadInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: "hello none" }),
      expect.any(Object),
    );
    unregister();
  });

  it("rejects wrong secret", async () => {
    const unregister = registerDefaultTarget();
    const req = createMockRequest(
      "POST",
      "/plugins/wechat-ipad/webhook/default",
      { Data: { AddMsgs: [] } },
      {
        headers: {
          "content-type": "application/json",
          "x-wechat-ipad-secret": "wrong-secret",
        },
      },
    );
    const res = createMockResponse();

    await handleWechatIpadWebhookRequest(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(inboundMocks.handleWechatIpadInboundMessage).not.toHaveBeenCalled();
    unregister();
  });

  it("rejects non-json payloads", async () => {
    const unregister = registerDefaultTarget();
    const req = createMockRequest("POST", "/plugins/wechat-ipad/webhook/default", "not-json", {
      headers: {
        "content-type": "text/plain",
        "x-wechat-ipad-secret": "secret-token",
      },
    });
    const res = createMockResponse();

    await handleWechatIpadWebhookRequest(req, res);

    expect(res._getStatusCode()).toBe(415);
    unregister();
  });

  it("rejects oversized bodies", async () => {
    const unregister = registerDefaultTarget({
      account: {
        accountId: "default",
        enabled: true,
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        tokenSource: "config",
        robotId: "default",
        inbound: {
          mode: "webhook",
          polling: {
            intervalMs: 3000,
            lookbackSeconds: 120,
            maxPagesPerPoll: 10,
            pollAllContacts: false,
            pollContactIds: [],
          },
          webhook: {
            path: "/plugins/wechat-ipad/webhook/default",
            secret: "secret-token",
            authMode: "header",
            maxBodyBytes: 16,
            dedupeWindowMs: 5 * 60_000,
            rateLimitPerMinute: 2,
          },
        },
        config: {
          dmPolicy: "open",
        },
      },
    });
    const req = createMockRequest(
      "POST",
      "/plugins/wechat-ipad/webhook/default",
      { Data: { AddMsgs: [{ Content: { string: "x".repeat(200) } }] } },
      {
        headers: {
          "content-type": "application/json",
          "x-wechat-ipad-secret": "secret-token",
        },
      },
    );
    const res = createMockResponse();

    await handleWechatIpadWebhookRequest(req, res);

    expect(res._getStatusCode()).toBe(413);
    unregister();
  });

  it("rate limits high frequency callbacks", async () => {
    const unregister = registerDefaultTarget();
    const makeRequest = () =>
      createMockRequest(
        "POST",
        "/plugins/wechat-ipad/webhook/default",
        { Data: { AddMsgs: [] } },
        {
          headers: {
            "content-type": "application/json",
            "x-wechat-ipad-secret": "secret-token",
          },
          remoteAddress: "10.0.0.1",
        },
      );

    const first = createMockResponse();
    await handleWechatIpadWebhookRequest(makeRequest(), first);
    expect(first._getStatusCode()).toBe(200);

    const second = createMockResponse();
    await handleWechatIpadWebhookRequest(makeRequest(), second);
    expect(second._getStatusCode()).toBe(200);

    const third = createMockResponse();
    await handleWechatIpadWebhookRequest(makeRequest(), third);
    expect(third._getStatusCode()).toBe(429);
    unregister();
  });

  it("filters messages by pollContactIds in webhook mode", async () => {
    const unregister = registerDefaultTarget({
      account: {
        accountId: "default",
        enabled: true,
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        tokenSource: "config",
        robotId: "default",
        inbound: {
          mode: "webhook",
          polling: {
            intervalMs: 3000,
            lookbackSeconds: 120,
            maxPagesPerPoll: 10,
            pollAllContacts: false,
            pollContactIds: ["wxid_allowed", "allowed@chatroom"],
          },
          webhook: {
            path: "/plugins/wechat-ipad/webhook/default",
            secret: "secret-token",
            authMode: "header",
            maxBodyBytes: 1024 * 1024,
            dedupeWindowMs: 5 * 60_000,
            rateLimitPerMinute: 120,
          },
        },
        config: {
          dmPolicy: "open",
        },
      },
    });

    const req = createMockRequest(
      "POST",
      "/plugins/wechat-ipad/webhook/default",
      {
        Wxid: "wxid_bot",
        Data: {
          AddMsgs: [
            {
              NewMsgId: 1001,
              MsgId: 1001,
              FromUserName: { string: "wxid_allowed" },
              ToUserName: { string: "wxid_bot" },
              MsgType: 1,
              Content: { string: "白名单私聊" },
              CreateTime: 1700000010,
            },
            {
              NewMsgId: 1002,
              MsgId: 1002,
              FromUserName: { string: "wxid_blocked" },
              ToUserName: { string: "wxid_bot" },
              MsgType: 1,
              Content: { string: "非白名单私聊" },
              CreateTime: 1700000011,
            },
            {
              NewMsgId: 1003,
              MsgId: 1003,
              FromUserName: { string: "allowed@chatroom" },
              ToUserName: { string: "wxid_bot" },
              MsgType: 1,
              Content: { string: "wxid_member:\n白名单群聊" },
              CreateTime: 1700000012,
            },
            {
              NewMsgId: 1004,
              MsgId: 1004,
              FromUserName: { string: "blocked@chatroom" },
              ToUserName: { string: "wxid_bot" },
              MsgType: 1,
              Content: { string: "wxid_member:\n非白名单群聊" },
              CreateTime: 1700000013,
            },
          ],
        },
      },
      {
        headers: {
          "content-type": "application/json",
          "x-wechat-ipad-secret": "secret-token",
        },
      },
    );
    const res = createMockResponse();

    await handleWechatIpadWebhookRequest(req, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res._getStatusCode()).toBe(200);
    // 只有白名单中的 2 条消息被处理
    expect(inboundMocks.handleWechatIpadInboundMessage).toHaveBeenCalledTimes(2);
    expect(inboundMocks.handleWechatIpadInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: "白名单私聊", senderId: "wxid_allowed" }),
      expect.any(Object),
    );
    expect(inboundMocks.handleWechatIpadInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "allowed@chatroom" }),
      expect.any(Object),
    );
    unregister();
  });

  it("processes all messages when pollContactIds is empty", async () => {
    const unregister = registerDefaultTarget();

    const req = createMockRequest(
      "POST",
      "/plugins/wechat-ipad/webhook/default",
      {
        Wxid: "wxid_bot",
        Data: {
          AddMsgs: [
            {
              NewMsgId: 2001,
              MsgId: 2001,
              FromUserName: { string: "wxid_anyone" },
              ToUserName: { string: "wxid_bot" },
              MsgType: 1,
              Content: { string: "任意消息" },
              CreateTime: 1700000020,
            },
          ],
        },
      },
      {
        headers: {
          "content-type": "application/json",
          "x-wechat-ipad-secret": "secret-token",
        },
      },
    );
    const res = createMockResponse();

    await handleWechatIpadWebhookRequest(req, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res._getStatusCode()).toBe(200);
    expect(inboundMocks.handleWechatIpadInboundMessage).toHaveBeenCalledTimes(1);
    unregister();
  });
});
