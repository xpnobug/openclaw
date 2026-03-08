import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import { resolveWechatIpadToken } from "./token.js";
import type {
  ResolvedWechatIpadAccount,
  WechatIpadAccountConfig,
  WechatIpadConfig,
  WechatIpadInboundConfig,
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
  return Object.keys(accounts)
    .map((accountId) => normalizeAccountId(accountId))
    .filter(Boolean);
}

function hasDefaultAccountSpecificConfig(cfg: OpenClawConfig): boolean {
  const section = getWechatIpadConfig(cfg);
  if (!section) {
    return false;
  }

  if (
    section.accounts &&
    typeof section.accounts === "object" &&
    section.accounts[DEFAULT_ACCOUNT_ID]
  ) {
    return true;
  }

  return Boolean(
    section.name?.trim() ||
    section.apiToken?.trim() ||
    section.tokenFile?.trim() ||
    section.wxid?.trim(),
  );
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

function resolveSharedTopLevelDefaults(cfg: OpenClawConfig): WechatIpadAccountConfig {
  const raw = getWechatIpadConfig(cfg) ?? {};
  return {
    markdown: raw.markdown,
    baseUrl: raw.baseUrl,
    robotId: raw.robotId,
    loginType: raw.loginType,
    inbound: raw.inbound,
    dmPolicy: raw.dmPolicy,
    groupPolicy: raw.groupPolicy,
    allowFrom: raw.allowFrom,
    commandAllowFrom: raw.commandAllowFrom,
    requireMention: raw.requireMention,
    safetyPrefix: raw.safetyPrefix,
  };
}

function resolveDefaultTopLevelConfig(cfg: OpenClawConfig): WechatIpadAccountConfig {
  const raw = getWechatIpadConfig(cfg) ?? {};
  const { accounts: _ignored, defaultAccount: _ignoredDefaultAccount, ...base } = raw;
  return base;
}

function resolveAccountsDefaultConfig(cfg: OpenClawConfig): WechatIpadAccountConfig {
  const defaults = resolveAccountConfig(cfg, DEFAULT_ACCOUNT_ID) ?? {};
  const {
    enabled: _ignoredEnabled,
    apiToken: _ignoredApiToken,
    tokenFile: _ignoredTokenFile,
    wxid: _ignoredWxid,
    ...shared
  } = defaults;
  return shared;
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
  };
}

function mergeWechatIpadConfigLayers(
  ...layers: Array<WechatIpadAccountConfig | undefined>
): WechatIpadAccountConfig {
  let merged: WechatIpadAccountConfig = {};
  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    merged = {
      ...merged,
      ...layer,
      inbound: mergeInboundConfig(merged.inbound, layer.inbound),
    };
  }
  return merged;
}

function mergeAccountConfig(cfg: OpenClawConfig, accountId: string): WechatIpadAccountConfig {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return mergeWechatIpadConfigLayers(
      resolveDefaultTopLevelConfig(cfg),
      resolveAccountConfig(cfg, accountId),
    );
  }

  return mergeWechatIpadConfigLayers(
    resolveAccountsDefaultConfig(cfg),
    resolveSharedTopLevelDefaults(cfg),
    resolveAccountConfig(cfg, accountId),
  );
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

export function listWechatIpadAccountIds(cfg: OpenClawConfig): string[] {
  const ids = new Set(listConfiguredAccountIds(cfg));
  if (hasDefaultAccountSpecificConfig(cfg) || ids.size === 0) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }
  return Array.from(ids).sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultWechatIpadAccountId(cfg: OpenClawConfig): string {
  const ids = listWechatIpadAccountIds(cfg);
  const preferred = getWechatIpadConfig(cfg)?.defaultAccount?.trim();
  if (preferred && ids.includes(preferred)) {
    return preferred;
  }
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
    name: merged.name?.trim() || undefined,
    baseUrl: merged.baseUrl?.trim() || undefined,
    apiToken: merged.apiToken?.trim() || undefined,
    tokenFile: merged.tokenFile?.trim() || undefined,
    robotId: merged.robotId?.trim() || undefined,
    wxid: merged.wxid?.trim() || undefined,
    loginType: merged.loginType?.trim().toLowerCase() as WechatIpadAccountConfig["loginType"],
  };

  return {
    accountId,
    name: normalizedConfig.name,
    enabled,
    baseUrl: normalizedConfig.baseUrl || DEFAULT_BASE_URL,
    apiToken: tokenResolution.token,
    tokenSource: tokenResolution.source,
    robotId: normalizedConfig.robotId || DEFAULT_ROBOT_ID,
    inbound: {
      mode: resolveInboundMode(normalizedConfig),
      polling: resolvePollingConfig(normalizedConfig),
    },
    config: normalizedConfig,
  };
}
