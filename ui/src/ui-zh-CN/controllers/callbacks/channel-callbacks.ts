import type { AgentsConfigProps } from "../../views/agents/types";
import { loadModelConfig } from "../model-config";
import { invalidateModelConfigDerivedState } from "../state";
/**
 * 通道配置 回调
 */
import type { CallbackContext } from "./types";

type Pick_ = Pick<
  AgentsConfigProps,
  | "onChannelSelect"
  | "onChannelConfigUpdate"
  | "onNavigateToChannels"
  | "onAddChannel"
  | "onChannelsRefresh"
  | "onWechatIpadStart"
  | "onWechatIpadWait"
  | "onWechatIpadLogout"
  | "onWechatIpadLoginTypeChange"
  | "onWechatIpadLoginTypeConfirmCancel"
  | "onWechatIpadLoginTypeConfirmSubmit"
  | "onWechatIpadVerificationCodeChange"
  | "onWechatIpadSubmitVerificationCode"
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

function clearWechatIpadAutoPollTimer(s: CallbackContext["s"]): void {
  if (s.channelsWechatIpadAutoPollTimerId != null) {
    window.clearTimeout(s.channelsWechatIpadAutoPollTimerId);
    s.channelsWechatIpadAutoPollTimerId = null;
  }
}

function stopWechatIpadAutoPolling(s: CallbackContext["s"]): void {
  clearWechatIpadAutoPollTimer(s);
  s.channelsWechatIpadAutoPolling = false;
}

function scheduleWechatIpadAutoPoll(
  s: CallbackContext["s"],
  trigger: () => void,
  delayMs = 3000,
): void {
  clearWechatIpadAutoPollTimer(s);
  s.channelsWechatIpadAutoPolling = true;
  s.channelsWechatIpadAutoPollTimerId = window.setTimeout(() => {
    s.channelsWechatIpadAutoPollTimerId = null;
    trigger();
  }, delayMs);
}

function isWechatIpadTerminalPhase(
  phase: CallbackContext["s"]["channelsWechatIpadPhase"],
): boolean {
  return phase === "connected" || phase === "verification" || phase === "expired";
}

