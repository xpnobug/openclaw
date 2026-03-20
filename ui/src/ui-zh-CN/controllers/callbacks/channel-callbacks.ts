import type { AgentsConfigProps } from "../../views/agents/types.js";
import { loadModelConfig } from "../model-config.js";
import {
  createInitialWechatIpadAccountUiState,
  invalidateModelConfigDerivedState,
  type WechatIpadAccountUiState,
} from "../state.js";
/**
 * 通道配置 回调
 */
import type { CallbackContext } from "./types.js";

const DEFAULT_WECHAT_IPAD_LOGIN_TYPE = "ipad" as const;
const DEFAULT_WECHAT_IPAD_DRAFT_ACCOUNT_ID = "main";

type Pick_ = Pick<
  AgentsConfigProps,
  | "onChannelSelect"
  | "onChannelConfigUpdate"
  | "onNavigateToChannels"
  | "onAddChannel"
  | "onChannelsRefresh"
  | "onWechatIpadAccountSelect"
  | "onWechatIpadStart"
  | "onWechatIpadWait"
  | "onWechatIpadLogout"
  | "onWechatIpadLoginTypeChange"
  | "onWechatIpadLoginTypeConfirmCancel"
  | "onWechatIpadLoginTypeConfirmSubmit"
  | "onWechatIpadVerificationCodeChange"
  | "onWechatIpadSubmitVerificationCode"
  | "onWechatIpadAccountAdd"
  | "onWechatIpadAccountAddDraftChange"
  | "onWechatIpadAccountAddConfirm"
  | "onWechatIpadAccountAddCancel"
  | "onWechatIpadAccountDeleteRequest"
  | "onWechatIpadAccountDeleteConfirm"
  | "onWechatIpadAccountDeleteCancel"
>;

function resolveWechatIpadLoginType(value: unknown): "ipad" | "win" | "mac" | "car" {
  if (value === "win" || value === "mac" || value === "car") {
    return value;
  }
  return "ipad";
}

