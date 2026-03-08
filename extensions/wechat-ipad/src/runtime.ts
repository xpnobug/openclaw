import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { WechatIpadLoginSession } from "./types.js";

let runtime: PluginRuntime | null = null;

const loginSessions = new Map<string, WechatIpadLoginSession>();

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
