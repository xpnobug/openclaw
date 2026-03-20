/**
 * 通道配置内容组件
 * 右侧面板 - 消息通道详细配置
 */
import { html } from "lit";
import type { WechatIpadAccountUiState, WechatIpadUiLoginPhase } from "../controllers/state.js";
import type { ChannelsConfigData } from "../types/channel-config.js";
import { renderChannelList, renderChannelDetail } from "./channels/index.js";

// 重新导出元数据供外部使用
export { CHANNEL_METADATA } from "./channels/index.js";

export type ChannelsContentProps = {
  channelsConfig: ChannelsConfigData;
  selectedChannel: string | null;
  wechatIpadSelectedAccountId: string | null;
  wechatIpadAccountOrder: string[];
  wechatIpadStateByAccount: Record<string, WechatIpadAccountUiState>;
  wechatIpadCurrentState: WechatIpadAccountUiState;
  wechatIpadCurrentPhase: WechatIpadUiLoginPhase;
  onChannelSelect: (channelId: string) => void;
  onChannelConfigUpdate: (channelId: string, field: string, value: unknown) => void;
  onNavigateToChannels: () => void;
  onWechatIpadAccountSelect: (accountId: string) => void;
  onWechatIpadStart: (force: boolean) => void;
  onWechatIpadWait: () => void;
  onWechatIpadLogout: () => void;
  onWechatIpadLoginTypeChange: (loginType: "ipad" | "win" | "mac" | "car") => void;
  onWechatIpadLoginTypeConfirmCancel: () => void;
  onWechatIpadLoginTypeConfirmSubmit: () => void;
  onWechatIpadVerificationCodeChange: (code: string) => void;
  onWechatIpadSubmitVerificationCode: () => void;
  // 多账号管理
  onWechatIpadAccountAdd: () => void;
  onWechatIpadAccountAddDraftChange: (value: string) => void;
  onWechatIpadAccountAddConfirm: () => void;
  onWechatIpadAccountAddCancel: () => void;
  onWechatIpadAccountDeleteRequest: (accountId: string) => void;
  onWechatIpadAccountDeleteConfirm: () => void;
  onWechatIpadAccountDeleteCancel: () => void;
  wechatIpadAddAccountOpen: boolean;
  wechatIpadAddAccountDraft: string;
  wechatIpadDeleteConfirmId: string | null;
};

/**
 * 渲染通道配置内容
 */
export function renderChannelsContent(props: ChannelsContentProps) {
  return html`
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
            wechatIpadSelectedAccountId: props.wechatIpadSelectedAccountId,
            wechatIpadAccountOrder: props.wechatIpadAccountOrder,
            wechatIpadStateByAccount: props.wechatIpadStateByAccount,
            wechatIpadCurrentState: props.wechatIpadCurrentState,
            wechatIpadCurrentPhase: props.wechatIpadCurrentPhase,
            onChannelConfigUpdate: props.onChannelConfigUpdate,
            onWechatIpadAccountSelect: props.onWechatIpadAccountSelect,
            onWechatIpadStart: props.onWechatIpadStart,
            onWechatIpadWait: props.onWechatIpadWait,
            onWechatIpadLogout: props.onWechatIpadLogout,
            onWechatIpadLoginTypeChange: props.onWechatIpadLoginTypeChange,
            onWechatIpadLoginTypeConfirmCancel: props.onWechatIpadLoginTypeConfirmCancel,
            onWechatIpadLoginTypeConfirmSubmit: props.onWechatIpadLoginTypeConfirmSubmit,
            onWechatIpadVerificationCodeChange: props.onWechatIpadVerificationCodeChange,
            onWechatIpadSubmitVerificationCode: props.onWechatIpadSubmitVerificationCode,
            onWechatIpadAccountAdd: props.onWechatIpadAccountAdd,
            onWechatIpadAccountAddDraftChange: props.onWechatIpadAccountAddDraftChange,
            onWechatIpadAccountAddConfirm: props.onWechatIpadAccountAddConfirm,
            onWechatIpadAccountAddCancel: props.onWechatIpadAccountAddCancel,
            onWechatIpadAccountDeleteRequest: props.onWechatIpadAccountDeleteRequest,
            onWechatIpadAccountDeleteConfirm: props.onWechatIpadAccountDeleteConfirm,
            onWechatIpadAccountDeleteCancel: props.onWechatIpadAccountDeleteCancel,
            wechatIpadAddAccountOpen: props.wechatIpadAddAccountOpen,
            wechatIpadAddAccountDraft: props.wechatIpadAddAccountDraft,
            wechatIpadDeleteConfirmId: props.wechatIpadDeleteConfirmId,
          })}
        </div>
      </div>
    </div>
  `;
}
