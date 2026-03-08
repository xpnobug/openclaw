import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import { resolveWechatIpadToken } from "./token.js";
import type {
  ResolvedWechatIpadAccount,
  WechatIpadAccountConfig,
  WechatIpadConfig,
  WechatIpadInboundMode,
  WechatIpadPollingConfig,
} from "./types.js";

const DEFAULT_BASE_URL = "http://localhost:9000";
const DEFAULT_ROBOT_ID = "default";
const DEFAULT_POLLING: Required<WechatIpadPollingConfig> = {
  intervalMs: 3000,
  lookbackSeconds: 120,
  maxPagesPerPoll: 10,
  pollAllContacts: false,
  pollContactIds: [],
};

function getWechatIpadConfig(cfg: OpenClawConfig): WechatIpadConfig | undefined {
  return cfg.channels?.["wechat-ipad"] as WechatIpadConfig | undefined;
}

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = getWechatIpadConfig(cfg)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
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

function mergeAccountConfig(cfg: OpenClawConfig, accountId: string): WechatIpadAccountConfig {
  const raw = getWechatIpadConfig(cfg) ?? {};
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
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
    pollContactIds: polling?.pollContactIds ?? DEFAULT_POLLING.pollContactIds,
  };
}

export function listWechatIpadAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultWechatIpadAccountId(cfg: OpenClawConfig): string {
  const section = getWechatIpadConfig(cfg);
  if (section?.defaultAccount?.trim()) {
    return section.defaultAccount.trim();
  }
  const ids = listWechatIpadAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveWechatIpadAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedWechatIpadAccount {
  const accountId = normalizeAccountId(params.accountId);
  const section = getWechatIpadConfig(params.cfg);
  const baseEnabled = section?.enabled !== false;
  const merged = mergeAccountConfig(params.cfg, accountId);
  const tokenResolution = resolveWechatIpadToken(section, accountId);
  const enabled = baseEnabled && merged.enabled !== false;

  const normalizedConfig: WechatIpadAccountConfig = {
    ...merged,
    wxid: merged.wxid?.trim() || undefined,
  };

  return {
    accountId,
    name: normalizedConfig.name?.trim() || undefined,
    enabled,
    baseUrl: normalizedConfig.baseUrl?.trim() || DEFAULT_BASE_URL,
    apiToken: tokenResolution.token,
    tokenSource: tokenResolution.source,
    robotId: normalizedConfig.robotId?.trim() || DEFAULT_ROBOT_ID,
    inbound: {
      mode: resolveInboundMode(normalizedConfig),
      polling: resolvePollingConfig(normalizedConfig),
    },
    config: normalizedConfig,
  };
}
