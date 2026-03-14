import { createHash, randomInt, randomUUID } from "node:crypto";
import type {
  WechatIpadApiCallOptions,
  WechatIpadBotProfile,
  WechatIpadContactInfo,
  WechatIpadInboundContentType,
  WechatIpadInboundMessage,
  WechatIpadLoginCheckResponse,
  WechatIpadLoginQrRequest,
  WechatIpadLoginQrResponse,
  WechatIpadLoginSession,
  WechatIpadQuotedMessage,
  WechatIpadVerificationCodeRequest,
  WechatIpadVerificationCodeResponse,
} from "../types.js";

function resolveInboundContactId(item: WechatIpadInboundMessage): string {
  return item.chatType === "group" ? item.chatId : item.senderId;
}

export function collectInboundContactIds(items: WechatIpadInboundMessage[]): string[] {
  const contactIds = new Set<string>();
  for (const item of items) {
    const contactId = resolveInboundContactId(item)?.trim();
    if (contactId) {
      contactIds.add(contactId);
    }
  }
  return Array.from(contactIds);
}

const DEFAULT_TIMEOUT_MS = 10000;

export class WechatIpadApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = "WechatIpadApiError";
  }
}

type ApiResponseEnvelope<T> = {
  code?: number;
  Code?: number;
  success?: boolean;
  Success?: boolean;
  message?: string;
  Message?: string;
  data?: T;
  Data?: T;
  [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readStringField(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

/** 读取可能是 `"value"` 或 `{ string: "value" }` 嵌套格式的字段。 */
function readWrappedStringField(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  const record = asRecord(value);
  if (record) {
    const inner = record.string;
    if (typeof inner === "string" && inner.trim()) {
      return inner.trim();
    }
  }
  return undefined;
}

function readStringListField(input: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = input[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const items = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length > 0) {
      return items;
    }
  }
  return [];
}

function readIdField(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function readNumberField(input: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

async function request<T>(params: {
  options: WechatIpadApiCallOptions;
  method: "GET" | "POST";
  endpoint: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
  unwrapEnvelope?: boolean;
}): Promise<T> {
  const { options, method, endpoint, body } = params;
  const url = new URL(endpoint, options.baseUrl);
  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiToken}`,
        "X-Robot-Id": options.robotId,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new WechatIpadApiError(
        `HTTP ${response.status} ${response.statusText}`,
        response.status,
        responseText,
      );
    }

    if (!responseText.trim()) {
      return {} as T;
    }

    const parsed = JSON.parse(responseText) as ApiResponseEnvelope<T> | T;
    if (parsed && typeof parsed === "object") {
      const envelope = parsed as ApiResponseEnvelope<T>;
      const hasEnvelopeData = "data" in envelope || "Data" in envelope;
      const hasEnvelopeMeta =
        "code" in envelope ||
        "Code" in envelope ||
        "success" in envelope ||
        "Success" in envelope ||
        "message" in envelope ||
        "Message" in envelope;

      if (hasEnvelopeData || hasEnvelopeMeta) {
        const success =
          typeof envelope.success === "boolean"
            ? envelope.success
            : typeof envelope.Success === "boolean"
              ? envelope.Success
              : undefined;
        const code =
          typeof envelope.code === "number"
            ? envelope.code
            : typeof envelope.Code === "number"
              ? envelope.Code
              : undefined;
        const message =
          typeof envelope.message === "string"
            ? envelope.message
            : typeof envelope.Message === "string"
              ? envelope.Message
              : undefined;

        if (success === false) {
          throw new WechatIpadApiError(
            message ?? "WeChat iPad API 返回不成功结果",
            code,
            responseText,
          );
        }
        if (typeof code === "number" && code !== 0 && code !== 200 && code !== 1) {
          throw new WechatIpadApiError(
            message ?? "WeChat iPad API 返回非成功状态码",
            code,
            responseText,
          );
        }

        if (params.unwrapEnvelope === false) {
          return parsed as T;
        }

        const data = (envelope.data ?? envelope.Data ?? ({} as T)) as T;
        return data;
      }
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof WechatIpadApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new WechatIpadApiError(`${method} ${endpoint} 请求超时（${timeoutMs}ms）`);
    }
    throw new WechatIpadApiError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function probeBackend(
  options: WechatIpadApiCallOptions,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>({
    options,
    method: "GET",
    endpoint: "/health",
  });
}

export type WechatIpadSyncMessageRecord = {
  MsgId?: number;
  FromUserName?: { string?: string } | null;
  ToUserName?: { string?: string } | null;
  MsgType?: number;
  Content?: { string?: string } | null;
  CreateTime?: number;
  MsgSource?: string;
  NewMsgId?: number;
  MsgSeq?: number;
};

function extractGroupSender(content: string): { senderId: string; body: string } | null {
  const trimmed = content.trim();
  const newlineIndex = trimmed.indexOf("\n");
  if (newlineIndex <= 0) {
    return null;
  }
  const maybeSender = trimmed.slice(0, newlineIndex).replace(/:$/, "").trim();
  if (!maybeSender || !/^wxid_[a-z0-9]+$/i.test(maybeSender)) {
    return null;
  }
  const body = trimmed.slice(newlineIndex + 1).trim();
  return {
    senderId: maybeSender,
    body: body || trimmed,
  };
}

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
  if (!value) {
    return undefined;
  }
  const normalized = stripTags(decodeXmlEntities(stripCdata(value)))
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized || undefined;
}

function extractXmlSection(xml: string, tagName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return xml.match(pattern)?.[1];
}

function extractXmlTagText(xml: string, tagName: string): string | undefined {
  return normalizeXmlText(extractXmlSection(xml, tagName));
}

function extractXmlNumericTag(xml: string, tagName: string): number | undefined {
  const value = extractXmlTagText(xml, tagName);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractMsgSourceTag(msgSource: string | undefined, tagName: string): string | null {
  if (!msgSource?.trim()) {
    return null;
  }
  const match = msgSource.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  if (!match?.[1]) {
    return null;
  }
  const normalized = normalizeXmlText(match[1]);
  return normalized ?? null;
}

type WechatIpadMessageIdFullParts = {
  msgId?: string;
  msgSeq?: string;
  createTime?: number;
  msgSource?: string;
  senderId?: string;
  senderName?: string;
  body?: string;
};

function encodeWechatIpadMessageIdFull(parts: WechatIpadMessageIdFullParts): string | undefined {
  const payload = {
    msgId: parts.msgId?.trim() || undefined,
    msgSeq: parts.msgSeq?.trim() || undefined,
    createTime:
      typeof parts.createTime === "number" && Number.isFinite(parts.createTime)
        ? Math.max(0, Math.trunc(parts.createTime))
        : undefined,
    msgSource: parts.msgSource?.trim() || undefined,
    senderId: parts.senderId?.trim() || undefined,
    senderName: parts.senderName?.trim() || undefined,
    body: parts.body?.trim() || undefined,
  };
  if (
    !payload.msgId &&
    !payload.msgSeq &&
    !payload.createTime &&
    !payload.msgSource &&
    !payload.senderId &&
    !payload.senderName &&
    !payload.body
  ) {
    return undefined;
  }
  return `wechat-ipad:${JSON.stringify(payload)}`;
}

function parseWechatIpadMessageIdFull(
  value: string | undefined,
): WechatIpadMessageIdFullParts | null {
  const raw = value?.trim();
  if (!raw?.startsWith("wechat-ipad:")) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw.slice("wechat-ipad:".length)) as WechatIpadMessageIdFullParts;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      msgId:
        typeof parsed.msgId === "string" && parsed.msgId.trim() ? parsed.msgId.trim() : undefined,
      msgSeq:
        typeof parsed.msgSeq === "string" && parsed.msgSeq.trim()
          ? parsed.msgSeq.trim()
          : undefined,
      createTime:
        typeof parsed.createTime === "number" && Number.isFinite(parsed.createTime)
          ? Math.max(0, Math.trunc(parsed.createTime))
          : undefined,
      msgSource:
        typeof parsed.msgSource === "string" && parsed.msgSource.trim()
          ? parsed.msgSource.trim()
          : undefined,
      senderId:
        typeof parsed.senderId === "string" && parsed.senderId.trim()
          ? parsed.senderId.trim()
          : undefined,
      senderName:
        typeof parsed.senderName === "string" && parsed.senderName.trim()
          ? parsed.senderName.trim()
          : undefined,
      body: typeof parsed.body === "string" && parsed.body.trim() ? parsed.body.trim() : undefined,
    };
  } catch {
    return null;
  }
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildWechatIpadLinkCardXml(card: {
  title: string;
  url: string;
  desc?: string;
  thumbUrl?: string;
}): string {
  const title = card.title.trim();
  const url = card.url.trim();
  const desc = card.desc?.trim() ?? "";
  const thumbUrl = card.thumbUrl?.trim() ?? "";
  return `<appmsg appid="" sdkver="0"><title>${escapeXmlText(title)}</title><des>${escapeXmlText(desc)}</des><action></action><type>5</type><showtype>0</showtype><soundtype>0</soundtype><mediatagname></mediatagname><messageext></messageext><messageaction></messageaction><content></content><contentattr>0</contentattr><url>${escapeXmlText(url)}</url><lowurl></lowurl><dataurl></dataurl><lowdataurl></lowdataurl><songalbumurl></songalbumurl><songlyric></songlyric><appattach><totallen>0</totallen><attachid></attachid><emoticonmd5></emoticonmd5><fileext></fileext><cdnthumbaeskey></cdnthumbaeskey><aeskey></aeskey></appattach><extinfo></extinfo><sourceusername></sourceusername><sourcedisplayname></sourcedisplayname><thumburl>${escapeXmlText(thumbUrl)}</thumburl><md5></md5><statextstr></statextstr><directshare>0</directshare></appmsg><fromusername></fromusername>`;
}

const WECHAT_IPAD_LONG_TEXT_TITLE = "群聊的聊天记录";
const WECHAT_IPAD_LONG_TEXT_UNSUPPORTED_URL =
  "https://support.weixin.qq.com/cgi-bin/mmsupport-bin/readtemplate?t=page/favorite_record__w_unsupport";

function wrapXmlCdata(value: string): string {
  return `<![CDATA[${value.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function formatWechatIpadSourceTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${hour}:${minute}`;
}

function buildWechatIpadLongTextXml(params: {
  wxid: string;
  text: string;
  senderName?: string;
  sourceHeadUrl?: string;
  title?: string;
  nowMs?: number;
}): string {
  const wxid = params.wxid.trim();
  const text = params.text.trim();
  const senderName = params.senderName?.trim() || wxid || "OpenClaw";
  const sourceHeadUrl = params.sourceHeadUrl?.trim() ?? "";
  const resolvedTitle = params.title?.trim() || WECHAT_IPAD_LONG_TEXT_TITLE;
  const nowMs = params.nowMs ?? Date.now();
  const sourceTimeMs = nowMs - 5 * 60_000;
  const summary = `${senderName}: ${text}`;
  const dataId = randomUUID().replaceAll("-", "");
  const srcMsgLocalId = randomInt(10_000, 100_000);
  const fromNewMsgId = (BigInt(nowMs) * 10_000n).toString();
  const hashUsername = createHash("sha256").update(wxid).digest("hex");
  const recordInfoXml = `<recordinfo><info>${escapeXmlText(summary)}</info><isChatRoom>1</isChatRoom><datalist count="1"><dataitem datatype="1" dataid="${dataId}"><srcMsgLocalid>${srcMsgLocalId}</srcMsgLocalid><sourcetime>${escapeXmlText(formatWechatIpadSourceTime(sourceTimeMs))}</sourcetime><fromnewmsgid>${fromNewMsgId}</fromnewmsgid><srcMsgCreateTime>${Math.floor(sourceTimeMs / 1000)}</srcMsgCreateTime><sourcename>${escapeXmlText(senderName)}</sourcename><sourceheadurl>${escapeXmlText(sourceHeadUrl)}</sourceheadurl><datadesc>${escapeXmlText(text)}</datadesc><dataitemsource><hashusername>${hashUsername}</hashusername></dataitemsource></dataitem></datalist><desc>${escapeXmlText(summary)}</desc><fromscene>3</fromscene></recordinfo>`;
  return `<appmsg appid="" sdkver="0"><title>${escapeXmlText(resolvedTitle)}</title><des>${escapeXmlText(summary)}</des><type>19</type><url>${escapeXmlText(WECHAT_IPAD_LONG_TEXT_UNSUPPORTED_URL)}</url><appattach><cdnthumbaeskey></cdnthumbaeskey><aeskey></aeskey></appattach><recorditem>${wrapXmlCdata(recordInfoXml)}</recorditem></appmsg>`;
}

function resolveIsAtMe(
  msgSource: string | undefined,
  currentWxid: string,
  chatType: "direct" | "group",
): boolean {
  if (chatType !== "group") {
    return false;
  }
  const normalizedWxid = currentWxid.trim();
  if (!normalizedWxid) {
    return false;
  }
  const atUserList = extractMsgSourceTag(msgSource, "atuserlist");
  if (!atUserList) {
    return false;
  }
  return atUserList
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .some((item) => item === normalizedWxid);
}

function parseQuotedMessage(content: string): WechatIpadQuotedMessage | null {
  const xml = content.trim();
  if (!xml.includes("<appmsg") || !xml.includes("<refermsg")) {
    return null;
  }
  const appmsgSection = extractXmlSection(xml, "appmsg") ?? xml;
  const referSection = extractXmlSection(appmsgSection, "refermsg");
  if (!referSection) {
    return null;
  }
  const quotedMessageId = extractXmlTagText(referSection, "svrid");
  const quotedMessageMsgSource =
    decodeXmlEntities(stripCdata(extractXmlSection(referSection, "msgsource") ?? "")).trim() ||
    undefined;
  const quotedMessageSequenceId = extractMsgSourceTag(quotedMessageMsgSource, "sequence_id");
  return {
    currentBody: extractXmlTagText(appmsgSection, "title") ?? "",
    quotedBody: extractXmlTagText(referSection, "content"),
    quotedSender: extractXmlTagText(referSection, "displayname"),
    quotedSenderWxid: extractXmlTagText(referSection, "fromusr"),
    quotedChatId: extractXmlTagText(referSection, "chatusr"),
    quotedMessageId,
    quotedMessageIdFull: encodeWechatIpadMessageIdFull({
      msgId: quotedMessageId,
      msgSeq: quotedMessageSequenceId ?? undefined,
      msgSource: quotedMessageMsgSource ?? undefined,
      senderId: extractXmlTagText(referSection, "fromusr") ?? undefined,
      senderName:
        extractXmlTagText(referSection, "displayname") ??
        extractXmlTagText(referSection, "fromusr") ??
        undefined,
      body: extractXmlTagText(referSection, "content") ?? undefined,
    }),
    quotedMessageType: extractXmlNumericTag(referSection, "type"),
    quotedMessageSequenceId: quotedMessageSequenceId ?? undefined,
    quotedMessageMsgSource: quotedMessageMsgSource ?? undefined,
    rawXml: xml,
  };
}

function resolveAppMessageType(content: string): number | undefined {
  const xml = content.trim();
  if (!xml.includes("<appmsg")) {
    return undefined;
  }
  const appmsgSection = extractXmlSection(xml, "appmsg") ?? xml;
  return extractXmlNumericTag(appmsgSection, "type");
}

function resolveInboundContentType(
  messageType: number | undefined,
  appMessageType: number | undefined,
  quotedMessage: WechatIpadQuotedMessage | null,
): WechatIpadInboundContentType {
  if (messageType === 1) {
    return "text";
  }
  if (messageType === 3) {
    return "image";
  }
  if (messageType === 34) {
    return "voice";
  }
  if (messageType === 43 || messageType === 62) {
    return "video";
  }
  if (messageType === 42) {
    return "card";
  }
  if (messageType === 47) {
    return "emoji";
  }
  if (messageType === 48) {
    return "location";
  }
  if (messageType === 51) {
    return "status";
  }
  if (messageType === 10000 || messageType === 10002) {
    return "system";
  }
  if (messageType === 49) {
    if (quotedMessage || appMessageType === 57) {
      return "quote";
    }
    if (appMessageType === 6) {
      return "file";
    }
    if (appMessageType === 5) {
      return "link";
    }
  }
  return "unknown";
}

export function normalizeWechatIpadSyncAddMsg(
  record: WechatIpadSyncMessageRecord,
  currentWxid: string,
): WechatIpadInboundMessage | null {
  const fromUser = record.FromUserName?.string?.trim();
  const toUser = record.ToUserName?.string?.trim();
  const rawContent = record.Content?.string?.trim();
  if (!fromUser || !toUser || !rawContent) {
    return null;
  }

  const isGroup = fromUser.endsWith("@chatroom") || toUser.endsWith("@chatroom");
  const chatType = isGroup ? "group" : "direct";
  const chatId = isGroup ? (fromUser.endsWith("@chatroom") ? fromUser : toUser) : fromUser;
  const parsedGroup = isGroup ? extractGroupSender(rawContent) : null;
  const senderId = isGroup ? (parsedGroup?.senderId ?? fromUser) : fromUser;
  const messageType =
    typeof record.MsgType === "number" && Number.isFinite(record.MsgType)
      ? record.MsgType
      : undefined;
  const parsedQuotedMessage = messageType === 49 ? parseQuotedMessage(rawContent) : null;
  const appMessageType = messageType === 49 ? resolveAppMessageType(rawContent) : undefined;
  const body =
    parsedQuotedMessage?.currentBody?.trim() ||
    (isGroup ? (parsedGroup?.body ?? rawContent) : rawContent);

  const msgIdRaw =
    typeof record.NewMsgId === "number" && Number.isFinite(record.NewMsgId)
      ? String(record.NewMsgId)
      : typeof record.MsgId === "number" && Number.isFinite(record.MsgId)
        ? String(record.MsgId)
        : undefined;
  const msgSeqRaw =
    typeof record.MsgSeq === "number" && Number.isFinite(record.MsgSeq)
      ? String(record.MsgSeq)
      : undefined;

  const createTimeMs =
    typeof record.CreateTime === "number" && Number.isFinite(record.CreateTime)
      ? Math.max(0, record.CreateTime * 1000)
      : Date.now();

  const id = msgIdRaw ? `${chatId}:${msgIdRaw}` : `${chatId}:${createTimeMs}:${senderId}`;

  const normalizedCurrentWxid = currentWxid.trim();

  return {
    id,
    msgId: msgIdRaw,
    msgIdFull: encodeWechatIpadMessageIdFull({
      msgId: msgIdRaw,
      msgSeq: msgSeqRaw,
      createTime: record.CreateTime,
      msgSource: record.MsgSource,
      senderId,
      senderName: senderId,
      body,
    }),
    msgSeq: msgSeqRaw,
    rawMsgSource: record.MsgSource?.trim() || undefined,
    from: chatId,
    senderId,
    chatId,
    chatType,
    body,
    timestamp: createTimeMs,
    isAtMe: resolveIsAtMe(record.MsgSource, normalizedCurrentWxid, chatType),
    isFromSelf: Boolean(normalizedCurrentWxid) && senderId === normalizedCurrentWxid,
    messageType,
    appMessageType,
    contentType: resolveInboundContentType(messageType, appMessageType, parsedQuotedMessage),
    quotedMessage: parsedQuotedMessage,
    rawContent,
  };
}

export async function sendTextViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    text: string;
    at?: string[];
    /** 与 at 平行的昵称数组，用于在文本前缀 @昵称\u2005（Go 端协议要求）。 */
    atNicknames?: string[];
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  let content = params.text;

  // 参考 Go 端 SendTextMessage：在文本前缀 @昵称\u2005（U+2005 四分之一空格）
  if (params.at && params.at.length > 0 && params.atNicknames && params.atNicknames.length > 0) {
    const mentionPrefix = params.atNicknames
      .filter(Boolean)
      .map((nick) => `@${nick}\u2005`)
      .join(" ");
    if (mentionPrefix) {
      content = `${mentionPrefix}${content}`;
    }
  }

  const body: Record<string, unknown> = {
    Wxid: params.wxid,
    ToWxid: params.toWxid,
    Content: content,
    Type: 1,
  };
  if (params.at && params.at.length > 0) {
    body.At = params.at.join(",");
  }
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendTxt",
    body,
  });

  const list = Array.isArray(raw.List) ? raw.List : [];
  const first =
    (list[0] && typeof list[0] === "object" ? (list[0] as Record<string, unknown>) : null) ?? null;

  return {
    messageId:
      (first
        ? readIdField(first, ["NewMsgId", "MsgId", "ClientMsgid", "ClientMsgId", "messageId", "id"])
        : undefined) ?? readIdField(raw, ["NewMsgId", "MsgId", "messageId", "id"]),
  };
}

export async function sendMediaViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    base64: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/UploadImg",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Base64: params.base64,
    },
  });

  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

export async function sendVideoViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    base64: string;
    imageBase64: string;
    playLength: number;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendVideo",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Base64: params.base64,
      ImageBase64: params.imageBase64,
      PlayLength: params.playLength,
    },
  });

  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

export async function sendLinkCardViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    title: string;
    url: string;
    desc?: string;
    thumbUrl?: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const title = params.title.trim();
  const url = params.url.trim();
  if (!title || !url) {
    throw new WechatIpadApiError("wechat-ipad 链接卡片需要 title 和 url");
  }
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendApp",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Xml: buildWechatIpadLinkCardXml({
        title,
        url,
        desc: params.desc,
        thumbUrl: params.thumbUrl,
      }),
      Type: 5,
    },
  });
  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

export async function sendQuoteTextViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    text: string;
    replyToId: string;
    messageStore?: {
      lookup(msgId: string): { msgType?: number; rawContent?: string; body?: string } | null;
    } | null;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const replyMeta = parseWechatIpadMessageIdFull(params.replyToId);
  const replyMsgId = replyMeta?.msgId ?? params.replyToId.trim();
  const replyMsgSeq = replyMeta?.msgSeq || extractMsgSourceTag(replyMeta?.msgSource, "sequence_id");
  const replySenderWxid = replyMeta?.senderId?.trim();
  const replySender = replyMeta?.senderName?.trim() || replySenderWxid || "unknown";
  const replyBody = replyMeta?.body?.trim();
  const text = params.text.trim();
  if (!replyMsgId || !replyMsgSeq || !replySenderWxid || !replyBody || !text) {
    throw new WechatIpadApiError(
      "wechat-ipad 引用回复需要 msgId、msgSeq、发送者 wxid、引用内容和文本",
    );
  }
  // 查询持久化存储获取原始消息元数据
  const storedMessage = params.messageStore?.lookup(replyMsgId) ?? null;
  const referType = storedMessage?.msgType ?? 1;
  const referContent = storedMessage?.rawContent ?? storedMessage?.body ?? replyBody;
  const xml = `<appmsg appid="" sdkver="0"><title>${escapeXmlText(text)}</title><des></des><action></action><type>57</type><showtype>0</showtype><soundtype>0</soundtype><mediatagname></mediatagname><messageext></messageext><messageaction></messageaction><content></content><contentattr>0</contentattr><url></url><lowurl></lowurl><dataurl></dataurl><lowdataurl></lowdataurl><songalbumurl></songalbumurl><songlyric></songlyric><appattach><totallen>0</totallen><attachid></attachid><emoticonmd5></emoticonmd5><fileext></fileext><cdnthumbaeskey></cdnthumbaeskey><aeskey></aeskey></appattach><extinfo></extinfo><sourceusername></sourceusername><sourcedisplayname></sourcedisplayname><thumburl></thumburl><md5></md5><statextstr></statextstr><directshare>0</directshare><refermsg><type>${referType}</type><svrid>${escapeXmlText(replyMsgId)}</svrid><fromusr>${escapeXmlText(replySenderWxid)}</fromusr><chatusr>${escapeXmlText(params.wxid)}</chatusr><displayname>${escapeXmlText(replySender)}</displayname><content>${escapeXmlText(referContent)}</content><msgsource>&lt;msgsource&gt;&lt;sequence_id&gt;${escapeXmlText(replyMsgSeq)}&lt;/sequence_id&gt;&lt;/msgsource&gt;</msgsource></refermsg></appmsg><fromusername></fromusername>`;
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendApp",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Xml: xml,
      Type: 57,
    },
  });
  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

export async function sendLongTextViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    text: string;
    senderName?: string;
    sourceHeadUrl?: string;
    title?: string;
    nowMs?: number;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const text = params.text.trim();
  if (!text) {
    throw new WechatIpadApiError("wechat-ipad 长文本发送需要文本内容");
  }
  const xml = buildWechatIpadLongTextXml({
    wxid: params.wxid,
    text,
    senderName: params.senderName,
    sourceHeadUrl: params.sourceHeadUrl,
    title: params.title,
    nowMs: params.nowMs,
  });
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendApp",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Xml: xml,
      Type: 19,
    },
  });
  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

export async function pollInboundMessages(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    scene?: number;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ items: WechatIpadInboundMessage[]; contactIds: string[] }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/Sync",
    body: {
      Wxid: params.wxid,
      Scene: params.scene ?? 0,
      Synckey: "",
    },
  });

  const addMsgsRaw = raw.AddMsgs;
  const addMsgs = Array.isArray(addMsgsRaw) ? addMsgsRaw : [];
  const items: WechatIpadInboundMessage[] = [];

  for (const item of addMsgs) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const normalized = normalizeWechatIpadSyncAddMsg(
      item as WechatIpadSyncMessageRecord,
      params.wxid,
    );
    if (normalized) {
      items.push(normalized);
    }
  }

  return {
    items,
    contactIds: collectInboundContactIds(items),
  };
}

export async function listContactIdsViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    currentWxcontactSeq?: number;
    currentChatRoomContactSeq?: number;
    maxPages?: number;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{
  contactIds: string[];
  currentWxcontactSeq: number;
  currentChatRoomContactSeq: number;
}> {
  const contactIds = new Set<string>();
  const ownWxid = params.wxid.trim();
  let currentWxcontactSeq = Math.max(0, params.currentWxcontactSeq ?? 0);
  let currentChatRoomContactSeq = Math.max(0, params.currentChatRoomContactSeq ?? 0);
  const maxPages = Math.max(1, params.maxPages ?? 20);

  for (let page = 0; page < maxPages; page += 1) {
    const raw = await requestFn({
      options: params.options,
      method: "POST",
      endpoint: "/api/Friend/GetContractList",
      body: {
        Wxid: params.wxid,
        CurrentWxcontactSeq: currentWxcontactSeq,
        CurrentChatRoomContactSeq: currentChatRoomContactSeq,
      },
    });

    const pageContactIds = readStringListField(raw, ["ContactUsernameList", "contactUsernameList"]);
    for (const contactId of pageContactIds) {
      if (contactId && contactId !== ownWxid) {
        contactIds.add(contactId);
      }
    }

    const nextWxcontactSeq =
      readNumberField(raw, ["CurrentWxcontactSeq", "currentWxcontactSeq"]) ?? currentWxcontactSeq;
    const nextChatRoomContactSeq =
      readNumberField(raw, ["CurrentChatRoomContactSeq", "currentChatRoomContactSeq"]) ??
      currentChatRoomContactSeq;
    const continueFlag =
      readNumberField(raw, ["CountinueFlag", "ContinueFlag", "countinueFlag", "continueFlag"]) ?? 0;
    const seqAdvanced =
      nextWxcontactSeq !== currentWxcontactSeq ||
      nextChatRoomContactSeq !== currentChatRoomContactSeq;

    currentWxcontactSeq = nextWxcontactSeq;
    currentChatRoomContactSeq = nextChatRoomContactSeq;

    if (!continueFlag || !seqAdvanced) {
      break;
    }
  }

  return {
    contactIds: Array.from(contactIds),
    currentWxcontactSeq,
    currentChatRoomContactSeq,
  };
}

function normalizeLoginType(
  loginType: WechatIpadLoginQrRequest["loginType"],
): "ipad" | "win" | "mac" | "car" {
  if (loginType === "win" || loginType === "mac" || loginType === "car") {
    return loginType;
  }
  return "ipad";
}

const LOGIN_QR_ENDPOINT_BY_TYPE: Record<"ipad" | "win" | "mac" | "car", string> = {
  ipad: "/api/Login/LoginGetQR",
  win: "/api/Login/LoginGetQRWin",
  mac: "/api/Login/LoginGetQRMac",
  car: "/api/Login/LoginGetQRCar",
};

export async function requestLoginQr(
  params: {
    options: WechatIpadApiCallOptions;
    request?: WechatIpadLoginQrRequest;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<WechatIpadLoginQrResponse> {
  const loginType = normalizeLoginType(params.request?.loginType);
  const endpoint = LOGIN_QR_ENDPOINT_BY_TYPE[loginType];
  const payload: Record<string, unknown> = {
    LoginType: loginType,
  };
  if (params.request?.deviceId?.trim()) {
    payload.DeviceID = params.request.deviceId.trim();
  }
  if (params.request?.deviceName?.trim()) {
    payload.DeviceName = params.request.deviceName.trim();
  }

  const result = await requestFn({
    options: params.options,
    method: "POST",
    endpoint,
    body: payload,
  });

  const uuid =
    (typeof result.Uuid === "string" && result.Uuid.trim()) ||
    (typeof result.uuid === "string" && result.uuid.trim()) ||
    "";
  const qrDataUrl =
    (typeof result.QrBase64 === "string" && result.QrBase64.trim()) ||
    (typeof result.qrBase64 === "string" && result.qrBase64.trim()) ||
    (typeof result.qrDataUrl === "string" && result.qrDataUrl.trim()) ||
    undefined;
  const qrUrl =
    (typeof result.QrUrl === "string" && result.QrUrl.trim()) ||
    (typeof result.qrUrl === "string" && result.qrUrl.trim()) ||
    undefined;

  if (!uuid) {
    throw new WechatIpadApiError("wechat-ipad 登录二维码响应缺少 uuid");
  }

  return {
    uuid,
    qrDataUrl,
    qrUrl,
    message:
      (typeof result.message === "string" && result.message) ||
      (typeof result.Message === "string" && result.Message) ||
      "二维码已生成，请使用微信扫码确认。",
    deviceId:
      (typeof result.DeviceId === "string" && result.DeviceId) ||
      (typeof result.deviceId === "string" && result.deviceId) ||
      params.request?.deviceId,
    data62:
      (typeof result.Data62 === "string" && result.Data62) ||
      (typeof result.data62 === "string" && result.data62) ||
      undefined,
    expiredTime:
      (typeof result.ExpiredTime === "string" && result.ExpiredTime) ||
      (typeof result.expiredTime === "string" && result.expiredTime) ||
      undefined,
  };
}

export async function checkLoginQr(
  params: {
    options: WechatIpadApiCallOptions;
    session: WechatIpadLoginSession;
  },
  requestFn: typeof request<unknown> = request,
): Promise<WechatIpadLoginCheckResponse> {
  const endpoint = new URL("/api/Login/LoginCheckQR", params.options.baseUrl);
  endpoint.searchParams.set("uuid", params.session.uuid);

  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: `${endpoint.pathname}${endpoint.search}`,
    unwrapEnvelope: false,
  });

  const envelope = asRecord(raw);
  const envelopeData = envelope ? (envelope.data ?? envelope.Data) : raw;
  const data = envelopeData;
  const dataRecord = asRecord(data) ?? {};
  const acctSectResp = asRecord(dataRecord.acctSectResp) ?? asRecord(dataRecord.AcctSectResp);

  const statusRaw = readNumberField(dataRecord, ["status", "Status", "code", "Code"]);
  const wxid =
    readStringField(dataRecord, ["WxId", "wxid", "wxId", "UserName", "userName"]) ??
    (acctSectResp ? readStringField(acctSectResp, ["userName", "UserName"]) : undefined);
  const nickname =
    readStringField(dataRecord, ["NickName", "nickName", "nickname"]) ??
    (acctSectResp ? readStringField(acctSectResp, ["nickName", "NickName"]) : undefined);

  const ticketFromRecord = readStringField(dataRecord, ["ticket", "Ticket"]);
  const ticketFromData = typeof data === "string" && data.trim() ? data.trim() : undefined;
  const ticket = ticketFromRecord ?? ticketFromData;

  const expiredTime = readNumberField(dataRecord, ["expiredTime", "ExpiredTime"]);

  return {
    connected: statusRaw === 2 || statusRaw === 200 || Boolean(wxid),
    status: statusRaw,
    wxid,
    nickname,
    ticket,
    expiredTime,
    requiresVerification: Boolean(ticket),
    raw,
  };
}

export async function submitVerificationCode(
  params: {
    options: WechatIpadApiCallOptions;
    request: WechatIpadVerificationCodeRequest;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<WechatIpadVerificationCodeResponse> {
  const payload: Record<string, unknown> = {
    Uuid: params.request.uuid,
    Data62: params.request.data62,
    Code: params.request.code,
    Ticket: params.request.ticket,
  };

  const result = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Login/YPayVerificationcode",
    body: payload,
  });

  const message =
    readStringField(result, ["message", "Message"]) ?? "验证已提交，请继续等待扫码登录结果。";

  return {
    success: true,
    message,
  };
}

export async function fetchBotProfileViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<WechatIpadBotProfile> {
  const wxid = params.wxid.trim();
  const endpoint = new URL("/api/User/GetContractProfile", params.options.baseUrl);
  endpoint.searchParams.set("wxid", wxid);

  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: `${endpoint.pathname}${endpoint.search}`,
  });

  // 响应包裹在 Data 信封中
  const data = asRecord(raw.Data) ?? asRecord(raw.data) ?? raw;
  const userInfo = asRecord(data.userInfo) ?? asRecord(data.UserInfo) ?? {};
  const userInfoExt = asRecord(data.userInfoExt) ?? asRecord(data.UserInfoExt) ?? {};

  // NickName 是 { string: "cc" } 嵌套格式
  const nickname =
    readWrappedStringField(userInfo.NickName ?? userInfo.nickName ?? userInfo.nickname) ?? wxid;
  const bigHeadImgUrl = readStringField(userInfoExt, ["BigHeadImgUrl", "bigHeadImgUrl"]) ?? "";
  const smallHeadImgUrl =
    readStringField(userInfoExt, ["SmallHeadImgUrl", "smallHeadImgUrl"]) ?? "";

  return {
    nickname,
    headImgUrl: bigHeadImgUrl || smallHeadImgUrl,
    fetchedAt: Date.now(),
  };
}

/** 从 XML 标签的属性中提取值，如 `<img aeskey="xxx">` → `extractXmlAttr(xml, "img", "aeskey")` → `"xxx"`。 */
export function extractXmlAttr(xml: string, tagName: string, attrName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}\\b[^>]*\\b${attrName}="([^"]*)"`, "i");
  return xml.match(pattern)?.[1] || undefined;
}

/** 解析图片消息 XML，提取 CDN 下载所需的 aesKey 和 cdnMidImgUrl。 */
export function parseImageXml(xml: string): { aesKey: string; cdnMidImgUrl: string } | null {
  const aesKey = extractXmlAttr(xml, "img", "aeskey");
  const cdnMidImgUrl = extractXmlAttr(xml, "img", "cdnmidimgurl");
  if (!aesKey || !cdnMidImgUrl) return null;
  return { aesKey, cdnMidImgUrl };
}

/** 调用桥接服务 CDN 下载 API 获取图片 buffer。 */
export async function downloadImageViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    aesKey: string;
    cdnMidImgUrl: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Tools/CdnDownloadImage",
    body: {
      Wxid: params.wxid,
      FileAesKey: params.aesKey,
      FileNo: params.cdnMidImgUrl,
    },
    timeoutMs: 30_000,
  });

  const base64 = readStringField(raw, ["Image", "image"]);
  if (!base64) {
    throw new WechatIpadApiError("CDN 图片下载响应缺少 Image 字段");
  }

  const buffer = Buffer.from(base64, "base64");

  // 默认 image/jpeg，后续由调用方通过 detectMime 覆盖
  return { buffer, contentType: "image/jpeg", extension: ".jpg" };
}

export async function enableAutoHeartbeat(params: {
  options: WechatIpadApiCallOptions;
  wxid: string;
}): Promise<void> {
  if (!params.wxid.trim()) {
    return;
  }
  const endpoint = new URL("/api/Login/AutoHeartBeat", params.options.baseUrl);
  endpoint.searchParams.set("wxid", params.wxid.trim());
  await request<Record<string, unknown>>({
    options: params.options,
    method: "POST",
    endpoint: `${endpoint.pathname}${endpoint.search}`,
  });
}

// ─── 语音消息发送 ───

export async function sendVoiceViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    base64: string;
    voiceTime: number;
    voiceType: number;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendVoice",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Base64: params.base64,
      VoiceTime: params.voiceTime,
      VoiceType: params.voiceType,
    },
  });

  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

