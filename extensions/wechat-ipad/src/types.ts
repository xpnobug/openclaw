import type { MarkdownConfig } from "openclaw/plugin-sdk/wechat-ipad";

export type WechatIpadInboundMode = "polling" | "webhook";

export type WechatIpadPolicy = "pairing" | "allowlist" | "open" | "disabled";

export type WechatIpadPollingConfig = {
  intervalMs?: number;
  lookbackSeconds?: number;
  maxPagesPerPoll?: number;
  pollAllContacts?: boolean;
  pollContactIds?: string[];
};

export type WechatIpadWebhookAuthMode = "header" | "query" | "none";

export type WechatIpadWebhookConfig = {
  /** webhook 路由路径，支持 {wxid} 占位符。默认 /api/v1/wechat-client/{wxid}/sync-message */
  path?: string;
  secret?: string;
  authMode?: WechatIpadWebhookAuthMode;
  maxBodyBytes?: number;
  dedupeWindowMs?: number;
  rateLimitPerMinute?: number;
};

export type WechatIpadInboundConfig = {
  mode?: WechatIpadInboundMode;
  polling?: WechatIpadPollingConfig;
  webhook?: WechatIpadWebhookConfig;
};

export type WechatIpadBotProfile = {
  nickname: string;
  headImgUrl: string;
  fetchedAt: number;
};

export type WechatIpadContactInfo = {
  wxid: string;
  nickname: string; // 微信昵称
  remark: string; // 好友备注名
  alias: string; // 微信号
  fetchedAt: number; // 缓存时间戳
};

export type WechatIpadAccountConfig = {
  name?: string;
  enabled?: boolean;
  markdown?: MarkdownConfig;
  longTextThreshold?: number;
  longTextTitle?: string;
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
  /** 消息保留天数，0 表示永久保留，默认 0 */
  messageRetentionDays?: number;
};

export type WechatIpadConfig = {
  enabled?: boolean;
  defaultAccount?: string;
  accounts?: Record<string, WechatIpadAccountConfig>;
};

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
    webhook: Required<WechatIpadWebhookConfig>;
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

export type WechatIpadInboundContentType =
  | "text"
  | "image"
  | "voice"
  | "video"
  | "file"
  | "link"
  | "quote"
  | "card"
  | "emoji"
  | "location"
  | "verify"
  | "system"
  | "status"
  | "unknown";

export type WechatIpadQuotedMessage = {
  currentBody: string;
  quotedBody?: string;
  quotedSender?: string;
  quotedSenderWxid?: string;
  quotedChatId?: string;
  quotedMessageId?: string;
  quotedMessageIdFull?: string;
  quotedMessageType?: number;
  quotedMessageSequenceId?: string;
  quotedMessageMsgSource?: string;
  rawXml: string;
};

export type WechatIpadLinkCard = {
  title: string;
  url: string;
  desc?: string;
  thumbUrl?: string;
};

export type WechatIpadEmojiData = {
  md5: string;
  totalLen: number;
};

export type WechatIpadCdnForward = {
  type: "image" | "video" | "file";
  /** 原始 CDN XML 内容 */
  content: string;
};

export type WechatIpadChannelData = {
  linkCard?: WechatIpadLinkCard;
  emoji?: WechatIpadEmojiData;
  cdnForward?: WechatIpadCdnForward;
};

export type WechatIpadInboundMessage = {
  id: string;
  msgId?: string;
  msgIdFull?: string;
  msgSeq?: string;
  rawMsgSource?: string;
  from: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  chatType: "direct" | "group";
  body: string;
  timestamp: number;
  isAtMe: boolean;
  isFromSelf?: boolean;
  messageType?: number;
  appMessageType?: number;
  contentType?: WechatIpadInboundContentType;
  rawContent?: string;
  quotedMessage?: WechatIpadQuotedMessage | null;
};

export type WechatIpadProbeResult = {
  ok: boolean;
  elapsedMs: number;
  message?: string;
  details?: Record<string, unknown>;
};
