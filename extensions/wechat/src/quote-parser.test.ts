import { describe, expect, it } from "vitest";
import { parseWeChatQuotedMessage } from "./quote-parser.js";

describe("parseWeChatQuotedMessage", () => {
  it("parses quote-reply xml payload", () => {
    const parsed = parseWeChatQuotedMessage({
      content: `
        <msg>
          <appmsg>
            <title><![CDATA[我来回复一下]]></title>
            <type>57</type>
            <refermsg>
              <svrid>123456789</svrid>
              <fromusr><![CDATA[wxid_sender]]></fromusr>
              <chatusr><![CDATA[test@chatroom]]></chatusr>
              <displayname><![CDATA[张三]]></displayname>
              <content><![CDATA[原消息内容 &amp; 细节]]></content>
              <type>1</type>
            </refermsg>
          </appmsg>
        </msg>
      `,
    });

    expect(parsed).toEqual({
      currentBody: "我来回复一下",
      quotedBody: "原消息内容 & 细节",
      quotedSender: "张三",
      quotedSenderWxid: "wxid_sender",
      quotedChatId: "test@chatroom",
      quotedMessageId: "123456789",
      quotedMessageType: 1,
      rawXml: expect.stringContaining("<appmsg>"),
    });
  });

  it("returns null for non-quote payload", () => {
    expect(
      parseWeChatQuotedMessage({
        content: "普通文本消息",
      }),
    ).toBeNull();
  });
});