// ─── 表情消息发送 ───

export async function sendEmojiViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    md5: string;
    totalLen: number;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendEmoji",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Md5: params.md5,
      TotalLen: params.totalLen,
    },
  });

  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

// ─── 消息撤回 ───

export async function revokeMessageViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    clientMsgId: string;
    newMsgId: string;
    createTime: number;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<void> {
  await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/Revoke",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      ClientMsgId: params.clientMsgId,
      NewMsgId: params.newMsgId,
      CreateTime: params.createTime,
    },
  });
}

// ─── CDN 媒体转发 ───

export async function sendCdnImageViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    content: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendCDNImg",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Content: params.content,
    },
  });

  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

export async function sendCdnVideoViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    content: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendCDNVideo",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Content: params.content,
    },
  });

  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

export async function sendCdnFileViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    content: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendCDNFile",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Content: params.content,
    },
  });

  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

// ─── 入站媒体 XML 解析 ───

export type WechatIpadParsedVoiceXml = {
  voiceLength: number;
  aesKey: string;
  cdnVoiceUrl: string;
  bufid: string;
  fromUsername: string;
  totalLen: number;
};

/** 解析语音消息 XML，提取 CDN 下载所需字段。 */
export function parseVoiceXml(xml: string): WechatIpadParsedVoiceXml | null {
  const voiceLength =
    extractXmlNumericTag(xml, "voicelength") ??
    Number(extractXmlAttr(xml, "voicemsg", "voicelength"));
  const aesKey = extractXmlAttr(xml, "voicemsg", "aeskey") ?? extractXmlTagText(xml, "aeskey");
  const cdnVoiceUrl =
    extractXmlAttr(xml, "voicemsg", "cdnvoiceurl") ?? extractXmlTagText(xml, "cdnvoiceurl");
  const bufid = extractXmlAttr(xml, "voicemsg", "bufid") ?? "";
  const fromUsername = extractXmlAttr(xml, "voicemsg", "fromusername") ?? "";
  const totalLenRaw = extractXmlAttr(xml, "voicemsg", "length") ?? extractXmlTagText(xml, "length");
  const totalLen = totalLenRaw ? Number(totalLenRaw) : 0;
  if (!aesKey || !cdnVoiceUrl) return null;
  return {
    voiceLength: Number.isFinite(voiceLength) ? voiceLength : 0,
    aesKey,
    cdnVoiceUrl,
    bufid,
    fromUsername,
    totalLen: Number.isFinite(totalLen) ? totalLen : 0,
  };
}

