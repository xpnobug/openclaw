import { describe, expect, it, vi } from "vitest";
import {
  checkLoginQr,
  pollInboundMessages,
  requestLoginQr,
  sendMediaViaApi,
  sendTextViaApi,
} from "./api.js";
import type { WechatIpadLoginType } from "./types.js";

type RequestArg = {
  options: unknown;
  method: "GET" | "POST";
  endpoint: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
  unwrapEnvelope?: boolean;
};

describe("wechat-ipad api requestLoginQr", () => {
  it("uses contracts endpoint for each login type", async () => {
    const endpointByType: Record<WechatIpadLoginType, string> = {
      ipad: "/api/Login/LoginGetQR",
      win: "/api/Login/LoginGetQRWin",
      mac: "/api/Login/LoginGetQRMac",
      car: "/api/Login/LoginGetQRCar",
    };

    for (const loginType of ["ipad", "win", "mac", "car"] as const) {
      const requestFn = vi.fn(async (_arg: RequestArg) => ({
        Uuid: `uuid-${loginType}`,
      }));

      await requestLoginQr(
        {
          options: {
            baseUrl: "http://localhost:9000",
            apiToken: "token",
            robotId: "default",
          },
          request: {
            loginType,
          },
        },
        requestFn,
      );

      const callArg = requestFn.mock.calls[0]?.[0] as RequestArg & {
        body?: Record<string, unknown>;
      };
      expect(callArg.endpoint).toBe(endpointByType[loginType]);
      expect(callArg.body?.LoginType).toBe(loginType);
    }
  });

  it("parses uppercase Data envelope and Uuid/QrBase64 fields", async () => {
    const responsePayload = {
      Code: 1,
      Success: true,
      Message: "成功",
      Data: {
        Uuid: "wde00tjAXbuIKFUc9ySK",
        QrBase64: "BASE64_CONTENT",
        QrUrl: "https://example.com/qr",
        DeviceId: "device-1",
        Data62: "D62_TOKEN",
        ExpiredTime: "2026-03-07 10:30:00",
      },
    };

    const requestFn = vi.fn(async (_arg: RequestArg) => responsePayload.Data);

    const result = await requestLoginQr(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        request: {
          loginType: "ipad",
        },
      },
      requestFn,
    );

    expect(result.uuid).toBe("wde00tjAXbuIKFUc9ySK");
    expect(result.qrDataUrl).toBe("BASE64_CONTENT");
    expect(result.qrUrl).toBe("https://example.com/qr");
    expect(result.deviceId).toBe("device-1");
    expect(result.data62).toBe("D62_TOKEN");
    expect(result.expiredTime).toBe("2026-03-07 10:30:00");
    expect(requestFn).toHaveBeenCalledOnce();

    const callArg = requestFn.mock.calls[0]?.[0] as RequestArg & { body?: Record<string, unknown> };
    expect(callArg.body?.LoginType).toBe("ipad");
    expect(callArg.body?.login_type).toBeUndefined();
  });

  it("extracts ticket from Data string for verification flow", async () => {
    const requestFn = vi.fn(async (_arg: RequestArg) => ({
      Code: 0,
      Success: true,
      Message: "请提交验证码后登录",
      Data: "ticket-xyz",
    }));

    const result = await checkLoginQr(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        session: {
          uuid: "uuid-1",
          accountId: "default",
          startedAt: Date.now(),
          loginType: "ipad",
        },
      },
      requestFn,
    );

    expect(result.connected).toBe(false);
    expect(result.requiresVerification).toBe(true);
    expect(result.ticket).toBe("ticket-xyz");

    const callArg = requestFn.mock.calls[0]?.[0] as RequestArg;
    expect(callArg.unwrapEnvelope).toBe(false);
    expect(callArg.endpoint).toContain("/api/Login/LoginCheckQR");
  });

  it("uses /api/Msg contracts for text/media/sync", async () => {
    const textRequestFn = vi.fn(async (_arg: RequestArg) => ({
      List: [{ NewMsgId: 200 }],
    }));
    const mediaRequestFn = vi.fn(async (_arg: RequestArg) => ({
      Newmsgid: 300,
    }));
    const syncRequestFn = vi.fn(async (_arg: RequestArg) => ({
      AddMsgs: [
        {
          MsgId: 100,
          NewMsgId: 200,
          FromUserName: { string: "wxid_a" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 1,
          Content: { string: "hello" },
          CreateTime: 1700000000,
        },
      ],
    }));

    const textRes = await sendTextViaApi(
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

    const mediaRes = await sendMediaViaApi(
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

    const syncRes = await pollInboundMessages(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
      },
      syncRequestFn,
    );

    expect(textRes.messageId).toBe("200");
    expect(mediaRes.messageId).toBe("300");
    expect(syncRes.items).toHaveLength(1);
    expect(syncRes.items[0]?.senderId).toBe("wxid_a");

    const textArg = textRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(textArg.endpoint).toBe("/api/Msg/SendTxt");
    expect(textArg.body?.Wxid).toBe("wxid_bot");
    expect(textArg.body?.ToWxid).toBe("wxid_a");

    const mediaArg = mediaRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(mediaArg.endpoint).toBe("/api/Msg/UploadImg");
    expect(mediaArg.body?.Base64).toBe("data:image/png;base64,AAAA");

    const syncArg = syncRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(syncArg.endpoint).toBe("/api/Msg/Sync");
    expect(syncArg.body?.Wxid).toBe("wxid_bot");
    expect(syncArg.body?.Scene).toBe(0);
  });
});