function resolveQrCountdownSeconds(message: string | null): number | null {
  if (!message) {
    return null;
  }
  const match = message.match(/(\d{1,4})\s*(?:秒|s|sec|seconds?)/i);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function resolveQrCountdownSecondsFromExpiredTime(expiredTime: unknown): number | null {
  if (typeof expiredTime === "number" && Number.isFinite(expiredTime) && expiredTime > 0) {
    return Math.floor(expiredTime);
  }
  if (typeof expiredTime !== "string") {
    return null;
  }
  const trimmed = expiredTime.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number.parseInt(trimmed, 10);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  const parsedTime = Date.parse(trimmed.replace(" ", "T"));
  if (!Number.isFinite(parsedTime)) {
    return null;
  }
  const seconds = Math.floor((parsedTime - Date.now()) / 1000);
  return seconds > 0 ? seconds : null;
}

function scheduleCountdownTick(update: () => void): number {
  return window.setTimeout(update, 1000);
}

function toReadableError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getWechatIpadChannelConfig(s: CallbackContext["s"]): Record<string, unknown> {
  const raw = s.modelConfigChannelsConfig?.["wechat-ipad"];
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function getWechatIpadAccountsConfig(
  s: CallbackContext["s"],
): Record<string, Record<string, unknown>> {
  const accounts = getWechatIpadChannelConfig(s).accounts;
  return accounts && typeof accounts === "object"
    ? (accounts as Record<string, Record<string, unknown>>)
    : {};
}

function resolveSelectedWechatIpadAccountId(s: CallbackContext["s"]): string {
  const accountIds = Object.keys(getWechatIpadAccountsConfig(s));
  const selected = s.channelsWechatIpadSelectedAccountId?.trim();
  if (selected && (accountIds.length === 0 || accountIds.includes(selected))) {
    return selected;
  }
  const first = s.channelsWechatIpadAccountOrder[0]?.trim();
  if (first && (accountIds.length === 0 || accountIds.includes(first))) {
    return first;
  }
  const channelConfig = getWechatIpadChannelConfig(s);
  const defaultAccount =
    typeof channelConfig.defaultAccount === "string" ? channelConfig.defaultAccount.trim() : "";
  if (defaultAccount) {
    return defaultAccount;
  }
  return accountIds[0] ?? DEFAULT_WECHAT_IPAD_DRAFT_ACCOUNT_ID;
}

function getWechatIpadAccountState(
  s: CallbackContext["s"],
  accountId: string = resolveSelectedWechatIpadAccountId(s),
): WechatIpadAccountUiState {
  return ensureWechatIpadAccountState(s, accountId);
}

function updateWechatIpadAccountState(
  s: CallbackContext["s"],
  accountId: string,
  updater: (state: WechatIpadAccountUiState) => void,
): WechatIpadAccountUiState {
  const state = ensureWechatIpadAccountState(s, accountId);
  updater(state);
  return state;
}

function getCurrentWechatIpadState(s: CallbackContext["s"]): WechatIpadAccountUiState {
  return getWechatIpadAccountState(s, resolveSelectedWechatIpadAccountId(s));
}

function updateCurrentWechatIpadState(
  s: CallbackContext["s"],
  updater: (state: WechatIpadAccountUiState) => void,
): WechatIpadAccountUiState {
  return updateWechatIpadAccountState(s, resolveSelectedWechatIpadAccountId(s), updater);
}

function resolveWechatIpadLoginTypeFromConfig(
  s: CallbackContext["s"],
  accountId: string,
): "ipad" | "win" | "mac" | "car" {
  const accounts = getWechatIpadAccountsConfig(s);
  return resolveWechatIpadLoginType(
    accounts[accountId]?.loginType ?? DEFAULT_WECHAT_IPAD_LOGIN_TYPE,
  );
}

function ensureWechatIpadAccountState(
  s: CallbackContext["s"],
  accountId: string,
): WechatIpadAccountUiState {
  const existing = s.channelsWechatIpadStateByAccount[accountId];
  if (existing) {
    return existing;
  }
  const loginType = resolveWechatIpadLoginTypeFromConfig(s, accountId);
  const next: WechatIpadAccountUiState = {
    ...createInitialWechatIpadAccountUiState(),
    loginType,
    loginTypeDraft: loginType,
  };
  s.channelsWechatIpadStateByAccount = {
    ...s.channelsWechatIpadStateByAccount,
    [accountId]: next,
  };
  return next;
}

function syncWechatIpadAccountOrderFromConfig(s: CallbackContext["s"]): void {
  const channelConfig = getWechatIpadChannelConfig(s);
  const accountIds = Object.keys(getWechatIpadAccountsConfig(s));
  const defaultAccount =
    typeof channelConfig.defaultAccount === "string" ? channelConfig.defaultAccount.trim() : "";
  const selected = s.channelsWechatIpadSelectedAccountId?.trim();
  const fallback =
    defaultAccount || selected || accountIds[0] || DEFAULT_WECHAT_IPAD_DRAFT_ACCOUNT_ID;

  s.channelsWechatIpadAccountOrder = accountIds.length > 0 ? accountIds : [fallback];
  s.channelsWechatIpadSelectedAccountId =
    accountIds.length > 0
      ? selected && accountIds.includes(selected)
        ? selected
        : fallback
      : fallback;
  ensureWechatIpadAccountState(s, s.channelsWechatIpadSelectedAccountId);
}

function selectWechatIpadAccount(s: CallbackContext["s"], accountId: string): void {
  ensureWechatIpadAccountState(s, accountId);
  s.channelsWechatIpadSelectedAccountId = accountId;
}

function clearWechatIpadAutoPollTimer(state: WechatIpadAccountUiState): void {
  if (state.autoPollTimerId != null) {
    window.clearTimeout(state.autoPollTimerId);
    state.autoPollTimerId = null;
  }
}

function stopWechatIpadAutoPolling(state: WechatIpadAccountUiState): void {
  clearWechatIpadAutoPollTimer(state);
  state.autoPolling = false;
}

function scheduleWechatIpadAutoPoll(
  state: WechatIpadAccountUiState,
  trigger: () => void,
  delayMs = 3000,
): void {
  clearWechatIpadAutoPollTimer(state);
  state.autoPolling = true;
  state.autoPollTimerId = window.setTimeout(() => {
    state.autoPollTimerId = null;
    trigger();
  }, delayMs);
}

function isWechatIpadTerminalPhase(phase: WechatIpadAccountUiState["phase"]): boolean {
  return phase === "connected" || phase === "verification" || phase === "expired";
}

function resolveWechatIpadWaitPhase(
  message: string | null,
  currentPhase: WechatIpadAccountUiState["phase"],
): "qr_ready" | "scanned" | "expired" {
  const normalized = message ?? "";
  if (/expired|过期|失效/i.test(normalized)) {
    return "expired";
  }
  if (/已扫码|scanned|等待手机确认|手机确认|confirm/i.test(normalized)) {
    return "scanned";
  }
  if (/未扫码|等待扫码|请扫码|scan\s*qr|二维码/i.test(normalized)) {
    return "qr_ready";
  }
  return currentPhase === "scanned" ? "scanned" : "qr_ready";
}

function refreshWechatIpadCountdown(
  state: WechatIpadAccountUiState,
  update: () => void,
  onTick: () => void,
): void {
  if (!state.countdownDeadlineMs) {
    state.countdownSeconds = null;
    return;
  }
  const remainingMs = state.countdownDeadlineMs - Date.now();
  if (remainingMs <= 0) {
    state.countdownSeconds = 0;
    state.countdownDeadlineMs = null;
    if (!state.loginConnected) {
      state.phase = "expired";
    }
    onTick();
    update();
    return;
  }
  state.countdownSeconds = Math.ceil(remainingMs / 1000);
  onTick();
  update();
  scheduleCountdownTick(() => refreshWechatIpadCountdown(state, update, onTick));
}

function primeWechatIpadCountdown(
  state: WechatIpadAccountUiState,
  update: () => void,
  onTick: () => void,
  params: { message?: string | null; expiredTime?: unknown },
): void {
  const countdownSeconds =
    resolveQrCountdownSecondsFromExpiredTime(params.expiredTime) ??
    resolveQrCountdownSeconds(params.message ?? null);
  if (countdownSeconds == null) {
    return;
  }
  state.countdownDeadlineMs = Date.now() + countdownSeconds * 1000;
  state.countdownSeconds = countdownSeconds;
  scheduleCountdownTick(() => refreshWechatIpadCountdown(state, update, onTick));
}

function updateWechatIpadAccountConfig(
  s: CallbackContext["s"],
  accountId: string,
  updater: (accountConfig: Record<string, unknown>) => Record<string, unknown>,
): void {
  const current = s.modelConfigChannelsConfig ?? {};
  const channelConfig = JSON.parse(JSON.stringify(current["wechat-ipad"] ?? {})) as Record<
    string,
    unknown
  >;
  const accounts =
    channelConfig.accounts && typeof channelConfig.accounts === "object"
      ? (channelConfig.accounts as Record<string, Record<string, unknown>>)
      : {};
  const accountConfig =
    accounts[accountId] && typeof accounts[accountId] === "object" ? accounts[accountId] : {};
  channelConfig.accounts = {
    ...accounts,
    [accountId]: updater(accountConfig),
  };
  s.modelConfigChannelsConfig = { ...current, ["wechat-ipad"]: channelConfig };
  invalidateModelConfigDerivedState(s);
}

function applyWechatIpadLoginTypeToConfig(
  s: CallbackContext["s"],
  accountId: string,
  loginType: "ipad" | "win" | "mac" | "car",
): void {
  updateWechatIpadAccountConfig(s, accountId, (accountConfig) => ({
    ...accountConfig,
    loginType,
  }));
}

function applyWechatIpadRuntimeWxidToConfig(
  s: CallbackContext["s"],
  accountId: string,
  wxid: string,
): void {
  const normalizedWxid = wxid.trim();
  if (!normalizedWxid) {
    return;
  }
  updateWechatIpadAccountConfig(s, accountId, (accountConfig) => ({
    ...accountConfig,
    wxid: normalizedWxid,
  }));
}

export function createChannelCallbacks(
  ctx: CallbackContext,
  extra: { loadChannelsStatus: () => Promise<void> },
): Pick_ {
  const { s, update } = ctx;

  // wechat-ipad 在线状态轮询（选中时每 10s 刷新一次）
  let statusPollTimer: ReturnType<typeof setTimeout> | null = null;
  function stopStatusPolling(): void {
    if (statusPollTimer != null) {
      clearTimeout(statusPollTimer);
      statusPollTimer = null;
    }
  }
  function startStatusPolling(): void {
    stopStatusPolling();
    const tick = () => {
      void extra.loadChannelsStatus().then(() => update());
      statusPollTimer = setTimeout(tick, 10_000);
    };
    statusPollTimer = setTimeout(tick, 10_000);
  }

  const touchWechatIpadState = (accountId: string): WechatIpadAccountUiState => {
    const state = getWechatIpadAccountState(s, accountId);
    selectWechatIpadAccount(s, accountId);
    return state;
  };

  const triggerWechatIpadAutoWait = (accountId: string) => {
    const state = touchWechatIpadState(accountId);
    if (
      !state.loginQrDataUrl ||
      isWechatIpadTerminalPhase(state.phase) ||
      state.countdownSeconds === 0
    ) {
      stopWechatIpadAutoPolling(state);
      selectWechatIpadAccount(s, accountId);
      update();
      return;
    }
    void runWechatIpadWait(accountId, true);
  };

  async function runWechatIpadWait(accountId: string, fromAutoPoll: boolean): Promise<void> {
    if (!s.client || !s.connected) {
      if (fromAutoPoll) {
        stopWechatIpadAutoPolling(touchWechatIpadState(accountId));
        selectWechatIpadAccount(s, accountId);
        update();
      }
      return;
    }

    const state = touchWechatIpadState(accountId);

    if (
      fromAutoPoll &&
      (!state.loginQrDataUrl ||
        isWechatIpadTerminalPhase(state.phase) ||
        state.countdownSeconds === 0)
    ) {
      stopWechatIpadAutoPolling(state);
      selectWechatIpadAccount(s, accountId);
      update();
      return;
    }

    if (state.busy || state.waitInFlight) {
      if (fromAutoPoll && state.autoPolling) {
        scheduleWechatIpadAutoPoll(state, () => triggerWechatIpadAutoWait(accountId), 1500);
        selectWechatIpadAccount(s, accountId);
        update();
      }
      return;
    }

    let shouldScheduleNext = false;
    let nextDelayMs = 3000;

    state.waitInFlight = true;
    state.busy = true;
    state.lastWaitAtMs = Date.now();
    if (state.phase === "qr_ready") {
      state.phase = "scanned";
    }
    selectWechatIpadAccount(s, accountId);
    update();

    try {
      const res = await s.client.request<{
        message?: string;
        connected?: boolean;
        requiresVerification?: boolean;
        ticket?: string;
        data62?: string;
        wxid?: string;
      }>("wechat-ipad.login.wait", {
        timeoutMs: 120000,
        accountId,
      });

      state.loginMessage = res.message ?? null;
      state.loginConnected = res.connected ?? null;
      state.requiresVerification = res.requiresVerification === true;
      state.ticket = res.ticket ?? null;
      if (res.data62) {
        state.data62 = res.data62;
      }
      if (typeof res.wxid === "string" && res.wxid.trim()) {
        state.runtimeWxid = res.wxid.trim();
      }

      if (res.connected) {
        state.loginQrDataUrl = null;
        state.requiresVerification = false;
        state.ticket = null;
        state.verificationCode = "";
        state.phase = "connected";
        state.countdownDeadlineMs = null;
        state.countdownSeconds = null;
        if (typeof res.wxid === "string" && res.wxid.trim()) {
          applyWechatIpadRuntimeWxidToConfig(s, accountId, res.wxid);
        }
        stopWechatIpadAutoPolling(state);
      } else if (res.requiresVerification) {
        state.phase = "verification";
        stopWechatIpadAutoPolling(state);
      } else {
        const message = res.message ?? "";
        const nextPhase = resolveWechatIpadWaitPhase(message, state.phase);
        if (nextPhase === "expired" || state.countdownSeconds === 0) {
          state.phase = "expired";
          state.countdownDeadlineMs = null;
          state.countdownSeconds = null;
          stopWechatIpadAutoPolling(state);
        } else {
          state.phase = nextPhase;
          if (fromAutoPoll || state.autoPolling) {
            shouldScheduleNext = true;
          }
        }
      }
    } catch (err) {
      state.loginMessage = toReadableError(err);
      state.loginConnected = null;
      state.requiresVerification = false;
      if (fromAutoPoll || state.autoPolling) {
        shouldScheduleNext = true;
        nextDelayMs = 5000;
      }
    } finally {
      state.waitInFlight = false;
      state.busy = false;

      if (
        shouldScheduleNext &&
        state.loginQrDataUrl &&
        !isWechatIpadTerminalPhase(state.phase) &&
        state.countdownSeconds !== 0
      ) {
        scheduleWechatIpadAutoPoll(state, () => triggerWechatIpadAutoWait(accountId), nextDelayMs);
      } else if (fromAutoPoll) {
        stopWechatIpadAutoPolling(state);
      }

      selectWechatIpadAccount(s, accountId);
      update();
    }
  }

  return {
    onChannelSelect: (channelId) => {
      s.modelConfigSelectedChannel = channelId;
      if (channelId === "wechat-ipad") {
        syncWechatIpadAccountOrderFromConfig(s);
        selectWechatIpadAccount(s, resolveSelectedWechatIpadAccountId(s));
        // 立即加载一次状态，然后启动定期轮询
        void extra.loadChannelsStatus().then(() => update());
        startStatusPolling();
      } else {
        stopStatusPolling();
      }
      update();
    },
    onChannelConfigUpdate: (channelId, field, value) => {
      const current = s.modelConfigChannelsConfig ?? {};
      const channelConfig = JSON.parse(JSON.stringify(current[channelId] ?? {}));
      const parts = field.split(".");
      if (parts.length === 1) {
        channelConfig[field] = value;
      } else {
        let target = channelConfig;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) {
            target[parts[i]] = {};
          }
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;
      }
      s.modelConfigChannelsConfig = { ...current, [channelId]: channelConfig };
      if (channelId === "wechat-ipad") {
        syncWechatIpadAccountOrderFromConfig(s);
        const selectedAccountId = resolveSelectedWechatIpadAccountId(s);
        const accountScopedLoginTypeMatch = field.match(/^accounts\.([^.]+)\.loginType$/);
        const loginTypeAccountId = accountScopedLoginTypeMatch?.[1] ?? selectedAccountId;
        const state = ensureWechatIpadAccountState(s, loginTypeAccountId);
        if (field === "loginType" || accountScopedLoginTypeMatch) {
          const resolved = resolveWechatIpadLoginType(value);
          state.loginType = resolved;
          if (!state.loginTypeConfirmOpen) {
            state.loginTypeDraft = resolved;
          }
        }
        selectWechatIpadAccount(s, selectedAccountId);
      }
      invalidateModelConfigDerivedState(s);
      update();
    },
    onNavigateToChannels: () => {
      const el = document.querySelector("openclaw-config-zh");
      el?.dispatchEvent(new CustomEvent("navigate-channels", { bubbles: true, composed: true }));
    },
    onAddChannel: () => {
      s.showChannelWizard = true;
      update();
    },
    onChannelsRefresh: () => {
      void Promise.all([loadModelConfig(s), extra.loadChannelsStatus()]).then(() => {
        syncWechatIpadAccountOrderFromConfig(s);
        selectWechatIpadAccount(s, resolveSelectedWechatIpadAccountId(s));
        update();
      });
    },
    onWechatIpadAccountSelect: (accountId) => {
      updateWechatIpadAccountState(s, accountId, (state) => {
        state.loginType = resolveWechatIpadLoginTypeFromConfig(s, accountId);
        if (!state.loginTypeConfirmOpen) {
          state.loginTypeDraft = state.loginType;
        }
      });
      selectWechatIpadAccount(s, accountId);
      update();
    },
    onWechatIpadStart: (force) => {
      const accountId = resolveSelectedWechatIpadAccountId(s);
      const state = getCurrentWechatIpadState(s);
      if (!s.client || !s.connected || state.busy) {
        return;
      }
      updateCurrentWechatIpadState(s, (currentState) => {
        stopWechatIpadAutoPolling(currentState);
        currentState.loginTypeConfirmOpen = true;
        currentState.loginTypeConfirmForce = force;
        currentState.loginTypeDraft = resolveWechatIpadLoginTypeFromConfig(s, accountId);
      });
      selectWechatIpadAccount(s, accountId);
      update();
    },
    onWechatIpadWait: async () => {
      const accountId = resolveSelectedWechatIpadAccountId(s);
      const state = getCurrentWechatIpadState(s);

      // 有活跃的 QR 登录会话 → 走原有的 loginCheckQR 流程
      if (state.loginQrDataUrl && !isWechatIpadTerminalPhase(state.phase)) {
        await runWechatIpadWait(accountId, false);
        return;
      }

      // 没有活跃 QR 会话 → 调用桥接 probe 检测实际连接状态
      if (!s.client || !s.connected || state.busy) {
        return;
      }

      updateCurrentWechatIpadState(s, (cs) => {
        cs.busy = true;
        cs.waitInFlight = true;
        cs.lastWaitAtMs = Date.now();
      });
      selectWechatIpadAccount(s, accountId);
      update();

      try {
        const res = await s.client.request<{
          channelAccounts?: Record<
            string,
            Array<{
              accountId: string;
              connected?: boolean;
              running?: boolean;
              probe?: { ok?: boolean; message?: string; elapsedMs?: number };
              lastProbeAt?: number;
            }>
          >;
        }>("channels.status", { probe: true, timeoutMs: 8000 });

        const accounts = res?.channelAccounts?.["wechat-ipad"];
        const match = Array.isArray(accounts)
          ? accounts.find((a) => a.accountId === accountId)
          : undefined;

        updateCurrentWechatIpadState(s, (cs) => {
          if (match) {
            cs.loginConnected = match.connected ?? null;
            const probeOk = match.probe?.ok;
            if (probeOk === true) {
              cs.loginMessage = `桥接正常（${match.probe?.elapsedMs ?? 0}ms）`;
              if (match.connected) {
                cs.phase = "connected";
              }
            } else if (probeOk === false) {
              cs.loginMessage = `桥接异常: ${match.probe?.message ?? "未知错误"}`;
              cs.loginConnected = false;
            } else {
              cs.loginMessage = match.connected ? "已连接" : "未连接";
            }
          } else {
            cs.loginMessage = "未找到该账号的状态信息";
            cs.loginConnected = null;
          }
        });
      } catch (err) {
        updateCurrentWechatIpadState(s, (cs) => {
          cs.loginMessage = `检测失败: ${err instanceof Error ? err.message : String(err)}`;
          cs.loginConnected = null;
        });
      } finally {
        updateCurrentWechatIpadState(s, (cs) => {
          cs.busy = false;
          cs.waitInFlight = false;
        });
        selectWechatIpadAccount(s, accountId);
        update();
      }
    },
    onWechatIpadLogout: async () => {
      const accountId = resolveSelectedWechatIpadAccountId(s);
      const state = getCurrentWechatIpadState(s);
      if (!s.client || !s.connected || state.busy) {
        return;
      }
      updateCurrentWechatIpadState(s, (currentState) => {
        stopWechatIpadAutoPolling(currentState);
        currentState.busy = true;
      });
      selectWechatIpadAccount(s, accountId);
      update();
      try {
        await s.client.request("channels.logout", { channel: "wechat-ipad", accountId });
        updateCurrentWechatIpadState(s, (currentState) => {
          Object.assign(currentState, createInitialWechatIpadAccountUiState(), {
            loginType: resolveWechatIpadLoginTypeFromConfig(s, accountId),
            loginTypeDraft: resolveWechatIpadLoginTypeFromConfig(s, accountId),
            loginMessage: "已退出登录。",
            runtimeWxid: null,
          });
        });
      } catch (err) {
        updateCurrentWechatIpadState(s, (currentState) => {
          currentState.loginMessage = toReadableError(err);
        });
      } finally {
        updateCurrentWechatIpadState(s, (currentState) => {
          currentState.busy = false;
          currentState.waitInFlight = false;
        });
        selectWechatIpadAccount(s, accountId);
        update();
      }
    },
    onWechatIpadLoginTypeChange: (loginType) => {
      const accountId = resolveSelectedWechatIpadAccountId(s);
      const resolvedLoginType = resolveWechatIpadLoginType(loginType);
      updateCurrentWechatIpadState(s, (currentState) => {
        currentState.loginTypeDraft = resolvedLoginType;
        if (!currentState.loginTypeConfirmOpen) {
          currentState.loginType = resolvedLoginType;
          applyWechatIpadLoginTypeToConfig(s, accountId, resolvedLoginType);
        }
      });
      selectWechatIpadAccount(s, accountId);
      update();
    },
    onWechatIpadLoginTypeConfirmCancel: () => {
      const accountId = resolveSelectedWechatIpadAccountId(s);
      const state = getCurrentWechatIpadState(s);
      if (state.busy) {
        return;
      }
      updateCurrentWechatIpadState(s, (currentState) => {
        currentState.loginTypeConfirmOpen = false;
        currentState.loginTypeConfirmForce = false;
        currentState.loginTypeDraft = currentState.loginType;
      });
      selectWechatIpadAccount(s, accountId);
      update();
    },
    onWechatIpadLoginTypeConfirmSubmit: async () => {
      const accountId = resolveSelectedWechatIpadAccountId(s);
      const state = touchWechatIpadState(accountId);
      if (!s.client || !s.connected || state.busy) {
        return;
      }

      const force = state.loginTypeConfirmForce;
      const loginType = resolveWechatIpadLoginType(state.loginTypeDraft);

      state.loginType = loginType;
      state.loginTypeDraft = loginType;
      applyWechatIpadLoginTypeToConfig(s, accountId, loginType);

      stopWechatIpadAutoPolling(state);
      state.loginTypeConfirmOpen = false;
      state.loginTypeConfirmForce = false;
      state.busy = true;
      state.phase = "loading_qr";
      state.loginConnected = null;
      state.countdownDeadlineMs = null;
      state.countdownSeconds = null;
      selectWechatIpadAccount(s, accountId);
      update();

      try {
        const res = await s.client.request<{
          message?: string;
          qrDataUrl?: string;
          data62?: string;
          expiredTime?: unknown;
        }>("wechat-ipad.login.start", {
          force,
          timeoutMs: 30000,
          accountId,
          loginType,
        });

        state.loginMessage = res.message ?? null;
        state.loginQrDataUrl = res.qrDataUrl ?? null;
        state.loginConnected = null;
        state.requiresVerification = false;
        state.ticket = null;
        state.data62 = res.data62 ?? null;
        state.verificationCode = "";
        state.phase = res.qrDataUrl ? "qr_ready" : "loading_qr";

        primeWechatIpadCountdown(state, update, () => selectWechatIpadAccount(s, accountId), {
          message: res.message ?? null,
          expiredTime: res.expiredTime,
        });

        if (res.qrDataUrl) {
          scheduleWechatIpadAutoPoll(state, () => triggerWechatIpadAutoWait(accountId), 1500);
        }
      } catch (err) {
        state.loginMessage = toReadableError(err);
        state.loginQrDataUrl = null;
        state.loginConnected = null;
        state.requiresVerification = false;
        state.phase = "idle";
        state.countdownDeadlineMs = null;
        state.countdownSeconds = null;
        stopWechatIpadAutoPolling(state);
      } finally {
        state.busy = false;
        selectWechatIpadAccount(s, accountId);
        update();
      }
    },
    onWechatIpadVerificationCodeChange: (code) => {
      const accountId = resolveSelectedWechatIpadAccountId(s);
      const state = touchWechatIpadState(accountId);
      state.verificationCode = code;
      selectWechatIpadAccount(s, accountId);
      update();
    },
    onWechatIpadSubmitVerificationCode: async () => {
      const accountId = resolveSelectedWechatIpadAccountId(s);
      const state = touchWechatIpadState(accountId);
      if (!s.client || !s.connected || state.verificationBusy || !state.verificationCode.trim()) {
        return;
      }

      if (!state.ticket) {
        state.loginMessage = "缺少 ticket，请先等待状态更新以获取安全校验信息。";
        selectWechatIpadAccount(s, accountId);
        update();
        return;
      }

      state.verificationBusy = true;
      selectWechatIpadAccount(s, accountId);
      update();

      try {
        const res = await s.client.request<{ ok?: boolean; message?: string }>(
          "wechat-ipad.login.submitVerificationCode",
          {
            code: state.verificationCode.trim(),
            ...(state.ticket ? { ticket: state.ticket } : {}),
            accountId,
          },
        );

        state.loginMessage = res.message ?? "验证码已提交，请继续等待登录结果。";
        state.verificationCode = "";
        state.requiresVerification = false;
        state.phase = "scanned";

        if (state.loginQrDataUrl) {
          scheduleWechatIpadAutoPoll(state, () => triggerWechatIpadAutoWait(accountId), 1000);
        }
      } catch (err) {
        state.loginMessage = toReadableError(err);
        state.requiresVerification = true;
        state.phase = "verification";
        stopWechatIpadAutoPolling(state);
      } finally {
        state.verificationBusy = false;
        selectWechatIpadAccount(s, accountId);
        update();
      }
    },
    // 多账号管理回调
    onWechatIpadAccountAdd: () => {
      s.channelsWechatIpadAddAccountOpen = true;
      s.channelsWechatIpadAddAccountDraft = "";
      update();
    },
    onWechatIpadAccountAddDraftChange: (value: string) => {
      s.channelsWechatIpadAddAccountDraft = value;
      update();
    },
    onWechatIpadAccountAddConfirm: () => {
      const draft = s.channelsWechatIpadAddAccountDraft.trim();
      if (!draft) {
        return;
      }
      const accounts = getWechatIpadAccountsConfig(s);
      if (accounts[draft]) {
        return;
      }
      updateWechatIpadAccountConfig(s, draft, (c) => ({ ...c }));
      syncWechatIpadAccountOrderFromConfig(s);
      selectWechatIpadAccount(s, draft);
      s.channelsWechatIpadAddAccountOpen = false;
      s.channelsWechatIpadAddAccountDraft = "";
      update();
    },
    onWechatIpadAccountAddCancel: () => {
      s.channelsWechatIpadAddAccountOpen = false;
      s.channelsWechatIpadAddAccountDraft = "";
      update();
    },
    onWechatIpadAccountDeleteRequest: (accountId: string) => {
      s.channelsWechatIpadDeleteConfirmId = accountId;
      update();
    },
    onWechatIpadAccountDeleteConfirm: () => {
      const accountId = s.channelsWechatIpadDeleteConfirmId;
      if (!accountId) {
        return;
      }
      const current = s.modelConfigChannelsConfig ?? {};
      const channelConfig = JSON.parse(JSON.stringify(current["wechat-ipad"] ?? {})) as Record<
        string,
        unknown
      >;
      const accounts =
        channelConfig.accounts && typeof channelConfig.accounts === "object"
          ? (channelConfig.accounts as Record<string, unknown>)
          : {};
      delete accounts[accountId];
      channelConfig.accounts = accounts;
      s.modelConfigChannelsConfig = { ...current, ["wechat-ipad"]: channelConfig };
      delete s.channelsWechatIpadStateByAccount[accountId];
      invalidateModelConfigDerivedState(s);
      syncWechatIpadAccountOrderFromConfig(s);
      s.channelsWechatIpadDeleteConfirmId = null;
      update();
    },
    onWechatIpadAccountDeleteCancel: () => {
      s.channelsWechatIpadDeleteConfirmId = null;
      update();
    },
  };
}