export type WechatIpadParsedVideoXml = {
  cdnVideoUrl: string;
  cdnThumbUrl: string;
  aesKey: string;
  length: number;
  fromUsername: string;
};

/** 解析视频消息 XML，提取 CDN 下载所需字段。 */
export function parseVideoXml(xml: string): WechatIpadParsedVideoXml | null {
  const cdnVideoUrl =
    extractXmlAttr(xml, "videomsg", "cdnvideourl") ?? extractXmlTagText(xml, "cdnvideourl");
  const cdnThumbUrl =
    extractXmlAttr(xml, "videomsg", "cdnthumburl") ?? extractXmlTagText(xml, "cdnthumburl");
  const aesKey = extractXmlAttr(xml, "videomsg", "aeskey") ?? extractXmlTagText(xml, "aeskey");
  const length =
    extractXmlNumericTag(xml, "length") ?? Number(extractXmlAttr(xml, "videomsg", "length"));
  const fromUsername = extractXmlAttr(xml, "videomsg", "fromusername") ?? "";
  if (!cdnVideoUrl || !aesKey) return null;
  return {
    cdnVideoUrl,
    cdnThumbUrl: cdnThumbUrl ?? "",
    aesKey,
    length: Number.isFinite(length) ? length : 0,
    fromUsername,
  };
}

