import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createDedupeCache,
  createFixedWindowRateLimiter,
  readJsonWebhookBodyOrReject,
  registerWebhookTargetWithPluginRoute,
  resolveWebhookTargetWithAuthOrRejectSync,
  withResolvedWebhookRequestPipeline,
  type OpenClawConfig,
  type PluginRuntime,
} from "openclaw/plugin-sdk/wechat-ipad";
import { normalizeWechatIpadSyncAddMsg, type WechatIpadSyncMessageRecord } from "../api/api.js";
import { getWechatIpadLoginSession } from "../infra/runtime.js";
import type {
  ResolvedWechatIpadAccount,
  WechatIpadInboundMessage,
  WechatIpadWebhookAuthMode,
} from "../types.js";
import { handleWechatIpadInboundMessage } from "./inbound.js";

export type WechatIpadWebhookTarget = {
  accountId: string;
  account: ResolvedWechatIpadAccount;
  cfg: OpenClawConfig;
  runtime: PluginRuntime;
  path: string;
  secret: string;
  authMode: WechatIpadWebhookAuthMode;
  wxid: string;
  statusSink?: (patch: { lastInboundAt?: number; lastError?: string | null }) => void;
  log?: (message: string) => void;
};

type WechatIpadWebhookEnvelope = {
  Wxid?: string;
  wxid?: string;
  Data?: {
    AddMsgs?: unknown;
  };
  data?: {
    AddMsgs?: unknown;
  };
  AddMsgs?: unknown;
  addMsgs?: unknown;
};

const webhookTargets = new Map<string, WechatIpadWebhookTarget[]>();
const webhookRateLimiters = new Map<number, ReturnType<typeof createFixedWindowRateLimiter>>();
const webhookDedupers = new Map<number, ReturnType<typeof createDedupeCache>>();

function timingSafeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    const length = Math.max(1, leftBuffer.length, rightBuffer.length);
    const paddedLeft = Buffer.alloc(length);
    const paddedRight = Buffer.alloc(length);
    leftBuffer.copy(paddedLeft);
    rightBuffer.copy(paddedRight);
    timingSafeEqual(paddedLeft, paddedRight);
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function emitWechatIpadWebhookLog(
  target: Pick<WechatIpadWebhookTarget, "runtime" | "log" | "accountId">,
  message: string,
): void {
  if (typeof target.log === "function") {
    target.log(message);
    return;
  }
  const runtimeWithOptionalLog = target.runtime as PluginRuntime & {
    log?: (message: string) => void;
  };
  runtimeWithOptionalLog.log?.(message);
}

function getRateLimiter(maxRequests: number) {
  const existing = webhookRateLimiters.get(maxRequests);
  if (existing) {
    return existing;
  }
  const created = createFixedWindowRateLimiter({
    windowMs: 60_000,
    maxRequests,
    maxTrackedKeys: 4_096,
  });
  webhookRateLimiters.set(maxRequests, created);
  return created;
}

function getDedupeCache(ttlMs: number) {
  const existing = webhookDedupers.get(ttlMs);
  if (existing) {
    return existing;
  }
  const created = createDedupeCache({ ttlMs, maxSize: 5_000 });
  webhookDedupers.set(ttlMs, created);
  return created;
}

function readTargetSecret(req: IncomingMessage, authMode: WechatIpadWebhookAuthMode): string {
  if (authMode === "none") {
    return "";
  }
  if (authMode === "query") {
    const url = new URL(req.url ?? "/", "http://localhost");
    return url.searchParams.get("token")?.trim() ?? "";
  }
  return String(req.headers["x-wechat-ipad-secret"] ?? "").trim();
}

function readEnvelopeWxid(payload: WechatIpadWebhookEnvelope): string | undefined {
  const wxid = payload.Wxid ?? payload.wxid;
  return typeof wxid === "string" && wxid.trim() ? wxid.trim() : undefined;
}

