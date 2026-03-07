/**
 * WeChat quoted message parser.
 * 微信引用消息解析器
 */

export type WeChatQuotedMessage = {
  currentBody: string;
  quotedBody?: string;
  quotedSender?: string;
  quotedSenderWxid?: string;
  quotedChatId?: string;
  quotedMessageId?: string;
  quotedMessageType?: number;
  rawXml: string;
};

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x0A;/gi, "\n")
    .replace(/&#10;/g, "\n")
    .replace(/&#x0D;/gi, "\r")
    .replace(/&#13;/g, "\r");
}

function stripTags(value: string): string {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
}

function normalizeXmlText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = stripTags(decodeXmlEntities(stripCdata(value)))
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized || undefined;
}

function extractSection(xml: string, tagName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return xml.match(pattern)?.[1];
}

function extractTagText(xml: string, tagName: string): string | undefined {
  return normalizeXmlText(extractSection(xml, tagName));
}

function extractNumericTag(xml: string, tagName: string): number | undefined {
  const value = extractTagText(xml, tagName);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractQuotedBodyFromDisplay(displayFullContent?: string): string | undefined {
  if (!displayFullContent) return undefined;
  const normalized = displayFullContent.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return undefined;

  const separatorPatterns = [/\n-{3,}\n/, /\n“([^”]+)”$/, /\n「([^」]+)」$/];
  for (const pattern of separatorPatterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    if (match[1]) {
      return match[1].trim() || undefined;
    }
    const parts = normalized.split(pattern);
    const tail = parts.at(-1)?.trim();
    if (tail) return tail;
  }

  return undefined;
}

/**
 * Parse WeChat quote-reply XML payload.
 * 解析微信引用回复 XML 内容
 */
export function parseWeChatQuotedMessage(params: {
  content: string;
  displayFullContent?: string;
}): WeChatQuotedMessage | null {
  const xml = params.content?.trim();
  if (!xml) return null;
  if (!xml.includes("<appmsg") || !xml.includes("<refermsg")) return null;

  const appmsgSection = extractSection(xml, "appmsg") ?? xml;
  const referSection = extractSection(appmsgSection, "refermsg");
  if (!referSection) return null;

  const currentBody = extractTagText(appmsgSection, "title") ?? "";
  const quotedBody =
    extractTagText(referSection, "content") ??
    extractQuotedBodyFromDisplay(params.displayFullContent);

  return {
    currentBody,
    quotedBody,
    quotedSender: extractTagText(referSection, "displayname"),
    quotedSenderWxid: extractTagText(referSection, "fromusr"),
    quotedChatId: extractTagText(referSection, "chatusr"),
    quotedMessageId: extractTagText(referSection, "svrid"),
    quotedMessageType: extractNumericTag(referSection, "type"),
    rawXml: xml,
  };
}