export type WechatIpadParsedFileXml = {
  title: string;
  totalLen: number;
  attachId: string;
  cdnAttachUrl: string;
  aesKey: string;
  fileExt: string;
};

/** 解析文件消息 XML，提取文件信息和 CDN 下载所需字段。 */
export function parseFileXml(xml: string): WechatIpadParsedFileXml | null {
  const appmsgSection = extractXmlSection(xml, "appmsg") ?? xml;
  const title = extractXmlTagText(appmsgSection, "title") ?? "";
  const totalLen = extractXmlNumericTag(appmsgSection, "totallen") ?? 0;
  const attachId =
    extractXmlTagText(appmsgSection, "attachid") ?? extractXmlTagText(xml, "attachid");
  const cdnAttachUrl =
    extractXmlTagText(appmsgSection, "cdnattachurl") ?? extractXmlTagText(xml, "cdnattachurl");
  const aesKey =
    extractXmlTagText(appmsgSection, "encryver") ??
    extractXmlTagText(appmsgSection, "aeskey") ??
    extractXmlTagText(xml, "aeskey");
  const fileExt = extractXmlTagText(appmsgSection, "fileext") ?? "";
  if (!attachId && !cdnAttachUrl) return null;
  return {
    title,
    totalLen: Number.isFinite(totalLen) ? totalLen : 0,
    attachId: attachId ?? "",
    cdnAttachUrl: cdnAttachUrl ?? "",
    aesKey: aesKey ?? "",
    fileExt,
  };
}

