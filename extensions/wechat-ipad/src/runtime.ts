import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { WechatIpadMessagePoller } from "./polling.js";
import type { WechatIpadLoginSession } from "./types.js";

let runtime: PluginRuntime | null = null;

const loginSessions = new Map<string, WechatIpadLoginSession>();
const pollers = new Map<string, WechatIpadMessagePoller>();

function resolveSessionKey(accountId: string): string {
  return accountId.trim() || "default";
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
