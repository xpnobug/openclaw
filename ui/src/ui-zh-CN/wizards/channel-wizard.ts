/**
 * 通道配置向导
 */
import { html, nothing, type TemplateResult } from "lit";
import type { WizardStep, WizardState, WizardBaseProps } from "./types.js";
import {
  CHANNEL_TEMPLATES,
  getChannelTemplates,
  type ChannelTemplate,
} from "../templates/index.js";
import {
  createWizardState,
  updateData,
  nextStep,
  prevStep,
  renderStepIndicator,
  renderWizardFooter,
  renderField,
} from "./wizard-base.js";

/** 通道配置数据 */
export type ChannelData = {
  type: string;
  credentials: Record<string, string>;
  options: Record<string, unknown>;
};

/** 通道向导 Props */
export type ChannelWizardProps = WizardBaseProps<ChannelData> & {
  availableChannels?: string[];
};

/** 向导步骤 */
const STEPS: WizardStep[] = [
  { id: "select", title: "选择通道", description: "Telegram、Discord、微信..." },
  { id: "credentials", title: "填写凭据", description: "Token、API Key 等" },
  { id: "options", title: "高级选项", description: "消息格式、权限等", optional: true },
  { id: "confirm", title: "完成配置" },
];

/** 通道类型定义 */
const CHANNEL_TYPES = [
  {
    id: "telegram",
    name: "Telegram",
    icon: "📱",
    docLink: "https://docs.openclaw.ai/channels/telegram",
  },
  {
    id: "discord",
    name: "Discord",
    icon: "🎮",
    docLink: "https://docs.openclaw.ai/channels/discord",
  },
  { id: "wechat", name: "微信", icon: "💬", docLink: "https://docs.openclaw.ai/channels/wechat" },
  { id: "slack", name: "Slack", icon: "💼", docLink: "https://docs.openclaw.ai/channels/slack" },
  { id: "signal", name: "Signal", icon: "🔒", docLink: "https://docs.openclaw.ai/channels/signal" },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "📞",
    docLink: "https://docs.openclaw.ai/channels/whatsapp",
  },
];

/** 凭据字段定义 */
type CredentialField = {
  key: string;
  label: string;
  type: "text" | "password";
  required: boolean;
  placeholder?: string;
  helpText?: string;
};

const CHANNEL_CREDENTIALS: Record<string, CredentialField[]> = {
  telegram: [
    {
      key: "botToken",
      label: "Bot Token",
      type: "password",
      required: true,
      placeholder: "123456:ABC-DEF...",
      helpText: "从 @BotFather 获取",
    },
  ],
  discord: [
    { key: "botToken", label: "Bot Token", type: "password", required: true },
    { key: "applicationId", label: "Application ID", type: "text", required: true },
  ],
  wechat: [
    { key: "appId", label: "AppID", type: "text", required: true },
    { key: "appSecret", label: "AppSecret", type: "password", required: true },
  ],
  slack: [
    {
      key: "botToken",
      label: "Bot Token",
      type: "password",
      required: true,
      placeholder: "xoxb-...",
    },
    {
      key: "appToken",
      label: "App Token",
      type: "password",
      required: true,
      placeholder: "xapp-...",
    },
  ],
  signal: [
    { key: "phoneNumber", label: "手机号", type: "text", required: true, placeholder: "+86..." },
  ],
  whatsapp: [
    { key: "phoneNumberId", label: "Phone Number ID", type: "text", required: true },
    { key: "accessToken", label: "Access Token", type: "password", required: true },
  ],
};

/** 渲染通道选择 */
function renderSelectStep(
  state: WizardState<ChannelData>,
  onSelect: (type: string) => void,
  availableChannels?: string[],
): TemplateResult {
  const channels = availableChannels?.length
    ? CHANNEL_TYPES.filter((c) => availableChannels.includes(c.id))
    : CHANNEL_TYPES;

  return html`
    <div class="wizard__channel-grid">
      ${channels.map(
        (ch) => html`
        <button
          class="wizard__channel-card ${state.data.type === ch.id ? "wizard__channel-card--selected" : ""}"
          @click=${() => onSelect(ch.id)}
        >
          <span class="wizard__channel-icon">${ch.icon}</span>
          <span class="wizard__channel-name">${ch.name}</span>
        </button>
      `,
      )}
    </div>
    
    ${
      state.data.type
        ? html`
      <div class="wizard__templates-section">
        <h4>推荐配置</h4>
        <div class="wizard__template-list">
          ${getChannelTemplates(state.data.type).map(
            (t) => html`
            <div class="wizard__template-item">
              <strong>${t.name}</strong>
              <span>${t.description}</span>
            </div>
          `,
          )}
        </div>
      </div>
    `
        : nothing
    }
  `;
}