export type WechatIpadParsedEmojiXml = {
  md5: string;
  totalLen: number;
  cdnUrl: string;
};

/** 解析表情消息 XML（messageType=47），提取 md5/totalLen/cdnUrl。 */
export function parseEmojiXml(xml: string): WechatIpadParsedEmojiXml | null {
  const md5 = extractXmlAttr(xml, "emoji", "md5");
  const totalLenRaw =
    extractXmlAttr(xml, "emoji", "len") ?? extractXmlAttr(xml, "emoji", "totallen");
  const cdnUrl = extractXmlAttr(xml, "emoji", "cdnurl") ?? extractXmlAttr(xml, "emoji", "thumburl");
  if (!md5) return null;
  const totalLen = totalLenRaw ? Number(totalLenRaw) : 0;
  return {
    md5,
    totalLen: Number.isFinite(totalLen) ? totalLen : 0,
    cdnUrl: cdnUrl ?? "",
  };
}

export type WechatIpadParsedCardXml = {
  nickname: string;
  alias: string;
  wxid: string;
  bigHeadImgUrl: string;
  smallHeadImgUrl: string;
};

/** 解析名片消息 XML（messageType=42），提取 nickname/alias/wxid。 */
export function parseCardXml(xml: string): WechatIpadParsedCardXml | null {
  const nickname =
    extractXmlAttr(xml, "msg", "nickname") ?? extractXmlTagText(xml, "nickname") ?? "";
  const alias = extractXmlAttr(xml, "msg", "alias") ?? extractXmlTagText(xml, "alias") ?? "";
  const wxid = extractXmlAttr(xml, "msg", "username") ?? extractXmlTagText(xml, "username") ?? "";
  if (!wxid && !nickname) return null;
  return {
    nickname,
    alias,
    wxid,
    bigHeadImgUrl: extractXmlAttr(xml, "msg", "bigheadimgurl") ?? "",
    smallHeadImgUrl: extractXmlAttr(xml, "msg", "smallheadimgurl") ?? "",
  };
}

