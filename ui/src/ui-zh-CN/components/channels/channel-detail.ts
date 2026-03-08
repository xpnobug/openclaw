/**
 * 通道配置详情组件
 */
import { html, nothing } from "lit";
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
  onChannelConfigUpdate: (channelId: string, field: string, value: unknown) => void;
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
                ${fieldsBySection
                  .get(section.id)!
                  .map((field) =>
                    renderConfigField(
                      channel,
                      field,
                      resolveNestedValue(config, field.key),
                      props.onChannelConfigUpdate,
                    ),
                  )}
              </div>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function resolveWechatLoginStatusText(phase: ChannelDetailProps["wechatIpadPhase"]): string {
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

  const statusText = resolveWechatLoginStatusText(props.wechatIpadPhase);
  const connectedText =
    props.wechatIpadLoginConnected == null
      ? "未知"
      : props.wechatIpadLoginConnected
        ? "已连接"
        : "未连接";

  return html`
    <div class="channel-detail__wechat-login">
      <div class="channel-detail__wechat-login-head">
        <h4 class="channel-detail__section-title">扫码登录</h4>
        <div class="channel-detail__wechat-login-status">
          当前状态：${statusText}（连接：${connectedText}）
          ${
            props.wechatIpadAutoPolling
              ? html`
                  <span class="channel-detail__wechat-login-badge">状态轮询中</span>
                `
              : nothing
          }
          ${
            props.wechatIpadCountdownSeconds != null
              ? html`<span class="channel-detail__wechat-login-countdown">剩余 ${props.wechatIpadCountdownSeconds}s</span>`
              : nothing
          }
        </div>
      </div>
      <div class="channel-detail__wechat-login-actions">
        <button
          class="mc-btn mc-btn--primary"
          ?disabled=${props.wechatIpadBusy || props.wechatIpadLoginTypeConfirmOpen}
          @click=${() => props.onWechatIpadStart(false)}
        >
          开始扫码
        </button>
        <button
          class="mc-btn"
          ?disabled=${props.wechatIpadBusy || props.wechatIpadLoginTypeConfirmOpen}
          @click=${() => props.onWechatIpadStart(true)}
        >
          重新生成二维码
        </button>
        <button
          class="mc-btn"
          ?disabled=${props.wechatIpadBusy || props.wechatIpadLoginTypeConfirmOpen}
          @click=${props.onWechatIpadWait}
        >
          手动检查状态
        </button>
        <button
          class="mc-btn"
          ?disabled=${props.wechatIpadBusy || props.wechatIpadLoginTypeConfirmOpen}
          @click=${props.onWechatIpadLogout}
        >
          退出登录
        </button>
      </div>
      ${
        props.wechatIpadLoginTypeConfirmOpen
          ? html`
            <div class="channel-detail__wechat-login-type-confirm">
              <div class="channel-detail__wechat-login-type-confirm-title">选择登录设备类型</div>
              <div class="channel-detail__wechat-login-device-tabs">
                <button
                  class=${`mc-btn ${props.wechatIpadLoginTypeDraft === "ipad" ? "mc-btn--primary" : ""}`}
                  ?disabled=${props.wechatIpadBusy}
                  @click=${() => props.onWechatIpadLoginTypeChange("ipad")}
                >
                  iPad
                </button>
                <button
                  class=${`mc-btn ${props.wechatIpadLoginTypeDraft === "win" ? "mc-btn--primary" : ""}`}
                  ?disabled=${props.wechatIpadBusy}
                  @click=${() => props.onWechatIpadLoginTypeChange("win")}
                >
                  Windows
                </button>
                <button
                  class=${`mc-btn ${props.wechatIpadLoginTypeDraft === "mac" ? "mc-btn--primary" : ""}`}
                  ?disabled=${props.wechatIpadBusy}
                  @click=${() => props.onWechatIpadLoginTypeChange("mac")}
                >
                  Mac
                </button>
                <button
                  class=${`mc-btn ${props.wechatIpadLoginTypeDraft === "car" ? "mc-btn--primary" : ""}`}
                  ?disabled=${props.wechatIpadBusy}
                  @click=${() => props.onWechatIpadLoginTypeChange("car")}
                >
                  Car
                </button>
              </div>
              <div class="channel-detail__wechat-login-type-confirm-actions">
                <button
                  class="mc-btn"
                  ?disabled=${props.wechatIpadBusy}
                  @click=${props.onWechatIpadLoginTypeConfirmCancel}
                >
                  取消
                </button>
                <button
                  class="mc-btn mc-btn--primary"
                  ?disabled=${props.wechatIpadBusy}
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
        props.wechatIpadLoginMessage
          ? html`<div class="channel-detail__wechat-login-message">${props.wechatIpadLoginMessage}</div>`
          : nothing
      }
      ${
        props.wechatIpadLoginQrDataUrl
          ? html`
            <div class="channel-detail__wechat-login-qr-wrap">
              <img
                class="channel-detail__wechat-login-qr"
                src=${props.wechatIpadLoginQrDataUrl}
                alt="WeChat iPad 登录二维码"
              />
            </div>
          `
          : nothing
      }
      ${
        props.wechatIpadRequiresVerification
          ? html`
            <div class="channel-detail__wechat-verification">
              <div class="channel-detail__wechat-verification-title">安全验证</div>
              <div class="channel-detail__wechat-verification-desc">
                检测到二次验证，请输入验证码并提交。
                ${
                  props.wechatIpadTicket
                    ? html`<span class="channel-detail__wechat-verification-ticket">ticket: ${props.wechatIpadTicket}</span>`
                    : nothing
                }
                ${
                  props.wechatIpadData62
                    ? html`<span class="channel-detail__wechat-verification-ticket">data62: ${props.wechatIpadData62}</span>`
                    : nothing
                }
              </div>
              <input
                class="mc-input"
                type="text"
                placeholder="请输入验证码"
                .value=${props.wechatIpadVerificationCode}
                ?disabled=${props.wechatIpadVerificationBusy}
                @input=${(event: Event) =>
                  props.onWechatIpadVerificationCodeChange(
                    (event.target as HTMLInputElement).value,
                  )}
              />
              <button
                class="mc-btn mc-btn--primary"
                ?disabled=${props.wechatIpadVerificationBusy || !props.wechatIpadVerificationCode.trim()}
                @click=${props.onWechatIpadSubmitVerificationCode}
              >
                提交验证码
              </button>
            </div>
          `
          : nothing
      }
    </div>
  `;
}
