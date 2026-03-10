import type { RequestInit } from "undici";
import { describe, expect, it, vi } from "vitest";
import {
  checkLoginQr,
  collectInboundContactIds,
  fetchBotProfileViaApi,
  listContactIdsViaApi,
  normalizeWechatIpadSyncAddMsg,
  pollInboundMessages,
  requestLoginQr,
  sendLinkCardViaApi,
  sendLongTextViaApi,
  sendMediaViaApi,
  sendQuoteTextViaApi,
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
  it("includes endpoint name in timeout errors", async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;

    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      init?.signal?.throwIfAborted?.();
      throw abortError;
    });

    globalThis.fetch = fetchMock as typeof fetch;
    globalThis.setTimeout = ((callback: TimerHandler) => {
      if (typeof callback === "function") {
        callback();
      }
      return 1 as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = vi.fn() as typeof clearTimeout;

    try {
      await expect(
        requestLoginQr({
          options: {
            baseUrl: "http://localhost:9000",
            apiToken: "token",
            robotId: "default",
          },
          request: {
            loginType: "ipad",
          },
        }),
      ).rejects.toThrow("POST /api/Login/LoginGetQR 请求超时（10000ms）");
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
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

  it("lists contact ids via contact list api with seq pagination", async () => {
    const listRequestFn = vi
      .fn(async (_arg: RequestArg) => ({
        CurrentWxcontactSeq: 10,
        CurrentChatRoomContactSeq: 20,
        CountinueFlag: 1,
        ContactUsernameList: ["wxid_a", "room@chatroom", "wxid_bot"],
      }))
      .mockResolvedValueOnce({
        CurrentWxcontactSeq: 10,
        CurrentChatRoomContactSeq: 20,
        CountinueFlag: 1,
        ContactUsernameList: ["wxid_a", "room@chatroom", "wxid_bot"],
      })
      .mockResolvedValueOnce({
        CurrentWxcontactSeq: 11,
        CurrentChatRoomContactSeq: 21,
        CountinueFlag: 0,
        ContactUsernameList: ["wxid_b", "room@chatroom"],
      });

    const result = await listContactIdsViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
      },
      listRequestFn,
    );

    expect(result.contactIds).toEqual(["wxid_a", "room@chatroom", "wxid_b"]);
    expect(result.currentWxcontactSeq).toBe(11);
    expect(result.currentChatRoomContactSeq).toBe(21);
    expect(listRequestFn).toHaveBeenCalledTimes(2);

    const firstArg = listRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    const secondArg = listRequestFn.mock.calls[1]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(firstArg.endpoint).toBe("/api/Friend/GetContractList");
    expect(firstArg.body).toEqual({
      Wxid: "wxid_bot",
      CurrentWxcontactSeq: 0,
      CurrentChatRoomContactSeq: 0,
    });
    expect(secondArg.body).toEqual({
      Wxid: "wxid_bot",
      CurrentWxcontactSeq: 10,
      CurrentChatRoomContactSeq: 20,
    });
  });

  it("detects group mentions and self messages from sync payload", async () => {
    const syncRequestFn = vi.fn(async (_arg: RequestArg) => ({
      AddMsgs: [
        {
          MsgId: 101,
          NewMsgId: 201,
          FromUserName: { string: "room@chatroom" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 1,
          Content: { string: "wxid_member:\n@你 hello" },
          MsgSource:
            "<msgsource><atuserlist><![CDATA[wxid_bot,wxid_other]]></atuserlist></msgsource>",
          CreateTime: 1700000000,
        },
        {
          MsgId: 102,
          NewMsgId: 202,
          FromUserName: { string: "wxid_bot" },
          ToUserName: { string: "wxid_friend" },
          MsgType: 1,
          Content: { string: "self" },
          CreateTime: 1700000001,
        },
      ],
    }));

    const result = await pollInboundMessages(
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

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.isAtMe).toBe(true);
    expect(result.items[0]?.isFromSelf).toBe(false);
    expect(result.items[0]?.messageType).toBe(1);
    expect(result.items[0]?.contentType).toBe("text");
    expect(result.items[1]?.isAtMe).toBe(false);
    expect(result.items[1]?.isFromSelf).toBe(true);
  });

  it("maps high-value inbound message types and quote payload", async () => {
    const syncRequestFn = vi.fn(async (_arg: RequestArg) => ({
      AddMsgs: [
        {
          MsgId: 201,
          NewMsgId: 301,
          FromUserName: { string: "wxid_a" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 3,
          Content: { string: "[图片]" },
          CreateTime: 1700000100,
        },
        {
          MsgId: 202,
          NewMsgId: 302,
          FromUserName: { string: "wxid_a" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 34,
          Content: { string: "[语音]" },
          CreateTime: 1700000101,
        },
        {
          MsgId: 203,
          NewMsgId: 303,
          FromUserName: { string: "wxid_a" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 43,
          Content: { string: "[视频]" },
          CreateTime: 1700000102,
        },
        {
          MsgId: 204,
          NewMsgId: 304,
          FromUserName: { string: "wxid_a" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 10002,
          Content: { string: "你撤回了一条消息" },
          CreateTime: 1700000103,
        },
        {
          MsgId: 205,
          NewMsgId: 305,
          MsgSeq: 778899,
          FromUserName: { string: "room@chatroom" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 49,
          MsgSource: "<msgsource><atuserlist><![CDATA[wxid_bot]]></atuserlist></msgsource>",
          Content: {
            string:
              "<msg><appmsg><title><![CDATA[我来回复一下]]></title><type>57</type><refermsg><svrid>123456789</svrid><fromusr><![CDATA[wxid_sender]]></fromusr><chatusr><![CDATA[room@chatroom]]></chatusr><displayname><![CDATA[张三]]></displayname><content><![CDATA[原消息内容 &amp; 细节]]></content><type>1</type><msgsource>&lt;msgsource&gt;&lt;sequence_id&gt;778899&lt;/sequence_id&gt;&lt;/msgsource&gt;</msgsource></refermsg></appmsg></msg>",
          },
          CreateTime: 1700000104,
        },
        {
          MsgId: 206,
          NewMsgId: 306,
          FromUserName: { string: "wxid_a" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 49,
          Content: {
            string: "<msg><appmsg><title><![CDATA[文档]]></title><type>6</type></appmsg></msg>",
          },
          CreateTime: 1700000105,
        },
        {
          MsgId: 207,
          NewMsgId: 307,
          FromUserName: { string: "wxid_a" },
          ToUserName: { string: "wxid_bot" },
          MsgType: 49,
          Content: {
            string: "<msg><appmsg><title><![CDATA[文章]]></title><type>5</type></appmsg></msg>",
          },
          CreateTime: 1700000106,
        },
      ],
    }));

    const result = await pollInboundMessages(
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

    expect(result.items).toHaveLength(7);
    expect(result.items[0]?.contentType).toBe("image");
    expect(result.items[1]?.contentType).toBe("voice");
    expect(result.items[2]?.contentType).toBe("video");
    expect(result.items[3]?.contentType).toBe("system");
    expect(result.items[4]?.contentType).toBe("quote");
    expect(result.items[4]?.appMessageType).toBe(57);
    expect(result.items[4]?.body).toBe("我来回复一下");
    expect(result.items[4]?.msgId).toBe("305");
    expect(result.items[4]?.msgSeq).toBe("778899");
    expect(result.items[4]?.rawMsgSource).toBe(
      "<msgsource><atuserlist><![CDATA[wxid_bot]]></atuserlist></msgsource>",
    );
    expect(result.items[4]?.msgIdFull).toContain('"msgId":"305"');
    expect(result.items[4]?.msgIdFull).toContain('"msgSeq":"778899"');
    expect(result.items[4]?.quotedMessage).toEqual({
      currentBody: "我来回复一下",
      quotedBody: "原消息内容 & 细节",
      quotedSender: "张三",
      quotedSenderWxid: "wxid_sender",
      quotedChatId: "room@chatroom",
      quotedMessageId: "123456789",
      quotedMessageIdFull: expect.stringContaining('"msgId":"123456789"'),
      quotedMessageType: 1,
      quotedMessageSequenceId: "778899",
      quotedMessageMsgSource: "<msgsource><sequence_id>778899</sequence_id></msgsource>",
      rawXml: expect.stringContaining("<appmsg>"),
    });
    expect(result.items[5]?.contentType).toBe("file");
    expect(result.items[5]?.appMessageType).toBe(6);
    expect(result.items[6]?.contentType).toBe("link");
    expect(result.items[6]?.appMessageType).toBe(5);
  });

  it("normalizes webhook-style sync records with shared helper", () => {
    const result = normalizeWechatIpadSyncAddMsg(
      {
        MsgId: 205,
        NewMsgId: 305,
        MsgSeq: 778899,
        FromUserName: { string: "room@chatroom" },
        ToUserName: { string: "wxid_bot" },
        MsgType: 49,
        MsgSource: "<msgsource><atuserlist><![CDATA[wxid_bot]]></atuserlist></msgsource>",
        Content: {
          string:
            "<msg><appmsg><title><![CDATA[我来回复一下]]></title><type>57</type><refermsg><svrid>123456789</svrid><fromusr><![CDATA[wxid_sender]]></fromusr><chatusr><![CDATA[room@chatroom]]></chatusr><displayname><![CDATA[张三]]></displayname><content><![CDATA[原消息内容]]></content><type>1</type><msgsource>&lt;msgsource&gt;&lt;sequence_id&gt;778899&lt;/sequence_id&gt;&lt;/msgsource&gt;</msgsource></refermsg></appmsg></msg>",
        },
        CreateTime: 1700000104,
      },
      "wxid_bot",
    );

    expect(result).toMatchObject({
      id: "room@chatroom:305",
      msgId: "305",
      msgSeq: "778899",
      chatType: "group",
      chatId: "room@chatroom",
      senderId: "room@chatroom",
      body: "我来回复一下",
      isAtMe: true,
      contentType: "quote",
    });
    expect(result?.quotedMessage?.quotedMessageId).toBe("123456789");
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

    const quoteRequestFn = vi.fn(async (_arg: RequestArg) => ({
      NewMsgId: 400,
    }));
    const quoteRes = await sendQuoteTextViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
        toWxid: "wxid_a",
        text: "回复内容",
        replyToId:
          'wechat-ipad:{"msgId":"123456789","msgSeq":"778899","senderId":"wxid_sender","senderName":"张三","body":"原消息内容"}',
      },
      quoteRequestFn,
    );

    const linkRequestFn = vi.fn(async (_arg: RequestArg) => ({
      NewMsgId: 500,
    }));
    const linkRes = await sendLinkCardViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
        toWxid: "wxid_a",
        title: "OpenClaw",
        url: "https://openclaw.ai",
        desc: "文档入口",
        thumbUrl: "https://openclaw.ai/icon.png",
      },
      linkRequestFn,
    );

    const longTextRequestFn = vi.fn(async (_arg: RequestArg) => ({
      NewMsgId: 600,
    }));
    const longTextRes = await sendLongTextViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
        toWxid: "wxid_a",
        text: "这是一段很长的内容，用于验证长文本消息走 SendApp Type=19。",
        senderName: "OpenClaw 机器人",
        nowMs: 1700000500000,
      },
      longTextRequestFn,
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
    expect(quoteRes.messageId).toBe("400");
    expect(linkRes.messageId).toBe("500");
    expect(longTextRes.messageId).toBe("600");
    expect(syncRes.items).toHaveLength(1);
    expect(syncRes.items[0]?.senderId).toBe("wxid_a");
    expect(syncRes.contactIds).toEqual(["wxid_a"]);

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

    const quoteArg = quoteRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(quoteArg.endpoint).toBe("/api/Msg/SendApp");
    expect(quoteArg.body?.Type).toBe(57);
    expect(String(quoteArg.body?.Xml)).toContain("<refermsg>");
    expect(String(quoteArg.body?.Xml)).toContain("<svrid>123456789</svrid>");
    expect(String(quoteArg.body?.Xml)).toContain("&lt;sequence_id&gt;778899&lt;/sequence_id&gt;");

    const linkArg = linkRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(linkArg.endpoint).toBe("/api/Msg/SendApp");
    expect(linkArg.body?.Type).toBe(5);
    expect(String(linkArg.body?.Xml)).toContain("<type>5</type>");
    expect(String(linkArg.body?.Xml)).toContain("<title>OpenClaw</title>");
    expect(String(linkArg.body?.Xml)).toContain("<url>https://openclaw.ai</url>");
    expect(String(linkArg.body?.Xml)).toContain(
      "<thumburl>https://openclaw.ai/icon.png</thumburl>",
    );

    const longTextArg = longTextRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(longTextArg.endpoint).toBe("/api/Msg/SendApp");
    expect(longTextArg.body?.Type).toBe(19);
    expect(String(longTextArg.body?.Xml)).toContain("<title>群聊的聊天记录</title>");
    expect(String(longTextArg.body?.Xml)).toContain("<type>19</type>");
    expect(String(longTextArg.body?.Xml)).toContain(
      "<des>OpenClaw 机器人: 这是一段很长的内容，用于验证长文本消息走 SendApp Type=19。</des>",
    );
    expect(String(longTextArg.body?.Xml)).toContain("<recorditem><![CDATA[");
    expect(String(longTextArg.body?.Xml)).toContain("<recordinfo>");
    expect(String(longTextArg.body?.Xml)).toContain('<dataitem datatype="1"');
    expect(String(longTextArg.body?.Xml)).toContain("<sourcename>OpenClaw 机器人</sourcename>");
    expect(String(longTextArg.body?.Xml)).toContain(
      "<datadesc>这是一段很长的内容，用于验证长文本消息走 SendApp Type=19。</datadesc>",
    );

    const syncArg = syncRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(syncArg.endpoint).toBe("/api/Msg/Sync");
    expect(syncArg.body?.Wxid).toBe("wxid_bot");
    expect(syncArg.body?.Scene).toBe(0);
  });

  it("collects inbound contact ids for direct and group messages", () => {
    const contactIds = collectInboundContactIds([
      {
        id: "1",
        from: "wxid_a",
        senderId: "wxid_a",
        chatId: "wxid_a",
        chatType: "direct",
        body: "hi",
        timestamp: 1,
        isAtMe: false,
      },
      {
        id: "2",
        from: "room@chatroom",
        senderId: "wxid_member",
        chatId: "room@chatroom",
        chatType: "group",
        body: "hello",
        timestamp: 2,
        isAtMe: false,
      },
      {
        id: "3",
        from: "wxid_a",
        senderId: "wxid_a",
        chatId: "wxid_a",
        chatType: "direct",
        body: "repeat",
        timestamp: 3,
        isAtMe: false,
      },
    ]);

    expect(contactIds).toEqual(["wxid_a", "room@chatroom"]);
  });

  it("fetchBotProfileViaApi parses NickName and BigHeadImgUrl", async () => {
    const requestFn = vi.fn(async (_arg: RequestArg) => ({
      userInfo: { NickName: "测试机器人" },
      userInfoExt: {
        BigHeadImgUrl: "https://wx.qlogo.cn/big.png",
        SmallHeadImgUrl: "https://wx.qlogo.cn/small.png",
      },
    }));

    const profile = await fetchBotProfileViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
      },
      requestFn,
    );

    expect(profile.nickname).toBe("测试机器人");
    expect(profile.headImgUrl).toBe("https://wx.qlogo.cn/big.png");
    expect(profile.fetchedAt).toBeGreaterThan(0);

    const callArg = requestFn.mock.calls[0]?.[0] as RequestArg;
    expect(callArg.endpoint).toContain("/api/User/GetContractProfile");
    expect(callArg.endpoint).toContain("wxid=wxid_bot");
  });

  it("fetchBotProfileViaApi falls back to SmallHeadImgUrl when BigHeadImgUrl is empty", async () => {
    const requestFn = vi.fn(async (_arg: RequestArg) => ({
      userInfo: { NickName: "机器人" },
      userInfoExt: {
        BigHeadImgUrl: "",
        SmallHeadImgUrl: "https://wx.qlogo.cn/small.png",
      },
    }));

    const profile = await fetchBotProfileViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
      },
      requestFn,
    );

    expect(profile.headImgUrl).toBe("https://wx.qlogo.cn/small.png");
  });

  it("fetchBotProfileViaApi falls back to wxid when NickName is missing", async () => {
    const requestFn = vi.fn(async (_arg: RequestArg) => ({
      userInfo: {},
      userInfoExt: {},
    }));

    const profile = await fetchBotProfileViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_fallback",
      },
      requestFn,
    );

    expect(profile.nickname).toBe("wxid_fallback");
    expect(profile.headImgUrl).toBe("");
  });

  it("sendLongTextViaApi passes custom title into XML", async () => {
    const longTextRequestFn = vi.fn(async (_arg: RequestArg) => ({
      NewMsgId: 700,
    }));

    await sendLongTextViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
        toWxid: "wxid_a",
        text: "长文本内容",
        senderName: "机器人",
        title: "自定义标题",
        nowMs: 1700000500000,
      },
      longTextRequestFn,
    );

    const arg = longTextRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(String(arg.body?.Xml)).toContain("<title>自定义标题</title>");
    expect(String(arg.body?.Xml)).not.toContain("群聊的聊天记录");
  });

  it("sendLongTextViaApi uses default title when custom title is absent", async () => {
    const longTextRequestFn = vi.fn(async (_arg: RequestArg) => ({
      NewMsgId: 701,
    }));

    await sendLongTextViaApi(
      {
        options: {
          baseUrl: "http://localhost:9000",
          apiToken: "token",
          robotId: "default",
        },
        wxid: "wxid_bot",
        toWxid: "wxid_a",
        text: "长文本内容",
        nowMs: 1700000500000,
      },
      longTextRequestFn,
    );

    const arg = longTextRequestFn.mock.calls[0]?.[0] as RequestArg & {
      body?: Record<string, unknown>;
    };
    expect(String(arg.body?.Xml)).toContain("<title>群聊的聊天记录</title>");
  });
});