export type WechatIpadParsedLocationXml = {
  x: number;
  y: number;
  label: string;
  poiname: string;
  scale: number;
};

/** 解析位置消息 XML（messageType=48），提取经纬度和地名。 */
export function parseLocationXml(xml: string): WechatIpadParsedLocationXml | null {
  const x = Number(extractXmlAttr(xml, "location", "x") ?? "");
  const y = Number(extractXmlAttr(xml, "location", "y") ?? "");
  const label = extractXmlAttr(xml, "location", "label") ?? "";
  const poiname = extractXmlAttr(xml, "location", "poiname") ?? "";
  const scale = Number(extractXmlAttr(xml, "location", "scale") ?? "14");
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, label, poiname, scale: Number.isFinite(scale) ? scale : 14 };
}

// ─── 入站语音/视频下载 ───

/** 调用桥接服务 CDN 下载语音，如端点不存在则返回 null。 */
export async function downloadVoiceViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    aesKey: string;
    cdnVoiceUrl: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ buffer: Buffer; contentType: string; extension: string } | null> {
  try {
    const raw = await requestFn({
      options: params.options,
      method: "POST",
      endpoint: "/api/Tools/CdnDownloadVoice",
      body: {
        Wxid: params.wxid,
        FileAesKey: params.aesKey,
        FileNo: params.cdnVoiceUrl,
      },
      timeoutMs: 30_000,
    });

    const base64 = readStringField(raw, ["Voice", "voice", "Data", "data"]);
    if (!base64) return null;

    const buffer = Buffer.from(base64, "base64");
    return { buffer, contentType: "audio/silk", extension: ".silk" };
  } catch {
    // 端点不存在或下载失败，返回 null
    return null;
  }
}