function resolveWechatIpadWaitPhase(
  message: string | null,
  currentPhase: CallbackContext["s"]["channelsWechatIpadPhase"],
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

function refreshWechatIpadCountdown(s: CallbackContext["s"], update: () => void): void {
  if (!s.channelsWechatIpadCountdownDeadlineMs) {
    s.channelsWechatIpadCountdownSeconds = null;
    return;
  }
  const remainingMs = s.channelsWechatIpadCountdownDeadlineMs - Date.now();
  if (remainingMs <= 0) {
    s.channelsWechatIpadCountdownSeconds = 0;
    s.channelsWechatIpadCountdownDeadlineMs = null;
    if (!s.channelsWechatIpadLoginConnected) {
      s.channelsWechatIpadPhase = "expired";
    }
    update();
    return;
  }
  s.channelsWechatIpadCountdownSeconds = Math.ceil(remainingMs / 1000);
  update();
  scheduleCountdownTick(() => refreshWechatIpadCountdown(s, update));
}

function primeWechatIpadCountdown(
  s: CallbackContext["s"],
  update: () => void,
  params: { message?: string | null; expiredTime?: unknown },
): void {
  const countdownSeconds =
    resolveQrCountdownSecondsFromExpiredTime(params.expiredTime) ??
    resolveQrCountdownSeconds(params.message ?? null);
  if (countdownSeconds == null) {
    return;
  }
  s.channelsWechatIpadCountdownDeadlineMs = Date.now() + countdownSeconds * 1000;
  s.channelsWechatIpadCountdownSeconds = countdownSeconds;
  scheduleCountdownTick(() => refreshWechatIpadCountdown(s, update));
}

function toReadableError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function applyWechatIpadLoginTypeToConfig(
  s: CallbackContext["s"],
  loginType: "ipad" | "win" | "mac" | "car",
): void {
  const current = s.modelConfigChannelsConfig ?? {};
  const channelConfig = JSON.parse(JSON.stringify(current["wechat-ipad"] ?? {}));
  channelConfig.loginType = loginType;
  s.modelConfigChannelsConfig = { ...current, ["wechat-ipad"]: channelConfig };
  invalidateModelConfigDerivedState(s);
}

function resolveWechatIpadLoginTypeFromState(
  s: CallbackContext["s"],
): "ipad" | "win" | "mac" | "car" {
  const rawConfig = s.modelConfigChannelsConfig?.["wechat-ipad"];
  const configLoginType =
    rawConfig && typeof rawConfig === "object"
      ? (rawConfig as { loginType?: unknown }).loginType
      : undefined;
  return resolveWechatIpadLoginType(configLoginType ?? s.channelsWechatIpadLoginType);
}

export function createChannelCallbacks(
  ctx: CallbackContext,
  extra: { loadChannelsStatus: () => Promise<void> },
): Pick_ {
  const { s, update } = ctx;

  const triggerWechatIpadAutoWait = () => {
    if (
      !s.channelsWechatIpadLoginQrDataUrl ||
      isWechatIpadTerminalPhase(s.channelsWechatIpadPhase) ||
      s.channelsWechatIpadCountdownSeconds === 0
    ) {
      stopWechatIpadAutoPolling(s);
      update();
      return;
    }
    void runWechatIpadWait(true);
  };

  async function runWechatIpadWait(fromAutoPoll: boolean): Promise<void> {
    if (!s.client || !s.connected) {
      if (fromAutoPoll) {
        stopWechatIpadAutoPolling(s);
        update();
      }
      return;
    }

    if (
      fromAutoPoll &&
      (!s.channelsWechatIpadLoginQrDataUrl ||
        isWechatIpadTerminalPhase(s.channelsWechatIpadPhase) ||
        s.channelsWechatIpadCountdownSeconds === 0)
    ) {
      stopWechatIpadAutoPolling(s);
      update();
      return;
    }

    if (s.channelsWechatIpadBusy || s.channelsWechatIpadWaitInFlight) {
      if (fromAutoPoll && s.channelsWechatIpadAutoPolling) {
        scheduleWechatIpadAutoPoll(s, triggerWechatIpadAutoWait, 1500);
        update();
      }
      return;
    }

    let shouldScheduleNext = false;
    let nextDelayMs = 3000;

    s.channelsWechatIpadWaitInFlight = true;
    s.channelsWechatIpadBusy = true;
    s.channelsWechatIpadLastWaitAtMs = Date.now();
    if (s.channelsWechatIpadPhase === "qr_ready") {
      s.channelsWechatIpadPhase = "scanned";
    }
    update();

    try {
      const res = await s.client.request<{
        message?: string;
        connected?: boolean;
        requiresVerification?: boolean;
        ticket?: string;
        data62?: string;
        wxid?: string;
      }>("web.login.wait", {
        channel: "wechat-ipad",
        timeoutMs: 120000,
        accountId: "default",
      });

      s.channelsWechatIpadLoginMessage = res.message ?? null;
      s.channelsWechatIpadLoginConnected = res.connected ?? null;
      s.channelsWechatIpadRequiresVerification = res.requiresVerification === true;
      s.channelsWechatIpadTicket = res.ticket ?? null;
      if (res.data62) {
        s.channelsWechatIpadData62 = res.data62;
      }

      if (res.connected) {
        s.channelsWechatIpadLoginQrDataUrl = null;
        s.channelsWechatIpadRequiresVerification = false;
        s.channelsWechatIpadTicket = null;
        s.channelsWechatIpadVerificationCode = "";
        s.channelsWechatIpadPhase = "connected";
        s.channelsWechatIpadCountdownDeadlineMs = null;
        s.channelsWechatIpadCountdownSeconds = null;
        stopWechatIpadAutoPolling(s);
      } else if (res.requiresVerification) {
        s.channelsWechatIpadPhase = "verification";
        stopWechatIpadAutoPolling(s);
      } else {
        const message = res.message ?? "";
        const nextPhase = resolveWechatIpadWaitPhase(message, s.channelsWechatIpadPhase);
        if (nextPhase === "expired" || s.channelsWechatIpadCountdownSeconds === 0) {
          s.channelsWechatIpadPhase = "expired";
          s.channelsWechatIpadCountdownDeadlineMs = null;
          s.channelsWechatIpadCountdownSeconds = null;
          stopWechatIpadAutoPolling(s);
        } else {
          s.channelsWechatIpadPhase = nextPhase;
          if (fromAutoPoll || s.channelsWechatIpadAutoPolling) {
            shouldScheduleNext = true;
          }
        }
      }
    } catch (err) {
      s.channelsWechatIpadLoginMessage = toReadableError(err);
      s.channelsWechatIpadLoginConnected = null;
      s.channelsWechatIpadRequiresVerification = false;
      if (fromAutoPoll || s.channelsWechatIpadAutoPolling) {
        shouldScheduleNext = true;
        nextDelayMs = 5000;
      }
    } finally {
      s.channelsWechatIpadWaitInFlight = false;
      s.channelsWechatIpadBusy = false;

      if (
        shouldScheduleNext &&
        s.channelsWechatIpadLoginQrDataUrl &&
        !isWechatIpadTerminalPhase(s.channelsWechatIpadPhase) &&
        s.channelsWechatIpadCountdownSeconds !== 0
      ) {
        scheduleWechatIpadAutoPoll(s, triggerWechatIpadAutoWait, nextDelayMs);
      } else if (fromAutoPoll) {
        stopWechatIpadAutoPolling(s);
      }

      update();
    }
  }

  return {
    onChannelSelect: (channelId) => {
      s.modelConfigSelectedChannel = channelId;
      if (channelId === "wechat-ipad") {
        const loginType = resolveWechatIpadLoginTypeFromState(s);
        s.channelsWechatIpadLoginType = loginType;
        s.channelsWechatIpadLoginTypeDraft = loginType;
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
      if (channelId === "wechat-ipad" && field === "loginType") {
        const resolved = resolveWechatIpadLoginType(value);
        s.channelsWechatIpadLoginType = resolved;
        if (!s.channelsWechatIpadLoginTypeConfirmOpen) {
          s.channelsWechatIpadLoginTypeDraft = resolved;
        }
      }
      invalidateModelConfigDerivedState(s);
      update();
    },
    onNavigateToChannels: () => {
      // 通过 DOM 事件通知外部
      const el = document.querySelector("openclaw-config-zh");
      el?.dispatchEvent(new CustomEvent("navigate-channels", { bubbles: true, composed: true }));
    },
    onAddChannel: () => {
      s.showChannelWizard = true;
      update();
    },
    onChannelsRefresh: () => {
      void Promise.all([loadModelConfig(s), extra.loadChannelsStatus()]).then(() => {
        const loginType = resolveWechatIpadLoginTypeFromState(s);
        s.channelsWechatIpadLoginType = loginType;
        s.channelsWechatIpadLoginTypeDraft = loginType;
        update();
      });
    },
    onWechatIpadStart: (force) => {
      if (!s.client || !s.connected || s.channelsWechatIpadBusy) {
        return;
      }
      stopWechatIpadAutoPolling(s);
      s.channelsWechatIpadLoginTypeConfirmOpen = true;
      s.channelsWechatIpadLoginTypeConfirmForce = force;
      s.channelsWechatIpadLoginTypeDraft = resolveWechatIpadLoginTypeFromState(s);
      update();
    },
    onWechatIpadWait: async () => {
      await runWechatIpadWait(false);
    },
    onWechatIpadLogout: async () => {
      if (!s.client || !s.connected || s.channelsWechatIpadBusy) {
        return;
      }
      stopWechatIpadAutoPolling(s);
      s.channelsWechatIpadBusy = true;
      update();
      try {
        await s.client.request("channels.logout", { channel: "wechat-ipad", accountId: "default" });
        s.channelsWechatIpadLoginMessage = "已退出登录。";
        s.channelsWechatIpadLoginQrDataUrl = null;
        s.channelsWechatIpadLoginConnected = null;
        s.channelsWechatIpadRequiresVerification = false;
        s.channelsWechatIpadTicket = null;
        s.channelsWechatIpadData62 = null;
        s.channelsWechatIpadVerificationCode = "";
        s.channelsWechatIpadVerificationBusy = false;
        s.channelsWechatIpadPhase = "idle";
        s.channelsWechatIpadCountdownDeadlineMs = null;
        s.channelsWechatIpadCountdownSeconds = null;
        s.channelsWechatIpadLoginTypeConfirmOpen = false;
        s.channelsWechatIpadLoginTypeConfirmForce = false;
      } catch (err) {
        s.channelsWechatIpadLoginMessage = toReadableError(err);
      } finally {
        s.channelsWechatIpadBusy = false;
        s.channelsWechatIpadWaitInFlight = false;
        update();
      }
    },
    onWechatIpadLoginTypeChange: (loginType) => {
      const resolvedLoginType = resolveWechatIpadLoginType(loginType);
      s.channelsWechatIpadLoginTypeDraft = resolvedLoginType;
      if (!s.channelsWechatIpadLoginTypeConfirmOpen) {
        s.channelsWechatIpadLoginType = resolvedLoginType;
        applyWechatIpadLoginTypeToConfig(s, resolvedLoginType);
      }
      update();
    },
    onWechatIpadLoginTypeConfirmCancel: () => {
      if (s.channelsWechatIpadBusy) {
        return;
      }
      s.channelsWechatIpadLoginTypeConfirmOpen = false;
      s.channelsWechatIpadLoginTypeConfirmForce = false;
      s.channelsWechatIpadLoginTypeDraft = s.channelsWechatIpadLoginType;
      update();
    },
    onWechatIpadLoginTypeConfirmSubmit: async () => {
      if (!s.client || !s.connected || s.channelsWechatIpadBusy) {
        return;
      }

      const force = s.channelsWechatIpadLoginTypeConfirmForce;
      const loginType = resolveWechatIpadLoginType(s.channelsWechatIpadLoginTypeDraft);

      s.channelsWechatIpadLoginType = loginType;
      s.channelsWechatIpadLoginTypeDraft = loginType;
      applyWechatIpadLoginTypeToConfig(s, loginType);

      stopWechatIpadAutoPolling(s);
      s.channelsWechatIpadLoginTypeConfirmOpen = false;
      s.channelsWechatIpadLoginTypeConfirmForce = false;
      s.channelsWechatIpadBusy = true;
      s.channelsWechatIpadPhase = "loading_qr";
      s.channelsWechatIpadLoginConnected = null;
      s.channelsWechatIpadCountdownDeadlineMs = null;
      s.channelsWechatIpadCountdownSeconds = null;
      update();

      try {
        const res = await s.client.request<{
          message?: string;
          qrDataUrl?: string;
          data62?: string;
          expiredTime?: unknown;
        }>("web.login.start", {
          channel: "wechat-ipad",
          force,
          timeoutMs: 30000,
          accountId: "default",
          loginType,
        });

        s.channelsWechatIpadLoginMessage = res.message ?? null;
        s.channelsWechatIpadLoginQrDataUrl = res.qrDataUrl ?? null;
        s.channelsWechatIpadLoginConnected = null;
        s.channelsWechatIpadRequiresVerification = false;
        s.channelsWechatIpadTicket = null;
        s.channelsWechatIpadData62 = res.data62 ?? null;
        s.channelsWechatIpadVerificationCode = "";
        s.channelsWechatIpadPhase = res.qrDataUrl ? "qr_ready" : "loading_qr";

        primeWechatIpadCountdown(s, update, {
          message: res.message ?? null,
          expiredTime: res.expiredTime,
        });

        if (res.qrDataUrl) {
          scheduleWechatIpadAutoPoll(s, triggerWechatIpadAutoWait, 1500);
        }
      } catch (err) {
        s.channelsWechatIpadLoginMessage = toReadableError(err);
        s.channelsWechatIpadLoginQrDataUrl = null;
        s.channelsWechatIpadLoginConnected = null;
        s.channelsWechatIpadRequiresVerification = false;
        s.channelsWechatIpadPhase = "idle";
        s.channelsWechatIpadCountdownDeadlineMs = null;
        s.channelsWechatIpadCountdownSeconds = null;
        stopWechatIpadAutoPolling(s);
      } finally {
        s.channelsWechatIpadBusy = false;
        update();
      }
    },
    onWechatIpadVerificationCodeChange: (code) => {
      s.channelsWechatIpadVerificationCode = code;
      update();
    },
    onWechatIpadSubmitVerificationCode: async () => {
      if (
        !s.client ||
        !s.connected ||
        s.channelsWechatIpadVerificationBusy ||
        !s.channelsWechatIpadVerificationCode.trim()
      ) {
        return;
      }

      if (!s.channelsWechatIpadTicket) {
        s.channelsWechatIpadLoginMessage = "缺少 ticket，请先等待状态更新以获取安全校验信息。";
        update();
        return;
      }

      s.channelsWechatIpadVerificationBusy = true;
      update();

      try {
        const res = await s.client.request<{ ok?: boolean; message?: string }>(
          "wechat-ipad.login.submitVerificationCode",
          {
            code: s.channelsWechatIpadVerificationCode.trim(),
            ...(s.channelsWechatIpadTicket ? { ticket: s.channelsWechatIpadTicket } : {}),
            accountId: "default",
          },
        );

        s.channelsWechatIpadLoginMessage = res.message ?? "验证码已提交，请继续等待登录结果。";
        s.channelsWechatIpadVerificationCode = "";
        s.channelsWechatIpadRequiresVerification = false;
        s.channelsWechatIpadPhase = "scanned";

        if (s.channelsWechatIpadLoginQrDataUrl) {
          scheduleWechatIpadAutoPoll(s, triggerWechatIpadAutoWait, 1000);
        }
      } catch (err) {
        s.channelsWechatIpadLoginMessage = toReadableError(err);
        s.channelsWechatIpadRequiresVerification = true;
        s.channelsWechatIpadPhase = "verification";
        stopWechatIpadAutoPolling(s);
      } finally {
        s.channelsWechatIpadVerificationBusy = false;
        update();
      }
    },
  };
}
