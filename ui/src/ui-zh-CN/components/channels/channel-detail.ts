/**
 * 通道配置详情组件
 */
import { html, nothing } from "lit";
import type { WechatIpadAccountUiState, WechatIpadUiLoginPhase } from "../../controllers/state.js";
import type {
  ChannelConfigField,
  ChannelMeta,
  ChannelsConfigData,
} from "../../types/channel-config.js";
import { CONFIG_SECTIONS } from "../../types/channel-fields.js";
import { renderConfigField, resolveNestedValue } from "./channel-field-renderer.js";
import { getChannelIcon, icons } from "./channel-icons.js";
import { CHANNEL_METADATA } from "./channel-metadata.js";

export type ChannelDetailProps = {
  channelsConfig: ChannelsConfigData;
  selectedChannel: string | null;
  wechatIpadSelectedAccountId: string | null;
  wechatIpadAccountOrder: string[];
  wechatIpadStateByAccount: Record<string, WechatIpadAccountUiState>;
  wechatIpadCurrentState: WechatIpadAccountUiState;
  wechatIpadCurrentPhase: WechatIpadUiLoginPhase;
  onChannelConfigUpdate: (channelId: string, field: string, value: unknown) => void;
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
 * 渲染通道配置详情
 */
const WECHAT_IPAD_ACCOUNT_SCOPED_FIELDS = new Set([
  "name",
  "baseUrl",
  "apiToken",
  "tokenFile",
  "robotId",
  "wxid",
  "loginType",
  "dmPolicy",
  "groupPolicy",
  "allowFrom",
  "commandAllowFrom",
  "requireMention",
  "safetyPrefix",
  "longTextThreshold",
  "longTextTitle",
  "messageRetentionDays",
]);

function isWechatIpadAccountScopedField(fieldKey: string): boolean {
  return (
    WECHAT_IPAD_ACCOUNT_SCOPED_FIELDS.has(fieldKey) ||
    fieldKey.startsWith("inbound.") ||
    fieldKey.startsWith("markdown.")
  );
}

function resolveWechatIpadConfigFieldPath(fieldKey: string, accountId: string | null): string {
  if (!accountId || !isWechatIpadAccountScopedField(fieldKey)) {
    return fieldKey;
  }
  return `accounts.${accountId}.${fieldKey}`;
}

function resolveWechatIpadConfigFieldValue(
  config: Record<string, unknown>,
  fieldKey: string,
  accountId: string | null,
): unknown {
  if (!accountId || !isWechatIpadAccountScopedField(fieldKey)) {
    return resolveNestedValue(config, fieldKey);
  }
  return resolveNestedValue(config, resolveWechatIpadConfigFieldPath(fieldKey, accountId));
}

function hasWechatIpadAccountConfig(
  config: Record<string, unknown>,
  accountId: string | null,
): boolean {
  if (!accountId) {
    return false;
  }
  const accounts = config.accounts;
  return Boolean(accounts && typeof accounts === "object" && accountId in accounts);
}

function renderChannelConfigSections(params: {
  channel: ChannelMeta;
  config: Record<string, unknown>;
  fields: ChannelConfigField[];
  accountId: string | null;
  titleBySectionId?: Record<string, string>;
  onChannelConfigUpdate: (channelId: string, field: string, value: unknown) => void;
}) {
  const { channel, config, fields, accountId, titleBySectionId, onChannelConfigUpdate } = params;
  const fieldsBySection = new Map<string, ChannelConfigField[]>();
  for (const field of fields) {
    const section = field.section ?? "basic";
    if (!fieldsBySection.has(section)) {
      fieldsBySection.set(section, []);
    }
    fieldsBySection.get(section)!.push(field);
  }

  return CONFIG_SECTIONS.filter((section: { id: string; label: string }) =>
    fieldsBySection.has(section.id),
  ).map(
    (section: { id: string; label: string }) => html`
      <div class="channel-detail__section">
        <h4 class="channel-detail__section-title">${titleBySectionId?.[section.id] ?? section.label}</h4>
        <div class="channel-detail__fields">
          ${fieldsBySection.get(section.id)!.map((field) => {
            const actualFieldKey =
              channel.id === "wechat-ipad"
                ? resolveWechatIpadConfigFieldPath(field.key, accountId)
                : field.key;
            const actualField =
              actualFieldKey === field.key ? field : { ...field, key: actualFieldKey };
            const value =
              channel.id === "wechat-ipad"
                ? resolveWechatIpadConfigFieldValue(config, field.key, accountId)
                : resolveNestedValue(config, field.key);
            return renderConfigField(channel, actualField, value, onChannelConfigUpdate);
          })}
        </div>
      </div>
    `,
  );
}

export function renderChannelDetail(props: ChannelDetailProps) {
  if (!props.selectedChannel) {
    return html`
      <div class="channel-detail__empty">
        <div class="channel-detail__empty-icon">${icons.channel}</div>
        <div class="channel-detail__empty-text">选择一个通道查看配置</div>
      </div>
    `;
  }

  const channel = CHANNEL_METADATA.find((item: ChannelMeta) => item.id === props.selectedChannel);
  if (!channel) {
    return nothing;
  }

  const config = (props.channelsConfig[channel.id] ?? {}) as Record<string, unknown>;
  const wechatIpadCurrentAccountId =
    channel.id === "wechat-ipad"
      ? (props.wechatIpadSelectedAccountId ?? props.wechatIpadAccountOrder[0] ?? "main")
      : null;
  const wechatIpadHasRealAccount =
    channel.id === "wechat-ipad"
      ? hasWechatIpadAccountConfig(config, wechatIpadCurrentAccountId)
      : false;
  const topLevelFields =
    channel.id === "wechat-ipad"
      ? channel.configFields.filter((field) => !isWechatIpadAccountScopedField(field.key))
      : channel.configFields;
  const accountFields =
    channel.id === "wechat-ipad"
      ? channel.configFields.filter((field) => isWechatIpadAccountScopedField(field.key))
      : [];

  return html`
    <div class="channel-detail">
      <div class="channel-detail__header">
        <div class="channel-detail__icon">${getChannelIcon(channel.icon)}</div>
        <div class="channel-detail__titles">
          <h3 class="channel-detail__title">${channel.label}</h3>
          <p class="channel-detail__desc">${channel.description}</p>
        </div>
        ${
          channel.docsUrl
            ? html`
              <a
                class="channel-detail__docs"
                href=${channel.docsUrl}
                target="_blank"
                rel="noreferrer"
                title="查看文档"
              >
                ${icons.externalLink}
              </a>
            `
            : nothing
        }
      </div>

      <div class="channel-detail__body">
        ${renderChannelConfigSections({
          channel,
          config,
          fields: topLevelFields,
          accountId: null,
          titleBySectionId: channel.id === "wechat-ipad" ? { basic: "通道级设置" } : undefined,
          onChannelConfigUpdate: props.onChannelConfigUpdate,
        })}
        ${renderWechatIpadLoginSection(channel.id, props)}
        ${
          channel.id === "wechat-ipad" && wechatIpadCurrentAccountId
            ? html`
                ${
                  !wechatIpadHasRealAccount
                    ? html`
                        <div class="channel-detail__section">
                          <h4 class="channel-detail__section-title">当前账户</h4>
                          <div class="channel-detail__empty">
                            <div class="channel-detail__empty-icon">${icons.channel}</div>
                            <div class="channel-detail__empty-text">
                              当前还没有已保存的 wechat-ipad 账户配置，已为你自动准备账户 ${wechatIpadCurrentAccountId}。
                              直接填写下面字段即可创建并保存该账户。
                            </div>
                          </div>
                        </div>
                      `
                    : nothing
                }
                ${renderChannelConfigSections({
                  channel,
                  config,
                  fields: accountFields,
                  accountId: wechatIpadCurrentAccountId,
                  titleBySectionId: {
                    api: "当前账户 API 配置",
                    polling: "当前账户入站配置",
                    access: "当前账户访问控制",
                    messaging: "当前账户消息发送",
                  },
                  onChannelConfigUpdate: props.onChannelConfigUpdate,
                })}
              `
            : channel.id !== "wechat-ipad"
              ? nothing
              : nothing
        }
      </div>
    </div>
  `;
}

function resolveWechatLoginStatusText(phase: WechatIpadUiLoginPhase): string {
  switch (phase) {
    case "loading_qr":
      return "等待二维码生成";
    case "qr_ready":
      return "等待扫码";
    case "scanned":
      return "已扫码，等待手机确认";
    case "verification":
      return "需要安全验证";
    case "connected":
      return "已连接";
    case "expired":
      return "二维码已失效";
    default:
      return "未开始";
  }
}

function renderWechatIpadLoginSection(channelId: string, props: ChannelDetailProps) {
  if (channelId !== "wechat-ipad") {
    return nothing;
  }

  const currentState = props.wechatIpadCurrentState;
  const statusText = resolveWechatLoginStatusText(props.wechatIpadCurrentPhase);
  const connectedText =
    currentState.loginConnected == null
      ? "未知"
      : currentState.loginConnected
        ? "已连接"
        : "未连接";
  const currentAccountId =
    props.wechatIpadSelectedAccountId ?? props.wechatIpadAccountOrder[0] ?? "main";
  const channelConfig = (props.channelsConfig["wechat-ipad"] ?? {}) as Record<string, unknown>;
  const hasRealAccount = hasWechatIpadAccountConfig(channelConfig, currentAccountId);
  const accountBaseUrl = resolveWechatIpadConfigFieldValue(
    channelConfig,
    "baseUrl",
    currentAccountId,
  );
  const accountRobotId = resolveWechatIpadConfigFieldValue(
    channelConfig,
    "robotId",
    currentAccountId,
  );
  const accountWxid =
    props.wechatIpadCurrentState.runtimeWxid ??
    resolveWechatIpadConfigFieldValue(channelConfig, "wxid", currentAccountId);
  const accountLoginType = resolveWechatIpadConfigFieldValue(
    channelConfig,
    "loginType",
    currentAccountId,
  );
  const lastWaitText =
    currentState.lastWaitAtMs != null
      ? new Date(currentState.lastWaitAtMs).toLocaleTimeString()
      : null;
  const startButtonText = currentState.busy
    ? currentState.phase === "loading_qr"
      ? "正在获取二维码..."
      : "处理中..."
    : "开始扫码";
  const waitButtonText = currentState.waitInFlight ? "正在检查状态..." : "手动检查状态";
  const verificationButtonText = currentState.verificationBusy ? "正在提交验证码..." : "提交验证码";

  return html`
    <div class="channel-detail__wechat-login">
      ${
        props.wechatIpadAccountOrder.length > 0
          ? html`
              <div class="channel-detail__wechat-login-device-tabs">
                ${props.wechatIpadAccountOrder.map((accountId) => {
                  const accountState = props.wechatIpadStateByAccount[accountId];
                  const isConnected = accountState?.loginConnected === true;
                  const phase = accountState?.phase ?? "idle";
                  const isSelected = props.wechatIpadSelectedAccountId === accountId;
                  const channelConfig = (props.channelsConfig["wechat-ipad"] ?? {}) as Record<
                    string,
                    unknown
                  >;
                  const accounts = (channelConfig.accounts ?? {}) as Record<
                    string,
                    Record<string, unknown>
                  >;
                  const accountName =
                    typeof accounts[accountId]?.name === "string" ? accounts[accountId].name : "";
                  const displayLabel = accountName || accountId;
                  const statusClass = isConnected
                    ? "status--connected"
                    : phase === "expired"
                      ? "status--expired"
                      : "";
                  return html`
                    <button
                      class=${`mc-btn ${isSelected ? "mc-btn--primary" : ""} wechat-account-tab`}
                      @click=${() => props.onWechatIpadAccountSelect(accountId)}
                    >
                      <span class="wechat-account-tab__dot ${statusClass}"></span>
                      <span class="wechat-account-tab__label">${displayLabel}</span>
                      ${
                        props.wechatIpadAccountOrder.length > 1
                          ? html`<span
                            class="wechat-account-tab__delete"
                            @click=${(e: Event) => {
                              e.stopPropagation();
                              props.onWechatIpadAccountDeleteRequest(accountId);
                            }}
                          >✕</span>`
                          : nothing
                      }
                    </button>
                  `;
                })}
                <button
                  class="mc-btn wechat-account-tab wechat-account-tab--add"
                  @click=${() => props.onWechatIpadAccountAdd()}
                >＋</button>
              </div>
            `
          : nothing
      }
      <div class="channel-detail__wechat-login-head">
        <h4 class="channel-detail__section-title">扫码登录</h4>
        <div class="channel-detail__wechat-login-status">
          当前状态：${statusText}（连接：${connectedText}）
          ${
            currentState.autoPolling
              ? html`
                  <span class="channel-detail__wechat-login-badge">状态轮询中</span>
                `
              : nothing
          }
          ${
            currentState.countdownSeconds != null
              ? html`<span class="channel-detail__wechat-login-countdown">剩余 ${currentState.countdownSeconds}s</span>`
              : nothing
          }
        </div>
      </div>
      <div class="channel-detail__wechat-login-summary">
        <div class="channel-detail__wechat-login-summary-row">
          <span class="channel-detail__wechat-login-summary-label">当前账户</span>
          <span class="channel-detail__wechat-login-summary-value">${currentAccountId}</span>
        </div>
        <div class="channel-detail__wechat-login-summary-row">
          <span class="channel-detail__wechat-login-summary-label">设备类型</span>
          <span class="channel-detail__wechat-login-summary-value">${
            typeof (accountLoginType ?? currentState.loginType) === "string"
              ? (accountLoginType ?? currentState.loginType)
              : "未配置"
          }</span>
        </div>
        <div class="channel-detail__wechat-login-summary-row">
          <span class="channel-detail__wechat-login-summary-label">桥接地址</span>
          <span class="channel-detail__wechat-login-summary-value">${typeof accountBaseUrl === "string" ? accountBaseUrl : "未配置"}</span>
        </div>
        <div class="channel-detail__wechat-login-summary-row">
          <span class="channel-detail__wechat-login-summary-label">机器人 ID</span>
          <span class="channel-detail__wechat-login-summary-value">${
            typeof accountRobotId === "string" || typeof accountRobotId === "number"
              ? accountRobotId
              : "未配置"
          }</span>
        </div>
        <div class="channel-detail__wechat-login-summary-row">
          <span class="channel-detail__wechat-login-summary-label">wxid</span>
          <span class="channel-detail__wechat-login-summary-value">${typeof accountWxid === "string" ? accountWxid : "未登录"}</span>
        </div>
        ${
          lastWaitText
            ? html`
                <div class="channel-detail__wechat-login-summary-row">
                  <span class="channel-detail__wechat-login-summary-label">最近检查</span>
                  <span class="channel-detail__wechat-login-summary-value">${lastWaitText}</span>
                </div>
              `
            : nothing
        }
      </div>
      <div class="channel-detail__wechat-login-actions">
        <button
          class="mc-btn mc-btn--primary"
          ?disabled=${!hasRealAccount || currentState.busy || currentState.loginTypeConfirmOpen}
          @click=${() => props.onWechatIpadStart(false)}
        >
          ${startButtonText}
        </button>
        <button
          class="mc-btn"
          ?disabled=${!hasRealAccount || currentState.busy || currentState.loginTypeConfirmOpen}
          @click=${() => props.onWechatIpadStart(true)}
        >
          重新生成二维码
        </button>
        <button
          class="mc-btn"
          ?disabled=${!hasRealAccount || currentState.busy || currentState.loginTypeConfirmOpen}
          @click=${props.onWechatIpadWait}
        >
          ${waitButtonText}
        </button>
        ${
          currentState.phase === "expired"
            ? html`
                <button
                  class="mc-btn mc-btn--primary"
                  ?disabled=${currentState.busy || currentState.loginTypeConfirmOpen}
                  @click=${() => props.onWechatIpadStart(true)}
                >
                  二维码已过期，重新生成
                </button>
              `
            : nothing
        }
        <button
          class="mc-btn"
          ?disabled=${!hasRealAccount || currentState.busy || currentState.loginTypeConfirmOpen}
          @click=${props.onWechatIpadLogout}
        >
          退出登录
        </button>
      </div>
      ${
        !hasRealAccount
          ? html`
              <div class="channel-detail__wechat-login-message">
                先填写并保存当前账户的桥接地址、Token、机器人 ID 等字段，当前账户创建后即可扫码登录。
              </div>
            `
          : nothing
      }
      ${
        currentState.loginTypeConfirmOpen
          ? html`
            <div class="channel-detail__wechat-login-type-confirm">
              <div class="channel-detail__wechat-login-type-confirm-title">选择登录设备类型</div>
              <div class="channel-detail__wechat-login-device-tabs">
                <button
                  class=${`mc-btn ${currentState.loginTypeDraft === "ipad" ? "mc-btn--primary" : ""}`}
                  ?disabled=${currentState.busy}
                  @click=${() => props.onWechatIpadLoginTypeChange("ipad")}
                >
                  iPad
                </button>
                <button
                  class=${`mc-btn ${currentState.loginTypeDraft === "win" ? "mc-btn--primary" : ""}`}
                  ?disabled=${currentState.busy}
                  @click=${() => props.onWechatIpadLoginTypeChange("win")}
                >
                  Windows
                </button>
                <button
                  class=${`mc-btn ${currentState.loginTypeDraft === "mac" ? "mc-btn--primary" : ""}`}
                  ?disabled=${currentState.busy}
                  @click=${() => props.onWechatIpadLoginTypeChange("mac")}
                >
                  Mac
                </button>
                <button
                  class=${`mc-btn ${currentState.loginTypeDraft === "car" ? "mc-btn--primary" : ""}`}
                  ?disabled=${currentState.busy}
                  @click=${() => props.onWechatIpadLoginTypeChange("car")}
                >
                  Car
                </button>
              </div>
              <div class="channel-detail__wechat-login-type-confirm-actions">
                <button
                  class="mc-btn"
                  ?disabled=${currentState.busy}
                  @click=${props.onWechatIpadLoginTypeConfirmCancel}
                >
                  取消
                </button>
                <button
                  class="mc-btn mc-btn--primary"
                  ?disabled=${currentState.busy}
                  @click=${props.onWechatIpadLoginTypeConfirmSubmit}
                >
                  确认并获取二维码
                </button>
              </div>
            </div>
          `
          : nothing
      }
      ${
        currentState.loginMessage
          ? html`<div class="channel-detail__wechat-login-message">${currentState.loginMessage}</div>`
          : nothing
      }
      ${
        currentState.loginQrDataUrl
          ? html`
            <div class="channel-detail__wechat-login-qr-wrap">
              <img
                class="channel-detail__wechat-login-qr"
                src=${currentState.loginQrDataUrl}
                alt="WeChat iPad 登录二维码"
              />
            </div>
          `
          : nothing
      }
      ${
        currentState.requiresVerification
          ? html`
            <div class="channel-detail__wechat-verification">
              <div class="channel-detail__wechat-verification-title">安全验证</div>
              <div class="channel-detail__wechat-verification-desc">
                检测到二次验证，请输入验证码并提交。
                ${
                  currentState.ticket
                    ? html`<span class="channel-detail__wechat-verification-ticket">ticket: ${currentState.ticket}</span>`
                    : nothing
                }
                ${
                  currentState.data62
                    ? html`<span class="channel-detail__wechat-verification-ticket">data62: ${currentState.data62}</span>`
                    : nothing
                }
              </div>
              <input
                class="mc-input"
                type="text"
                placeholder="请输入验证码"
                .value=${currentState.verificationCode}
                ?disabled=${currentState.verificationBusy}
                @input=${(event: Event) =>
                  props.onWechatIpadVerificationCodeChange(
                    (event.target as HTMLInputElement).value,
                  )}
              />
              <button
                class="mc-btn mc-btn--primary"
                ?disabled=${currentState.verificationBusy || !currentState.verificationCode.trim()}
                @click=${props.onWechatIpadSubmitVerificationCode}
              >
                ${verificationButtonText}
              </button>
            </div>
          `
          : nothing
      }
      ${
        props.wechatIpadAddAccountOpen
          ? html`
              <div class="channel-detail__modal-overlay">
                <div class="channel-detail__modal">
                  <h4>添加新账号</h4>
                  <p class="channel-detail__modal-hint">请输入账号 ID（英文字母、数字、连字符）</p>
                  <input
                    class="mc-input"
                    type="text"
                    placeholder="例如：work、personal"
                    .value=${props.wechatIpadAddAccountDraft}
                    @input=${(e: Event) =>
                      props.onWechatIpadAccountAddDraftChange((e.target as HTMLInputElement).value)}
                  />
                  <div class="channel-detail__modal-actions">
                    <button class="mc-btn" @click=${props.onWechatIpadAccountAddCancel}>取消</button>
                    <button
                      class="mc-btn mc-btn--primary"
                      ?disabled=${!props.wechatIpadAddAccountDraft.trim()}
                      @click=${props.onWechatIpadAccountAddConfirm}
                    >确认添加</button>
                  </div>
                </div>
              </div>
            `
          : nothing
      }
      ${
        props.wechatIpadDeleteConfirmId
          ? html`
              <div class="channel-detail__modal-overlay">
                <div class="channel-detail__modal">
                  <h4>确认删除账号</h4>
                  <p>确定要删除账号 <strong>${props.wechatIpadDeleteConfirmId}</strong> 吗？该操作将移除该账号的所有配置。</p>
                  <div class="channel-detail__modal-actions">
                    <button class="mc-btn" @click=${props.onWechatIpadAccountDeleteCancel}>取消</button>
                    <button
                      class="mc-btn mc-btn--danger"
                      @click=${props.onWechatIpadAccountDeleteConfirm}
                    >确认删除</button>
                  </div>
                </div>
              </div>
            `
          : nothing
      }
    </div>
  `;
}