/** 调用桥接服务 CDN 下载视频，如端点不存在则返回 null。 */
export async function downloadVideoViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    aesKey: string;
    cdnVideoUrl: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ buffer: Buffer; contentType: string; extension: string } | null> {
  try {
    const raw = await requestFn({
      options: params.options,
      method: "POST",
      endpoint: "/api/Tools/CdnDownloadVideo",
      body: {
        Wxid: params.wxid,
        FileAesKey: params.aesKey,
        FileNo: params.cdnVideoUrl,
      },
      timeoutMs: 60_000,
    });

    const base64 = readStringField(raw, ["Video", "video", "Data", "data"]);
    if (!base64) return null;

    const buffer = Buffer.from(base64, "base64");
    return { buffer, contentType: "video/mp4", extension: ".mp4" };
  } catch {
    // 端点不存在或下载失败，返回 null
    return null;
  }
}

// ─── Tools 端点下载（与 Go 端一致的分片下载方式） ───

const MEDIA_CHUNK_SIZE = 60 * 1024; // 60KB

/**
 * 使用 /Tools/DownloadVideo 分片下载视频。
 * 参考 Go 端 DownloadVideoRequest，通过 MsgId 和 Section 结构分片获取。
 * 失败返回 null，由调用方回退到 CDN 端点。
 */
export async function downloadVideoViaToolsApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    msgId: string;
    totalLen: number;
    toWxid?: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ buffer: Buffer; contentType: string; extension: string } | null> {
  try {
    const { options, wxid, msgId, totalLen, toWxid } = params;
    if (!msgId || totalLen <= 0) return null;

    const chunks: Buffer[] = [];
    let startPos = 0;

    while (startPos < totalLen) {
      const chunkLen = Math.min(MEDIA_CHUNK_SIZE, totalLen - startPos);
      const raw = await requestFn({
        options,
        method: "POST",
        endpoint: "/api/Tools/DownloadVideo",
        body: {
          Wxid: wxid,
          MsgId: Number(msgId),
          CompressType: 0,
          DataLen: totalLen,
          Section: {
            StartPos: startPos,
            DataLen: chunkLen,
          },
          ToWxid: toWxid ?? "",
        },
        timeoutMs: 60_000,
      });

      const dataField = asRecord(raw.data) ?? asRecord(raw.Data);
      const base64 =
        (dataField ? readStringField(dataField, ["buffer", "Buffer"]) : undefined) ??
        readStringField(raw, ["Data", "data", "Base64", "base64"]);
      if (!base64) break;

      const chunk = Buffer.from(base64, "base64");
      if (chunk.length === 0) break;

      chunks.push(chunk);
      startPos += chunk.length;
    }

    if (chunks.length === 0) return null;
    return { buffer: Buffer.concat(chunks), contentType: "video/mp4", extension: ".mp4" };
  } catch {
    return null;
  }
}

/**
 * 使用 /Tools/DownloadVoice 分片下载语音。
 * 参考 Go 端 DownloadVoiceRequest，通过 MsgId、Bufid、FromUserName 分片获取。
 * 失败返回 null，由调用方回退到 CDN 端点。
 */
export async function downloadVoiceViaToolsApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    msgId: string;
    bufid: string;
    fromUserName: string;
    totalLen: number;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ buffer: Buffer; contentType: string; extension: string } | null> {
  try {
    const { options, wxid, msgId, bufid, fromUserName, totalLen } = params;
    if (!msgId || totalLen <= 0) return null;

    const chunks: Buffer[] = [];
    let offset = 0;

    while (offset < totalLen) {
      const chunkLen = Math.min(MEDIA_CHUNK_SIZE, totalLen - offset);
      const raw = await requestFn({
        options,
        method: "POST",
        endpoint: "/api/Tools/DownloadVoice",
        body: {
          Wxid: wxid,
          MsgId: Number(msgId),
          Offset: offset,
          Length: chunkLen,
          FromUserName: fromUserName,
          Bufid: bufid,
        },
        timeoutMs: 30_000,
      });

      const dataField = asRecord(raw.data) ?? asRecord(raw.Data);
      const base64 =
        (dataField ? readStringField(dataField, ["buffer", "Buffer"]) : undefined) ??
        readStringField(raw, ["Data", "data", "Base64", "base64"]);
      if (!base64) break;

      const chunk = Buffer.from(base64, "base64");
      if (chunk.length === 0) break;

      chunks.push(chunk);
      offset += chunk.length;

      // 检查 endFlag
      const endFlag = readNumberField(raw, ["endFlag", "EndFlag"]);
      if (endFlag === 1) break;
    }

    if (chunks.length === 0) return null;
    return { buffer: Buffer.concat(chunks), contentType: "audio/silk", extension: ".silk" };
  } catch {
    return null;
  }
}

// ─── 入站文件下载 ───

const DOWNLOAD_CHUNK_SIZE = 60 * 1024; // 60KB

/**
 * 分片下载文件，参考 Go 端 DownloadFileRequest 结构。
 * 请求使用嵌套 Section { DataLen, StartPos }，响应数据在 data.buffer 路径。
 * 失败返回 null。
 */
export async function downloadFileViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    attachId: string;
    totalLen: number;
    appId?: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ buffer: Buffer } | null> {
  try {
    const { options, wxid, attachId, totalLen, appId } = params;
    if (!attachId || totalLen <= 0) return null;

    const chunks: Buffer[] = [];
    let startPos = 0;

    while (startPos < totalLen) {
      const chunkLen = Math.min(DOWNLOAD_CHUNK_SIZE, totalLen - startPos);
      const raw = await requestFn({
        options,
        method: "POST",
        endpoint: "/api/Tools/DownloadFile",
        body: {
          Wxid: wxid,
          AttachId: attachId,
          AppID: appId ?? "",
          UserName: wxid,
          DataLen: totalLen,
          Section: {
            DataLen: chunkLen,
            StartPos: startPos,
          },
        },
        timeoutMs: 60_000,
      });

      // Go 端响应结构：data.data.buffer（经信封解包后 raw 已是 data 层）
      const dataField = asRecord(raw.data) ?? asRecord(raw.Data);
      const base64 =
        (dataField ? readStringField(dataField, ["buffer", "Buffer"]) : undefined) ??
        readStringField(raw, ["Data", "data", "Base64", "base64"]);
      if (!base64) break;

      const chunk = Buffer.from(base64, "base64");
      if (chunk.length === 0) break;

      chunks.push(chunk);
      startPos += chunk.length;
    }

    if (chunks.length === 0) return null;
    return { buffer: Buffer.concat(chunks) };
  } catch {
    return null;
  }
}

/**
 * 批量查询联系人详情（昵称、备注、微信号），最多 20 个。
 * 查询失败时返回空数组，不阻塞消息处理。
 */
