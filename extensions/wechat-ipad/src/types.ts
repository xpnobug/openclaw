import type { MarkdownConfig } from "openclaw/plugin-sdk";

export type WechatIpadInboundMode = "polling" | "webhook";

export type WechatIpadPolicy = "pairing" | "allowlist" | "open" | "disabled";

export type WechatIpadPollingConfig = {
  intervalMs?: number;
  lookbackSeconds?: number;
  maxPagesPerPoll?: number;
  pollAllContacts?: boolean;
  pollContactIds?: string[];
};

export type WechatIpadInboundConfig = {
  mode?: WechatIpadInboundMode;
  polling?: WechatIpadPollingConfig;
};

export type WechatIpadAccountConfig = {
  name?: string;
  enabled?: boolean;
  markdown?: MarkdownConfig;
  baseUrl?: string;
  apiToken?: string;
  tokenFile?: string;
  robotId?: string;
  wxid?: string;
  loginType?: WechatIpadLoginType;
  inbound?: WechatIpadInboundConfig;
  dmPolicy?: WechatIpadPolicy;
  groupPolicy?: WechatIpadPolicy;
  allowFrom?: string[];
  commandAllowFrom?: string[];
  requireMention?: boolean;
  safetyPrefix?: string;
};

export type WechatIpadConfig = {
  accounts?: Record<string, WechatIpadAccountConfig>;
  defaultAccount?: string;
} & WechatIpadAccountConfig;

export type WechatIpadTokenSource = "env" | "config" | "configFile" | "none";

export type ResolvedWechatIpadAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  baseUrl: string;
  apiToken: string;
  tokenSource: WechatIpadTokenSource;
  robotId: string;
  inbound: {
    mode: WechatIpadInboundMode;
    polling: Required<WechatIpadPollingConfig>;
  };
  config: WechatIpadAccountConfig;
};

export type WechatIpadApiCallOptions = {
  baseUrl: string;
  apiToken: string;
  robotId: string;
  timeoutMs?: number;
};

// 登录方式：默认 iPad，也可切换 Win/Mac/Car 设备二维码
export type WechatIpadLoginType = "ipad" | "win" | "mac" | "car";

export type WechatIpadLoginQrRequest = {
  loginType?: WechatIpadLoginType;
  deviceId?: string;
  deviceName?: string;
};

export type WechatIpadLoginQrResponse = {
  uuid: string;
  qrDataUrl?: string;
  qrUrl?: string;
  message?: string;
  deviceId?: string;
  data62?: string;
  expiredTime?: string;
};

export type WechatIpadLoginCheckResponse = {
  connected: boolean;
  status?: number;
  wxid?: string;
  nickname?: string;
  ticket?: string;
  expiredTime?: number;
  requiresVerification?: boolean;
  raw?: unknown;
};

export type WechatIpadVerificationCodeRequest = {
  uuid: string;
  data62: string;
  code: string;
  ticket: string;
};

export type WechatIpadVerificationCodeResponse = {
  success: boolean;
  message: string;
};

export type WechatIpadLoginSession = {
  uuid: string;
  accountId: string;
  startedAt: number;
  expiresAt?: number;
  deviceId?: string;
  data62?: string;
  ticket?: string;
  loginType: WechatIpadLoginType;
  wxid?: string;
  nickname?: string;
  connectedAt?: number;
};

export type WechatIpadInboundMessage = {
  id: string;
  msgId?: string;
  from: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  chatType: "direct" | "group";
  body: string;
  timestamp: number;
  isAtMe: boolean;
  isFromSelf?: boolean;
};

export type WechatIpadProbeResult = {
  ok: boolean;
  elapsedMs: number;
  message?: string;
  details?: Record<string, unknown>;
};
