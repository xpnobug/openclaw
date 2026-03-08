/**
 * 通道配置内容组件
 * 右侧面板 - 消息通道详细配置
 */
import { html } from "lit";
import type { ChannelsConfigData } from "../types/channel-config.js";
import { icons, renderChannelList, renderChannelDetail } from "./channels";

// 重新导出元数据供外部使用
export { CHANNEL_METADATA } from "./channels";

export type ChannelsContentProps = {
  channelsConfig: ChannelsConfigData;
  selectedChannel: string | null;
  wechatIpadLoginMessage: string | null;
  wechatIpadLoginQrDataUrl: string | null;
  wechatIpadLoginConnected: boolean | null;
  wechatIpadBusy: boolean;
  wechatIpadLoginType: "ipad" | "win" | "mac" | "car";
  wechatIpadLoginTypeConfirmOpen: boolean;
  wechatIpadLoginTypeDraft: "ipad" | "win" | "mac" | "car";
  wechatIpadLoginTypeConfirmForce: boolean;
  wechatIpadPhase:
    | "idle"
    | "loading_qr"
    | "qr_ready"
    | "scanned"
    | "verification"
    | "connected"
    | "expired";
  wechatIpadCountdownSeconds: number | null;
  wechatIpadCountdownDeadlineMs: number | null;
  wechatIpadLastWaitAtMs: number | null;
  wechatIpadAutoPolling: boolean;
  wechatIpadRequiresVerification: boolean;
  wechatIpadTicket: string | null;
  wechatIpadData62: string | null;
  wechatIpadVerificationCode: string;
  wechatIpadVerificationBusy: boolean;
  onChannelSelect: (channelId: string) => void;
  onChannelConfigUpdate: (channelId: string, field: string, value: unknown) => void;
  onNavigateToChannels: () => void;
  onWechatIpadStart: (force: boolean) => void;
  onWechatIpadWait: () => void;
  onWechatIpadLogout: () => void;
  onWechatIpadLoginTypeChange: (loginType: "ipad" | "win" | "mac" | "car") => void;
  onWechatIpadLoginTypeConfirmCancel: () => void;
  onWechatIpadLoginTypeConfirmSubmit: () => void;
  onWechatIpadVerificationCodeChange: (code: string) => void;
  onWechatIpadSubmitVerificationCode: () => void;
};

/**
 * 渲染通道配置内容
 */
export function renderChannelsContent(props: ChannelsContentProps) {
  return html`
    <div class="config-content config-content--channels">
      <div class="config-content__header">
        <div class="config-content__icon">${icons.channel}</div>
        <div class="config-content__titles">
          <h2 class="config-content__title">通道配置</h2>
          <p class="config-content__desc">配置消息通道（Telegram、Discord、WhatsApp 等）</p>
        </div>
        <button class="mc-btn" @click=${props.onNavigateToChannels}>
          ${icons.externalLink}
          <span>通道管理</span>
        </button>
      </div>

      <div class="channels-layout">
        <div class="channels-layout__sidebar">
          ${renderChannelList({
            channelsConfig: props.channelsConfig,
            selectedChannel: props.selectedChannel,
            onChannelSelect: props.onChannelSelect,
          })}
        </div>
        <div class="channels-layout__content">
          ${renderChannelDetail({
            channelsConfig: props.channelsConfig,
            selectedChannel: props.selectedChannel,
            wechatIpadLoginMessage: props.wechatIpadLoginMessage,
            wechatIpadLoginQrDataUrl: props.wechatIpadLoginQrDataUrl,
            wechatIpadLoginConnected: props.wechatIpadLoginConnected,
            wechatIpadBusy: props.wechatIpadBusy,
            wechatIpadLoginType: props.wechatIpadLoginType,
            wechatIpadLoginTypeConfirmOpen: props.wechatIpadLoginTypeConfirmOpen,
            wechatIpadLoginTypeDraft: props.wechatIpadLoginTypeDraft,
            wechatIpadLoginTypeConfirmForce: props.wechatIpadLoginTypeConfirmForce,
            wechatIpadPhase: props.wechatIpadPhase,
            wechatIpadCountdownSeconds: props.wechatIpadCountdownSeconds,
            wechatIpadCountdownDeadlineMs: props.wechatIpadCountdownDeadlineMs,
            wechatIpadLastWaitAtMs: props.wechatIpadLastWaitAtMs,
            wechatIpadAutoPolling: props.wechatIpadAutoPolling,
            wechatIpadRequiresVerification: props.wechatIpadRequiresVerification,
            wechatIpadTicket: props.wechatIpadTicket,
            wechatIpadData62: props.wechatIpadData62,
            wechatIpadVerificationCode: props.wechatIpadVerificationCode,
            wechatIpadVerificationBusy: props.wechatIpadVerificationBusy,
            onChannelConfigUpdate: props.onChannelConfigUpdate,
            onWechatIpadStart: props.onWechatIpadStart,
            onWechatIpadWait: props.onWechatIpadWait,
            onWechatIpadLogout: props.onWechatIpadLogout,
            onWechatIpadLoginTypeChange: props.onWechatIpadLoginTypeChange,
            onWechatIpadLoginTypeConfirmCancel: props.onWechatIpadLoginTypeConfirmCancel,
            onWechatIpadLoginTypeConfirmSubmit: props.onWechatIpadLoginTypeConfirmSubmit,
            onWechatIpadVerificationCodeChange: props.onWechatIpadVerificationCodeChange,
            onWechatIpadSubmitVerificationCode: props.onWechatIpadSubmitVerificationCode,
          })}
        </div>
      </div>
    </div>
  `;
}