export async function fetchContactDetailViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    targetWxids: string[];
    chatRoom?: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<WechatIpadContactInfo[]> {
  const wxid = params.wxid.trim();
  const targets = params.targetWxids.map((id) => id.trim()).filter(Boolean);
  if (!wxid || targets.length === 0) {
    return [];
  }

  try {
    const raw = await requestFn({
      options: params.options,
      method: "POST",
      endpoint: "/api/Friend/GetContractDetail",
      body: {
        Wxid: wxid,
        Towxids: targets.join(","),
        ChatRoom: params.chatRoom?.trim() ?? "",
      },
    });

    const contactList = Array.isArray(raw.ContactList)
      ? raw.ContactList
      : Array.isArray(raw.contactList)
        ? raw.contactList
        : [];

    const results: WechatIpadContactInfo[] = [];
    const now = Date.now();

    for (const item of contactList) {
      const record = asRecord(item);
      if (!record) continue;

      const contactWxid =
        readWrappedStringField(record.UserName ?? record.userName) ??
        readStringField(record, ["UserName", "userName", "Wxid", "wxid"]);
      if (!contactWxid) continue;

      const nickname = readWrappedStringField(record.NickName ?? record.nickName) ?? "";
      const remark = readWrappedStringField(record.Remark ?? record.remark) ?? "";
      const alias =
        readWrappedStringField(record.Alias ?? record.alias) ??
        readStringField(record, ["Alias", "alias"]) ??
        "";

      results.push({
        wxid: contactWxid,
        nickname,
        remark,
        alias,
        fetchedAt: now,
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── 文件分片上传 ───

const UPLOAD_CHUNK_SIZE = 50 * 1024; // 50KB

type UploadFileResult = {
  appId: string;
  mediaId: string;
};

/**
 * 分片上传文件到桥接服务。
 * 参考 Go 端 ToolsSendFile，使用 multipart/form-data，分片大小 50KB。
 * 上传完成以响应中 createTime 有值为判断依据。
 */
export async function uploadFileViaApi(params: {
  options: WechatIpadApiCallOptions;
  wxid: string;
  toWxid: string;
  fileBuffer: Buffer;
  fileName: string;
}): Promise<UploadFileResult | null> {
  const { options, wxid, fileBuffer, fileName } = params;
  const totalLen = fileBuffer.length;
  const fileMd5 = createHash("md5").update(fileBuffer).digest("hex");
  const clientAppDataId = `${Date.now()}_${randomInt(100000, 999999)}`;
  const totalChunks = Math.ceil(totalLen / UPLOAD_CHUNK_SIZE);

  let appId = "";
  let mediaId = "";

  for (let i = 0; i < totalChunks; i++) {
    const startPos = i * UPLOAD_CHUNK_SIZE;
    const end = Math.min(startPos + UPLOAD_CHUNK_SIZE, totalLen);
    const chunk = fileBuffer.subarray(startPos, end);

    // 构建 multipart/form-data（与 Go 端 ToolsSendFile 一致）
    const boundary = `----WechatIpad${Date.now()}${randomInt(100000, 999999)}`;
    const parts: Buffer[] = [];

    // 文件分片字段 "chunk"
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="chunk"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
    );
    parts.push(chunk);
    parts.push(Buffer.from("\r\n"));

    // 文本字段
    const textFields: Record<string, string> = {
      Wxid: wxid,
      ClientAppDataId: clientAppDataId,
      FileMD5: fileMd5,
      TotalLen: String(totalLen),
      StartPos: String(startPos),
      TotalChunks: String(totalChunks),
    };
    for (const [key, value] of Object.entries(textFields)) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
        ),
      );
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const url = new URL("/api/Tools/UploadAppAttachStream", options.baseUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${options.apiToken}`,
          "X-Robot-Id": options.robotId,
        },
        body,
        signal: controller.signal,
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new WechatIpadApiError(
          `文件上传 HTTP ${response.status} ${response.statusText}`,
          response.status,
          responseText,
        );
      }

      if (responseText.trim()) {
        const parsed = JSON.parse(responseText) as Record<string, unknown>;
        const data = (parsed.data ?? parsed.Data ?? parsed) as Record<string, unknown>;

        // Go 端以 createTime 有值判断上传是否完成
        const createTime =
          readNumberField(data, ["createTime", "CreateTime"]) ??
          readNumberField(parsed, ["createTime", "CreateTime"]);
        if (createTime !== undefined) {
          appId = readStringField(data, ["appId", "AppId", "Appid"]) ?? "";
          mediaId = readStringField(data, ["mediaId", "MediaId", "Mediaid"]) ?? "";
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!appId && !mediaId) return null;
  return { appId, mediaId };
}

/**
 * 构建文件消息 appmsg XML（type=6）。
 */
export function buildWechatIpadFileMessageXml(params: {
  fileName: string;
  fileSize: number;
  fileExt: string;
  attachId: string;
  md5?: string;
}): string {
  const { fileName, fileSize, fileExt, attachId, md5 } = params;
  return `<appmsg appid="" sdkver="0"><title>${escapeXmlText(fileName)}</title><des></des><action></action><type>6</type><showtype>0</showtype><content></content><url></url><appattach><totallen>${fileSize}</totallen><attachid>${escapeXmlText(attachId)}</attachid><emoticonmd5>${escapeXmlText(md5 ?? "")}</emoticonmd5><fileext>${escapeXmlText(fileExt)}</fileext><cdnthumbaeskey></cdnthumbaeskey><aeskey></aeskey></appattach><extinfo></extinfo><sourceusername></sourceusername><sourcedisplayname></sourcedisplayname><thumburl></thumburl><md5>${escapeXmlText(md5 ?? "")}</md5></appmsg>`;
}

/**
 * 组合分片上传 + 文件消息 XML + SendApp 完成文件发送。
 */
export async function sendFileViaUploadApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    fileBuffer: Buffer;
    fileName: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const { options, wxid, toWxid, fileBuffer, fileName } = params;
  const uploadResult = await uploadFileViaApi({ options, wxid, toWxid, fileBuffer, fileName });
  if (!uploadResult) {
    throw new WechatIpadApiError("文件分片上传失败：未返回 AppId/MediaId");
  }

  const md5 = createHash("md5").update(fileBuffer).digest("hex");
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1) : "";
  const xml = buildWechatIpadFileMessageXml({
    fileName,
    fileSize: fileBuffer.length,
    fileExt: ext,
    attachId: uploadResult.appId || uploadResult.mediaId,
    md5,
  });

  const raw = await requestFn({
    options,
    method: "POST",
    endpoint: "/api/Msg/SendApp",
    body: {
      Wxid: wxid,
      ToWxid: toWxid,
      Xml: xml,
      Type: 6,
    },
  });

  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

// ─── 名片分享 ───

/**
 * 发送名片消息（/Msg/ShareCard）。
 * 参考 Go 端 Msg.ShareCardParam。
 */
export async function sendShareCardViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    cardWxId: string;
    cardNickName: string;
    cardAlias?: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/ShareCard",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      CardWxId: params.cardWxId,
      CardNickName: params.cardNickName,
      CardAlias: params.cardAlias ?? "",
    },
  });

  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}

// ─── 位置分享 ───

/**
 * 发送位置消息（/Msg/ShareLocation）。
 * 参考 Go 端 Msg.ShareLocationParam。
 */
export async function sendShareLocationViaApi(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    toWxid: string;
    x: number;
    y: number;
    label: string;
    poiname: string;
    scale?: number;
    infourl?: string;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/ShareLocation",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      X: params.x,
      Y: params.y,
      Label: params.label,
      Poiname: params.poiname,
      Scale: params.scale ?? 14,
      Infourl: params.infourl ?? "",
    },
  });

  return {
    messageId: readIdField(raw, ["Newmsgid", "Msgid", "NewMsgId", "MsgId", "messageId", "id"]),
  };
}
