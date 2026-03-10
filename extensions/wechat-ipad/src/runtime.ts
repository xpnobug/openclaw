import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { WechatIpadMessagePoller } from "./polling.js";
import type { WechatIpadBotProfile, WechatIpadLoginSession } from "./types.js";

export type WechatIpadWebhookRegistration = {
  unregister: () => void;
};

let runtime: PluginRuntime | null = null;

const loginSessions = new Map<string, WechatIpadLoginSession>();
const pollers = new Map<string, WechatIpadMessagePoller>();
const webhookRegistrations = new Map<string, WechatIpadWebhookRegistration>();
const botProfiles = new Map<string, WechatIpadBotProfile>();
const pendingProfileFetches = new Set<string>();

export const BOT_PROFILE_TTL_MS = 30 * 60_000;

function resolveSessionKey(accountId: string): string {
  return accountId.trim() || "__unassigned__";
}

export function setWechatIpadRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getWechatIpadRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("WeChat iPad runtime not initialized");
  }
  return runtime;
}

export function setWechatIpadLoginSession(session: WechatIpadLoginSession): void {
  loginSessions.set(resolveSessionKey(session.accountId), session);
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
