import { createHash, randomInt, randomUUID } from "node:crypto";
import type {
  WechatIpadApiCallOptions,
  WechatIpadBotProfile,
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
            message ?? "Wechat iPad API returned unsuccessful result",
            code,
            responseText,
          );
        }
        if (typeof code === "number" && code !== 0 && code !== 200 && code !== 1) {
          throw new WechatIpadApiError(
            message ?? "Wechat iPad API returned non-success code",
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
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ messageId?: string }> {
  const raw = await requestFn({
    options: params.options,
    method: "POST",
    endpoint: "/api/Msg/SendTxt",
    body: {
      Wxid: params.wxid,
      ToWxid: params.toWxid,
      Content: params.text,
      Type: 1,
    },
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
    throw new WechatIpadApiError("wechat-ipad link card requires title and url");
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
      "wechat-ipad quote reply requires msgId, msgSeq, sender wxid, quoted body, and text",
    );
  }
  // 查询持久化存储获取原始消息元数据
  const storedMessage = params.messageStore?.lookup(replyMsgId) ?? null;
  const referType = storedMessage?.msgType ?? 1;
  const referContent = storedMessage?.rawContent ?? storedMessage?.body ?? replyBody;
  const xml = `<appmsg appid="" sdkver="0"><title>${escapeXmlText(text)}</title><des></des><action></action><type>57</type><showtype>0</showtype><soundtype>0</soundtype><mediatagname></mediatagname><messageext></messageext><messageaction></messageaction><content></content><contentattr>0</contentattr><url></url><lowurl></lowurl><dataurl></dataurl><lowdataurl></lowdataurl><songalbumurl></songalbumurl><songlyric></songlyric><appattach><totallen>0</totallen><attachid></attachid><emoticonmd5></emoticonmd5><fileext></fileext><cdnthumbaeskey></cdnthumbaeskey><aeskey></aeskey></appattach><extinfo></extinfo><sourceusername></sourceusername><sourcedisplayname></sourcedisplayname><thumburl></thumburl><md5></md5><statextstr></statextstr><directshare>0</directshare><refermsg><type>${referType}</type><svrid>${escapeXmlText(replyMsgId)}</svrid><fromusr>${escapeXmlText(replySenderWxid)}</fromusr><chatusr>${escapeXmlText(params.wxid)}</chatusr><displayname>${escapeXmlText(replySender)}</displayname><content>${escapeXmlText(referContent)}</content><msgsource>&lt;msgsource&gt;&lt;sequence_id&gt;${escapeXmlText(replyMsgSeq)}&lt;/sequence_id&gt;&lt;/msgsource&gt;</msgsource></refermsg></appmsg><frsername></fromusername>`;
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
    throw new WechatIpadApiError("wechat-ipad long text requires text");
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
    throw new WechatIpadApiError("wechat-ipad login QR response missing uuid");
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
