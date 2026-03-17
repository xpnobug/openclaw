import type { OpenClawConfig } from "openclaw/plugin-sdk/wechat-ipad";
import { normalizeAccountId } from "openclaw/plugin-sdk/wechat-ipad";
import type {
  ResolvedWechatIpadAccount,
  WechatIpadAccountConfig,
  WechatIpadConfig,
  WechatIpadInboundConfig,
  WechatIpadInboundMode,
  WechatIpadPollingConfig,
  WechatIpadWebhookConfig,
} from "../types.js";
import { resolveWechatIpadToken } from "./token.js";

const DEFAULT_BASE_URL = "http://localhost:9000";
const DEFAULT_ROBOT_ID = "default";
const DEFAULT_POLLING: Required<WechatIpadPollingConfig> = {
  intervalMs: 3000,
  lookbackSeconds: 120,
  maxPagesPerPoll: 10,
  pollAllContacts: false,
  pollContactIds: [],
};

const DEFAULT_WEBHOOK: Required<WechatIpadWebhookConfig> = {
  path: "/api/v1/wechat-client/{wxid}/sync-message",
  secret: "",
  authMode: "none",
  maxBodyBytes: 1024 * 1024,
  dedupeWindowMs: 5 * 60_000,
  rateLimitPerMinute: 120,
};

function getWechatIpadConfig(cfg: OpenClawConfig): WechatIpadConfig | undefined {
  return cfg.channels?.["wechat-ipad"] as WechatIpadConfig | undefined;
}

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = getWechatIpadConfig(cfg)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts)
    .map((accountId) => normalizeAccountId(accountId))
    .filter(Boolean);
}

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): WechatIpadAccountConfig | undefined {
  const accounts = getWechatIpadConfig(cfg)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId] as WechatIpadAccountConfig | undefined;
}

function mergeInboundConfig(
  base: WechatIpadInboundConfig | undefined,
  account: WechatIpadInboundConfig | undefined,
): WechatIpadInboundConfig | undefined {
  if (!base && !account) {
    return undefined;
  }

  return {
    ...(base ?? {}),
    ...(account ?? {}),
    polling: {
      ...(base?.polling ?? {}),
      ...(account?.polling ?? {}),
    },
    webhook: {
      ...(base?.webhook ?? {}),
      ...(account?.webhook ?? {}),
    },
  };
}

function normalizeAccountConfig(
  config: WechatIpadAccountConfig | undefined,
): WechatIpadAccountConfig {
  if (!config) {
    return {};
  }
  return {
    ...config,
    inbound: mergeInboundConfig(undefined, config.inbound),
  };
}

function resolveInboundMode(config: WechatIpadAccountConfig): WechatIpadInboundMode {
  return config.inbound?.mode ?? "polling";
}

function resolvePollingConfig(config: WechatIpadAccountConfig): Required<WechatIpadPollingConfig> {
  const polling = config.inbound?.polling;
  return {
    intervalMs: polling?.intervalMs ?? DEFAULT_POLLING.intervalMs,
    lookbackSeconds: polling?.lookbackSeconds ?? DEFAULT_POLLING.lookbackSeconds,
    maxPagesPerPoll: polling?.maxPagesPerPoll ?? DEFAULT_POLLING.maxPagesPerPoll,
    pollAllContacts: polling?.pollAllContacts ?? DEFAULT_POLLING.pollAllContacts,
    pollContactIds: [...(polling?.pollContactIds ?? DEFAULT_POLLING.pollContactIds)],
  };
}

function resolveWebhookConfig(config: WechatIpadAccountConfig): Required<WechatIpadWebhookConfig> {
  const webhook = config.inbound?.webhook;
  return {
    path: webhook?.path?.trim() || DEFAULT_WEBHOOK.path,
    secret: webhook?.secret?.trim() || DEFAULT_WEBHOOK.secret,
    authMode: webhook?.authMode ?? DEFAULT_WEBHOOK.authMode,
    maxBodyBytes: webhook?.maxBodyBytes ?? DEFAULT_WEBHOOK.maxBodyBytes,
    dedupeWindowMs: webhook?.dedupeWindowMs ?? DEFAULT_WEBHOOK.dedupeWindowMs,
    rateLimitPerMinute: webhook?.rateLimitPerMinute ?? DEFAULT_WEBHOOK.rateLimitPerMinute,
  };
}

export function listWechatIpadAccountIds(cfg: OpenClawConfig): string[] {
  return Array.from(new Set(listConfiguredAccountIds(cfg))).sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultWechatIpadAccountId(cfg: OpenClawConfig): string | null {
  const ids = listWechatIpadAccountIds(cfg);
  const preferred = getWechatIpadConfig(cfg)?.defaultAccount?.trim();
  if (preferred && ids.includes(preferred)) {
    return preferred;
  }
  return ids[0] ?? null;
}

export function resolveWechatIpadAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedWechatIpadAccount {
  const ids = listWechatIpadAccountIds(params.cfg);
  const resolvedAccountId = normalizeAccountId(
    params.accountId && ids.includes(normalizeAccountId(params.accountId))
      ? params.accountId
      : (resolveDefaultWechatIpadAccountId(params.cfg) ?? params.accountId),
  );
  const section = getWechatIpadConfig(params.cfg);
  const baseEnabled = section?.enabled !== false;
  const merged = normalizeAccountConfig(resolveAccountConfig(params.cfg, resolvedAccountId));
  const tokenResolution = resolveWechatIpadToken(section, resolvedAccountId);
  const enabled = baseEnabled && merged.enabled !== false;

  const normalizedConfig: WechatIpadAccountConfig = {
    ...merged,
    name: merged.name?.trim() || undefined,
    baseUrl: merged.baseUrl?.trim() || undefined,
    apiToken: merged.apiToken?.trim() || undefined,
    tokenFile: merged.tokenFile?.trim() || undefined,
    robotId: merged.robotId?.trim() || undefined,
    wxid: merged.wxid?.trim() || undefined,
    loginType: merged.loginType?.trim().toLowerCase() as WechatIpadAccountConfig["loginType"],
  };

  return {
    accountId: resolvedAccountId,
    name: normalizedConfig.name,
    enabled,
    baseUrl: normalizedConfig.baseUrl || DEFAULT_BASE_URL,
    apiToken: tokenResolution.token,
    tokenSource: tokenResolution.source,
    robotId: normalizedConfig.robotId || DEFAULT_ROBOT_ID,
    inbound: {
      mode: resolveInboundMode(normalizedConfig),
      polling: resolvePollingConfig(normalizedConfig),
      webhook: resolveWebhookConfig(normalizedConfig),
    },
    config: normalizedConfig,
  };
}
