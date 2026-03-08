import type {
  WechatIpadApiCallOptions,
  WechatIpadInboundMessage,
  WechatIpadLoginCheckResponse,
  WechatIpadLoginQrRequest,
  WechatIpadLoginQrResponse,
  WechatIpadLoginSession,
  WechatIpadVerificationCodeRequest,
  WechatIpadVerificationCodeResponse,
} from "./types.js";

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
      throw new WechatIpadApiError(`Request timeout after ${timeoutMs}ms`);
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

type WechatIpadSyncMessageRecord = {
  MsgId?: number;
  FromUserName?: { string?: string } | null;
  ToUserName?: { string?: string } | null;
  MsgType?: number;
  Content?: { string?: string } | null;
  CreateTime?: number;
  MsgSource?: string;
  NewMsgId?: number;
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

function normalizeSyncAddMsg(record: WechatIpadSyncMessageRecord): WechatIpadInboundMessage | null {
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
  const body = isGroup ? (parsedGroup?.body ?? rawContent) : rawContent;

  const msgIdRaw =
    typeof record.NewMsgId === "number" && Number.isFinite(record.NewMsgId)
      ? String(record.NewMsgId)
      : typeof record.MsgId === "number" && Number.isFinite(record.MsgId)
        ? String(record.MsgId)
        : undefined;

  const createTimeMs =
    typeof record.CreateTime === "number" && Number.isFinite(record.CreateTime)
      ? Math.max(0, record.CreateTime * 1000)
      : Date.now();

  const id = msgIdRaw ? `${chatId}:${msgIdRaw}` : `${chatId}:${createTimeMs}:${senderId}`;

  return {
    id,
    msgId: msgIdRaw,
    from: chatId,
    senderId,
    chatId,
    chatType,
    body,
    timestamp: createTimeMs,
    isAtMe: false,
    isFromSelf: false,
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

export async function pollInboundMessages(
  params: {
    options: WechatIpadApiCallOptions;
    wxid: string;
    scene?: number;
  },
  requestFn: typeof request<Record<string, unknown>> = request,
): Promise<{ items: WechatIpadInboundMessage[] }> {
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
    const normalized = normalizeSyncAddMsg(item as WechatIpadSyncMessageRecord);
    if (normalized) {
      items.push(normalized);
    }
  }

  return { items };
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