/** 渲染凭据填写 */
function renderCredentialsStep(
  state: WizardState<ChannelData>,
  onChange: (key: string, value: string) => void,
): TemplateResult {
  const fields = CHANNEL_CREDENTIALS[state.data.type ?? ""] ?? [];
  const channelInfo = CHANNEL_TYPES.find((c) => c.id === state.data.type);

  return html`
    <div class="wizard__form">
      ${
        channelInfo
          ? html`
        <div class="wizard__doc-link">
          <a href=${channelInfo.docLink} target="_blank">📖 查看 ${channelInfo.name} 配置文档</a>
        </div>
      `
          : nothing
      }
      
      ${fields.map((field) =>
        renderField({
          label: field.label,
          required: field.required,
          hint: field.helpText,
          content: html`
          <input
            type=${field.type}
            class="wizard__input"
            .value=${state.data.credentials?.[field.key] ?? ""}
            @input=${(e: Event) => onChange(field.key, (e.target as HTMLInputElement).value)}
            placeholder=${field.placeholder ?? ""}
          />
        `,
        }),
      )}
    </div>
  `;
}

/** 渲染高级选项 */
function renderOptionsStep(
  state: WizardState<ChannelData>,
  onChange: (key: string, value: unknown) => void,
): TemplateResult {
  return html`
    <div class="wizard__form">
      ${renderField({
        label: "速率限制 (消息/分钟)",
        hint: "0 表示不限制",
        content: html`
          <input
            type="number"
            class="wizard__input"
            min="0"
            .value=${String(state.data.options?.rateLimit ?? 30)}
            @input=${(e: Event) => onChange("rateLimit", parseInt((e.target as HTMLInputElement).value) || 0)}
          />
        `,
      })}
    </div>
  `;
}

/** 渲染确认步骤 */
function renderConfirmStep(state: WizardState<ChannelData>): TemplateResult {
  const channelInfo = CHANNEL_TYPES.find((c) => c.id === state.data.type);
  const credentials = state.data.credentials ?? {};

  return html`
    <div class="wizard__review">
      <div class="wizard__review-header">
        <span class="wizard__review-emoji">${channelInfo?.icon ?? "📡"}</span>
        <div>
          <div class="wizard__review-name">${channelInfo?.name ?? state.data.type}</div>
        </div>
      </div>
      
      <div class="wizard__review-section">
        <div class="wizard__review-label">凭据</div>
        <div class="wizard__review-value">
          ${Object.keys(credentials).length} 个字段已填写
        </div>
      </div>
      
      <div class="wizard__review-section">
        <div class="wizard__review-label">速率限制</div>
        <div class="wizard__review-value">
          ${state.data.options?.rateLimit ?? 30} 消息/分钟
        </div>
      </div>
    </div>
  `;
}

/** 通道向导组件 */
export class ChannelWizard {
  private state: WizardState<ChannelData>;
  private props: ChannelWizardProps;

  constructor(props: ChannelWizardProps) {
    this.props = props;
    this.state = createWizardState({
      credentials: {},
      options: { rateLimit: 30 },
      ...props.initialData,
    });
  }

  /** 选择通道类型 */
  selectType(type: string): void {
    this.state = updateData(this.state, "type", type);
  }

  /** 更新凭据 */
  updateCredential(key: string, value: string): void {
    const credentials = { ...this.state.data.credentials, [key]: value };
    this.state = updateData(this.state, "credentials", credentials);
  }

  /** 更新选项 */
  updateOption(key: string, value: unknown): void {
    const options = { ...this.state.data.options, [key]: value };
    this.state = updateData(this.state, "options", options);
  }

  /** 验证当前步骤 */
  validateCurrentStep(): boolean {
    const step = STEPS[this.state.currentStep];
    if (step.id === "select" && !this.state.data.type) {
      return false;
    }
    if (step.id === "credentials") {
      const fields = CHANNEL_CREDENTIALS[this.state.data.type ?? ""] ?? [];
      const credentials = this.state.data.credentials ?? {};
      return fields.filter((f) => f.required).every((f) => credentials[f.key]);
    }
    return true;
  }

  /** 下一步 */
  next(): void {
    if (this.validateCurrentStep()) {
      this.state = nextStep(this.state, STEPS.length);
    }
  }

  /** 上一步 */
  prev(): void {
    this.state = prevStep(this.state);
  }

  /** 完成 */
  complete(): void {
    this.props.onComplete(this.state.data as ChannelData);
  }

  /** 渲染 */
  render(): TemplateResult {
    const step = STEPS[this.state.currentStep];

    let content: TemplateResult;
    switch (step.id) {
      case "select":
        content = renderSelectStep(
          this.state,
          (t) => this.selectType(t),
          this.props.availableChannels,
        );
        break;
      case "credentials":
        content = renderCredentialsStep(this.state, (k, v) => this.updateCredential(k, v));
        break;
      case "options":
        content = renderOptionsStep(this.state, (k, v) => this.updateOption(k, v));
        break;
      case "confirm":
        content = renderConfirmStep(this.state);
        break;
      default:
        content = html``;
    }

    return html`
      <div class="wizard">
        <div class="wizard__header">
          <h2 class="wizard__title">配置通道</h2>
        </div>
        ${renderStepIndicator(STEPS, this.state.currentStep)}
        <div class="wizard__content">${content}</div>
        ${renderWizardFooter({
          currentStep: this.state.currentStep,
          totalSteps: STEPS.length,
          onPrev: () => this.prev(),
          onNext: () => this.next(),
          onCancel: () => this.props.onCancel(),
          onComplete: () => this.complete(),
          canProceed: this.validateCurrentStep(),
        })}
      </div>
    `;
  }
}
