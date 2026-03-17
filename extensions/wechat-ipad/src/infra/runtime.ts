import type { PluginRuntime } from "openclaw/plugin-sdk/wechat-ipad";
import type { WechatIpadMessagePoller } from "../inbound/polling.js";
import type {
  WechatIpadBotProfile,
  WechatIpadContactInfo,
  WechatIpadLoginSession,
} from "../types.js";
import type { WechatIpadMessageStore } from "./message-store.js";

export type WechatIpadWebhookRegistration = {
  unregister: () => void;
};

let runtime: PluginRuntime | null = null;

/**
 * 插件初始化时捕获的 plugin registry 引用（后备）。
 * 优先使用 globalThis 上动态读取的 httpRouteRegistry（网关 pin 住的实例）。
 */
let capturedPluginRegistry: unknown = null;
const PLUGIN_REGISTRY_STATE_KEY = Symbol.for("openclaw.pluginRegistryState");

const loginSessions = new Map<string, WechatIpadLoginSession>();
const pollers = new Map<string, WechatIpadMessagePoller>();
const webhookRegistrations = new Map<string, WechatIpadWebhookRegistration>();
const botProfiles = new Map<string, WechatIpadBotProfile>();
const pendingProfileFetches = new Set<string>();
const messageStores = new Map<string, WechatIpadMessageStore>();
const contactCaches = new Map<string, Map<string, WechatIpadContactInfo>>();

export const BOT_PROFILE_TTL_MS = 30 * 60_000;

function resolveSessionKey(accountId: string): string {
  return accountId.trim() || "__unassigned__";
}

export function setWechatIpadRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function setWechatIpadPluginRegistry(registry: unknown): void {
  capturedPluginRegistry = registry;
}

export function getWechatIpadPluginRegistry(): unknown {
  // 动态读取 globalThis 上的 httpRouteRegistry（网关 pin 住的实例），
  // 确保即使插件重载后 state.registry 变了，路由仍注册到网关实际使用的 registry 上。
  const globalState = (
    globalThis as Record<symbol, { httpRouteRegistry?: unknown; registry?: unknown } | undefined>
  )[PLUGIN_REGISTRY_STATE_KEY];
  return globalState?.httpRouteRegistry ?? globalState?.registry ?? capturedPluginRegistry;
}

export function getWechatIpadRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("WeChat iPad 运行时未初始化");
  }
  return runtime;
}

export function setWechatIpadLoginSession(session: WechatIpadLoginSession): void {
  loginSessions.set(resolveSessionKey(session.accountId), session);
  // 持久化到 SQLite
  const store = messageStores.get(resolveSessionKey(session.accountId));
  if (store) {
    try {
      store.setMeta("login_session", JSON.stringify(session));
    } catch {
      // 持久化失败不阻塞
    }
  }
}

export function getWechatIpadLoginSession(accountId: string): WechatIpadLoginSession | null {
  const key = resolveSessionKey(accountId);
  return loginSessions.get(key) ?? null;
}

export function resolveWechatIpadRuntimeWxid(
  accountId: string,
  configuredWxid?: string | null,
): string | undefined {
  const normalizedConfigured = configuredWxid?.trim();
  if (normalizedConfigured) {
    return normalizedConfigured;
  }
  return getWechatIpadLoginSession(accountId)?.wxid?.trim() || undefined;
}

export function clearWechatIpadLoginSession(accountId: string): void {
  loginSessions.delete(resolveSessionKey(accountId));
}

export function getWechatIpadPoller(accountId: string): WechatIpadMessagePoller | null {
  return pollers.get(resolveSessionKey(accountId)) ?? null;
}

export function setWechatIpadPoller(accountId: string, poller: WechatIpadMessagePoller): void {
  pollers.set(resolveSessionKey(accountId), poller);
}

export function clearWechatIpadPoller(accountId: string): void {
  const key = resolveSessionKey(accountId);
  const poller = pollers.get(key);
  poller?.stop();
  pollers.delete(key);
}

export function getWechatIpadWebhookRegistration(
  accountId: string,
): WechatIpadWebhookRegistration | null {
  return webhookRegistrations.get(resolveSessionKey(accountId)) ?? null;
}

export function setWechatIpadWebhookRegistration(
  accountId: string,
  registration: WechatIpadWebhookRegistration,
): void {
  webhookRegistrations.set(resolveSessionKey(accountId), registration);
}

export function clearWechatIpadWebhookRegistration(accountId: string): void {
  const key = resolveSessionKey(accountId);
  const registration = webhookRegistrations.get(key);
  registration?.unregister();
  webhookRegistrations.delete(key);
}

export function getWechatIpadBotProfile(accountId: string): WechatIpadBotProfile | null {
  return botProfiles.get(resolveSessionKey(accountId)) ?? null;
}

export function setWechatIpadBotProfile(accountId: string, profile: WechatIpadBotProfile): void {
  botProfiles.set(resolveSessionKey(accountId), profile);
  // 持久化到 SQLite
  const store = messageStores.get(resolveSessionKey(accountId));
  if (store) {
    try {
      store.setMeta("bot_profile", JSON.stringify(profile));
    } catch {
      // 持久化失败不阻塞
    }
  }
}

export function clearWechatIpadBotProfile(accountId: string): void {
  botProfiles.delete(resolveSessionKey(accountId));
}

export function isWechatIpadBotProfileStale(profile: WechatIpadBotProfile): boolean {
  return Date.now() - profile.fetchedAt > BOT_PROFILE_TTL_MS;
}

export function markWechatIpadProfileFetching(accountId: string): void {
  pendingProfileFetches.add(resolveSessionKey(accountId));
}

export function unmarkWechatIpadProfileFetching(accountId: string): void {
  pendingProfileFetches.delete(resolveSessionKey(accountId));
}

export function isWechatIpadProfileFetching(accountId: string): boolean {
  return pendingProfileFetches.has(resolveSessionKey(accountId));
}

export function getWechatIpadMessageStore(accountId: string): WechatIpadMessageStore | null {
  return messageStores.get(resolveSessionKey(accountId)) ?? null;
}

export function setWechatIpadMessageStore(accountId: string, store: WechatIpadMessageStore): void {
  messageStores.set(resolveSessionKey(accountId), store);
}

export function clearWechatIpadMessageStore(accountId: string): void {
  const key = resolveSessionKey(accountId);
  const store = messageStores.get(key);
  store?.close();
  messageStores.delete(key);
}

export const CONTACT_CACHE_TTL_MS = 60 * 60_000; // 1 小时

export function getWechatIpadContact(
  accountId: string,
  wxid: string,
): WechatIpadContactInfo | null {
  const key = resolveSessionKey(accountId);
  return contactCaches.get(key)?.get(wxid) ?? null;
}

export function setWechatIpadContact(accountId: string, info: WechatIpadContactInfo): void {
  const key = resolveSessionKey(accountId);
  let cache = contactCaches.get(key);
  if (!cache) {
    cache = new Map();
    contactCaches.set(key, cache);
  }
  cache.set(info.wxid, info);
}

export function isWechatIpadContactStale(info: WechatIpadContactInfo): boolean {
  return Date.now() - info.fetchedAt > CONTACT_CACHE_TTL_MS;
}

export function clearWechatIpadContactCache(accountId: string): void {
  contactCaches.delete(resolveSessionKey(accountId));
}