function readAddMsgs(payload: WechatIpadWebhookEnvelope): unknown[] {
  const candidates = [
    payload.Data?.AddMsgs,
    payload.data?.AddMsgs,
    payload.AddMsgs,
    payload.addMsgs,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function toInboundMessages(
  payload: WechatIpadWebhookEnvelope,
  wxid: string,
): WechatIpadInboundMessage[] {
  const items: WechatIpadInboundMessage[] = [];
  for (const record of readAddMsgs(payload)) {
    if (!record || typeof record !== "object") {
      continue;
    }
    const normalized = normalizeWechatIpadSyncAddMsg(record as WechatIpadSyncMessageRecord, wxid);
    if (normalized) {
      items.push(normalized);
    }
  }
  return items;
}

function buildDedupeKey(message: WechatIpadInboundMessage): string {
  return message.msgIdFull ?? message.msgId ?? message.id;
}

function readReplayBarrierTimestamp(target: Pick<WechatIpadWebhookTarget, "accountId">): number {
  return getWechatIpadLoginSession(target.accountId)?.connectedAt ?? 0;
}

function shouldDropReplayMessage(
  target: Pick<WechatIpadWebhookTarget, "accountId">,
  message: WechatIpadInboundMessage,
): boolean {
  const timestamp = Number.isFinite(message.timestamp) ? message.timestamp : 0;
  const replayBarrier = readReplayBarrierTimestamp(target);
  return timestamp > 0 && replayBarrier > 0 && timestamp < replayBarrier;
}

function isMessageFromAllowedContact(
  message: WechatIpadInboundMessage,
  allowedContactIds: string[],
): boolean {
  if (allowedContactIds.length === 0) {
    return true;
  }
  if (message.chatType === "direct") {
    return allowedContactIds.includes(message.senderId || message.from);
  }
  return allowedContactIds.includes(message.chatId);
}

async function processWechatIpadWebhookMessages(params: {
  target: WechatIpadWebhookTarget;
  messages: WechatIpadInboundMessage[];
}): Promise<void> {
  const { target, messages } = params;
  const dedupe = getDedupeCache(target.account.inbound.webhook.dedupeWindowMs);
  const nowMs = Date.now();
  let droppedReplayCount = 0;
  let droppedContactFilterCount = 0;

  // webhook 模式复用 pollContactIds 作为联系人白名单过滤
  const allowedContactIds = target.account.inbound.polling.pollContactIds;

  for (const message of messages) {
    if (shouldDropReplayMessage(target, message)) {
      droppedReplayCount += 1;
      continue;
    }

    if (!isMessageFromAllowedContact(message, allowedContactIds)) {
      droppedContactFilterCount += 1;
      continue;
    }

    if (dedupe.check(buildDedupeKey(message), nowMs)) {
      continue;
    }

    await handleWechatIpadInboundMessage(message, {
      cfg: target.cfg,
      runtime: target.runtime,
      accountId: target.accountId,
      baseUrl: target.account.baseUrl,
      apiToken: target.account.apiToken,
      robotId: target.account.robotId,
      wxid: target.wxid,
      allowFrom: target.account.config.allowFrom,
      dmPolicy: target.account.config.dmPolicy,
      groupPolicy: target.account.config.groupPolicy,
      commandAllowFrom: target.account.config.commandAllowFrom,
      safetyPrefix: target.account.config.safetyPrefix,
      requireMention: target.account.config.requireMention,
      log: target.log,
    });

    target.statusSink?.({ lastInboundAt: Date.now(), lastError: null });
  }

  if (droppedReplayCount > 0) {
    emitWechatIpadWebhookLog(
      target,
      `wechat-ipad[${target.accountId}]: webhook 忽略 ${String(droppedReplayCount)} 条历史回放消息`,
    );
  }
  if (droppedContactFilterCount > 0) {
    emitWechatIpadWebhookLog(
      target,
      `wechat-ipad[${target.accountId}]: webhook 过滤 ${String(droppedContactFilterCount)} 条非白名单联系人消息`,
    );
  }
}

import { getWechatIpadPluginRegistry } from "../infra/runtime.js";

export function registerWechatIpadWebhookTarget(target: WechatIpadWebhookTarget): () => void {
  return registerWebhookTargetWithPluginRoute({
    targetsByPath: webhookTargets,
    target,
    route: {
      auth: "plugin" as const,
      pluginId: "wechat-ipad",
      source: `extensions/wechat-ipad:${target.accountId}`,
      accountId: target.accountId,
      log: target.log,
      handler: (req, res) => handleWechatIpadWebhookRequest(req, res),
      registry: getWechatIpadPluginRegistry() as Parameters<
        typeof registerWebhookTargetWithPluginRoute
      >[0]["route"]["registry"],
    },
  }).unregister;
}

export async function handleWechatIpadWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  return await withResolvedWebhookRequestPipeline({
    req,
    res,
    targetsByPath: webhookTargets,
    allowMethods: ["POST"],
    requireJsonContentType: true,
    handle: async ({ targets, path }) => {
      const target = resolveWebhookTargetWithAuthOrRejectSync({
        targets,
        res,
        isMatch: (entry) => {
          if (entry.authMode === "none") {
            return true;
          }
          const secret = readTargetSecret(req, entry.authMode);
          return Boolean(secret) && timingSafeEquals(entry.secret, secret);
        },
      });
      if (!target) {
        return true;
      }

      const rateLimiter = getRateLimiter(target.account.inbound.webhook.rateLimitPerMinute);
      const rateLimitKey = `${path}:${req.socket.remoteAddress ?? "unknown"}`;
      if (rateLimiter.isRateLimited(rateLimitKey, Date.now())) {
        emitWechatIpadWebhookLog(target, `wechat-ipad[${target.accountId}]: webhook 速率限制`);
        res.statusCode = 429;
        res.end("Too Many Requests");
        return true;
      }

      const body = await readJsonWebhookBodyOrReject({
        req,
        res,
        maxBytes: target.account.inbound.webhook.maxBodyBytes,
        timeoutMs: 30_000,
        emptyObjectOnEmpty: false,
        invalidJsonMessage: "Bad Request",
      });
      if (!body.ok) {
        return true;
      }

      const payload = (
        body.value && typeof body.value === "object"
          ? (body.value as WechatIpadWebhookEnvelope)
          : null
      ) as WechatIpadWebhookEnvelope | null;
      if (!payload) {
        res.statusCode = 400;
        res.end("Bad Request");
        return true;
      }

      const payloadWxid = readEnvelopeWxid(payload);
      if (payloadWxid && payloadWxid !== target.wxid) {
        emitWechatIpadWebhookLog(
          target,
          `wechat-ipad[${target.accountId}]: webhook wxid 不匹配（${payloadWxid} ≠ ${target.wxid}）`,
        );
        res.statusCode = 403;
        res.end("Forbidden");
        return true;
      }

      const messages = toInboundMessages(payload, target.wxid);
      res.statusCode = 200;
      res.end("ok");

      if (messages.length === 0) {
        return true;
      }

      emitWechatIpadWebhookLog(
        target,
        `wechat-ipad[${target.accountId}]: webhook 收到 ${String(messages.length)} 条消息`,
      );
      processWechatIpadWebhookMessages({ target, messages }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        target.statusSink?.({ lastError: message });
        const runtimeWithOptionalError = target.runtime as PluginRuntime & {
          error?: (message: string) => void;
        };
        runtimeWithOptionalError.error?.(
          `wechat-ipad[${target.accountId}] webhook 处理失败：${message}`,
        );
      });
      return true;
    },
  });
}

export function clearWechatIpadWebhookSecurityStateForTest(): void {
  for (const limiter of webhookRateLimiters.values()) {
    limiter.clear();
  }
  for (const dedupe of webhookDedupers.values()) {
    dedupe.clear();
  }
  webhookRateLimiters.clear();
  webhookDedupers.clear();
}
