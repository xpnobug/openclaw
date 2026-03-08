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
};

/**
 * 渲染通道配置详情
 */
const WECHAT_IPAD_ACCOUNT_SCOPED_FIELDS = new Set([
  "name",
  "baseUrl",
  "robotId",
  "wxid",
  "loginType",
  "dmPolicy",
  "groupPolicy",
  "allowFrom",
  "commandAllowFrom",
  "requireMention",
  "safetyPrefix",
]);

function isWechatIpadAccountScopedField(fieldKey: string): boolean {
  return WECHAT_IPAD_ACCOUNT_SCOPED_FIELDS.has(fieldKey) || fieldKey.startsWith("inbound.");
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
  const accountValue = resolveNestedValue(
    config,
    resolveWechatIpadConfigFieldPath(fieldKey, accountId),
  );
  return accountValue === undefined ? resolveNestedValue(config, fieldKey) : accountValue;
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
      ? (props.wechatIpadSelectedAccountId ?? props.wechatIpadAccountOrder[0] ?? "default")
      : null;

  // 按 section 分组字段
  const fieldsBySection = new Map<string, ChannelConfigField[]>();
  for (const field of channel.configFields) {
    const section = field.section ?? "basic";
    if (!fieldsBySection.has(section)) {
      fieldsBySection.set(section, []);
    }
    fieldsBySection.get(section)!.push(field);
  }

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
        ${renderWechatIpadLoginSection(channel.id, props)}
        ${CONFIG_SECTIONS.filter((section: { id: string; label: string }) =>
          fieldsBySection.has(section.id),
        ).map(
          (section: { id: string; label: string }) => html`
            <div class="channel-detail__section">
              <h4 class="channel-detail__section-title">${section.label}</h4>
              <div class="channel-detail__fields">
                ${fieldsBySection.get(section.id)!.map((field) => {
                  const actualFieldKey =
                    channel.id === "wechat-ipad"
                      ? resolveWechatIpadConfigFieldPath(field.key, wechatIpadCurrentAccountId)
                      : field.key;
                  const actualField =
                    actualFieldKey === field.key ? field : { ...field, key: actualFieldKey };
                  const value =
                    channel.id === "wechat-ipad"
                      ? resolveWechatIpadConfigFieldValue(
                          config,
                          field.key,
                          wechatIpadCurrentAccountId,
                        )
                      : resolveNestedValue(config, field.key);
                  return renderConfigField(
                    channel,
                    actualField,
                    value,
                    props.onChannelConfigUpdate,
                  );
                })}
              </div>
            </div>
          `,
        )}
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
    props.wechatIpadSelectedAccountId ?? props.wechatIpadAccountOrder[0] ?? "default";
  const channelConfig = (props.channelsConfig["wechat-ipad"] ?? {}) as Record<string, unknown>;
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
  const accountWxid = resolveWechatIpadConfigFieldValue(channelConfig, "wxid", currentAccountId);
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
                ${props.wechatIpadAccountOrder.map(
                  (accountId) => html`
                    <button
                      class=${`mc-btn ${props.wechatIpadSelectedAccountId === accountId ? "mc-btn--primary" : ""}`}
                      @click=${() => props.onWechatIpadAccountSelect(accountId)}
                    >
                      ${accountId}
                    </button>
                  `,
                )}
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
          ?disabled=${currentState.busy || currentState.loginTypeConfirmOpen}
          @click=${() => props.onWechatIpadStart(false)}
        >
          ${startButtonText}
        </button>
        <button
          class="mc-btn"
          ?disabled=${currentState.busy || currentState.loginTypeConfirmOpen}
          @click=${() => props.onWechatIpadStart(true)}
        >
          重新生成二维码
        </button>
        <button
          class="mc-btn"
          ?disabled=${currentState.busy || currentState.loginTypeConfirmOpen}
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
          ?disabled=${currentState.busy || currentState.loginTypeConfirmOpen}
          @click=${props.onWechatIpadLogout}
        >
          退出登录
        </button>
      </div>
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
    </div>
  `;
}
