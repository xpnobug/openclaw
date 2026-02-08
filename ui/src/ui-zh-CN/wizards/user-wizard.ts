/**
 * 用户添加向导
 */
import { html, nothing, type TemplateResult } from "lit";
import type { WizardStep, WizardState, WizardBaseProps } from "./types.js";
import {
  createWizardState,
  updateData,
  nextStep,
  prevStep,
  renderStepIndicator,
  renderWizardFooter,
  renderField,
} from "./wizard-base.js";

/** 用户配置数据 */
export type UserData = {
  id: string;
  channel: string;
  role: string;
  permissions: string[];
  rateLimit?: number;
};

/** 用户向导 Props */
export type UserWizardProps = WizardBaseProps<UserData> & {
  availableChannels?: Array<{ id: string; name: string }>;
};

/** 向导步骤 */
const STEPS: WizardStep[] = [
  { id: "identity", title: "用户身份", description: "ID、来源通道" },
  { id: "role", title: "角色权限", description: "管理员/普通用户" },
  { id: "limits", title: "使用限制", description: "速率、配额", optional: true },
  { id: "confirm", title: "确认添加" },
];

/** 角色预设 */
const ROLE_PRESETS = [
  { id: "owner", label: "所有者", description: "完全控制权限", icon: "👑", permissions: ["*"] },
  {
    id: "admin",
    label: "管理员",
    description: "管理配置和用户",
    icon: "🔧",
    permissions: ["config.*", "users.*"],
  },
  {
    id: "user",
    label: "普通用户",
    description: "基本使用权限",
    icon: "👤",
    permissions: ["chat", "tools.safe"],
  },
  {
    id: "guest",
    label: "访客",
    description: "只读权限",
    icon: "👁️",
    permissions: ["chat.readonly"],
  },
];

/** 渲染身份步骤 */
function renderIdentityStep(
  state: WizardState<UserData>,
  onChange: (field: string, value: unknown) => void,
  channels: Array<{ id: string; name: string }>,
): TemplateResult {
  return html`
    <div class="wizard__form">
      ${renderField({
        label: "用户 ID",
        required: true,
        hint: "通道中的用户标识，如 Telegram 用户 ID",
        content: html`
          <input
            type="text"
            class="wizard__input"
            .value=${state.data.id ?? ""}
            @input=${(e: Event) => onChange("id", (e.target as HTMLInputElement).value)}
            placeholder="123456789"
          />
        `,
      })}
      
      ${renderField({
        label: "来源通道",
        required: true,
        content: html`
          <select
            class="wizard__select"
            .value=${state.data.channel ?? ""}
            @change=${(e: Event) => onChange("channel", (e.target as HTMLSelectElement).value)}
          >
            <option value="">请选择通道</option>
            ${channels.map(
              (ch) => html`
              <option value=${ch.id} ?selected=${state.data.channel === ch.id}>${ch.name}</option>
            `,
            )}
          </select>
        `,
      })}
    </div>
  `;
}

/** 渲染角色步骤 */
function renderRoleStep(
  state: WizardState<UserData>,
  onSelect: (role: string, permissions: string[]) => void,
): TemplateResult {
  return html`
    <div class="wizard__role-grid">
      ${ROLE_PRESETS.map(
        (role) => html`
        <button
          class="wizard__role-card ${state.data.role === role.id ? "wizard__role-card--selected" : ""}"
          @click=${() => onSelect(role.id, role.permissions)}
        >
          <span class="wizard__role-icon">${role.icon}</span>
          <span class="wizard__role-label">${role.label}</span>
          <span class="wizard__role-desc">${role.description}</span>
        </button>
      `,
      )}
    </div>
  `;
}

/** 渲染限制步骤 */
function renderLimitsStep(
  state: WizardState<UserData>,
  onChange: (field: string, value: unknown) => void,
): TemplateResult {
  return html`
    <div class="wizard__form">
      ${renderField({
        label: "速率限制 (消息/分钟)",
        hint: "0 表示不限制，留空使用默认值",
        content: html`
          <input
            type="number"
            class="wizard__input"
            min="0"
            .value=${String(state.data.rateLimit ?? "")}
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              onChange("rateLimit", v ? parseInt(v) : undefined);
            }}
            placeholder="默认"
          />
        `,
      })}
    </div>
  `;
}

/** 渲染确认步骤 */
function renderConfirmStep(state: WizardState<UserData>): TemplateResult {
  const role = ROLE_PRESETS.find((r) => r.id === state.data.role);

  return html`
    <div class="wizard__review">
      <div class="wizard__review-header">
        <span class="wizard__review-emoji">${role?.icon ?? "👤"}</span>
        <div>
          <div class="wizard__review-name">${state.data.id || "未设置"}</div>
          <div class="wizard__review-id">${role?.label ?? state.data.role}</div>
        </div>
      </div>
      
      <div class="wizard__review-section">
        <div class="wizard__review-label">来源通道</div>
        <div class="wizard__review-value">${state.data.channel || "-"}</div>
      </div>
      
      <div class="wizard__review-section">
        <div class="wizard__review-label">权限</div>
        <div class="wizard__review-value">
          ${state.data.permissions?.join(", ") || "-"}
        </div>
      </div>
      
      ${
        state.data.rateLimit !== undefined
          ? html`
        <div class="wizard__review-section">
          <div class="wizard__review-label">速率限制</div>
          <div class="wizard__review-value">${state.data.rateLimit} 消息/分钟</div>
        </div>
      `
          : nothing
      }
    </div>
  `;
}

/** 用户向导组件 */
export class UserWizard {
  private state: WizardState<UserData>;
  private props: UserWizardProps;

  constructor(props: UserWizardProps) {
    this.props = props;
    this.state = createWizardState(props.initialData);
  }

  /** 更新字段 */
  updateField(field: string, value: unknown): void {
    this.state = updateData(this.state, field, value);
  }

  /** 选择角色 */
  selectRole(role: string, permissions: string[]): void {
    this.state = updateData(this.state, "role", role);
    this.state = updateData(this.state, "permissions", permissions);
  }

  /** 验证当前步骤 */
  validateCurrentStep(): boolean {
    const step = STEPS[this.state.currentStep];
    if (step.id === "identity") {
      return !!(this.state.data.id && this.state.data.channel);
    }
    if (step.id === "role") {
      return !!this.state.data.role;
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
    this.props.onComplete(this.state.data as UserData);
  }

  /** 渲染 */
  render(): TemplateResult {
    const step = STEPS[this.state.currentStep];
    const channels = this.props.availableChannels ?? [
      { id: "telegram", name: "Telegram" },
      { id: "discord", name: "Discord" },
      { id: "wechat", name: "微信" },
    ];

    let content: TemplateResult;
    switch (step.id) {
      case "identity":
        content = renderIdentityStep(this.state, (f, v) => this.updateField(f, v), channels);
        break;
      case "role":
        content = renderRoleStep(this.state, (r, p) => this.selectRole(r, p));
        break;
      case "limits":
        content = renderLimitsStep(this.state, (f, v) => this.updateField(f, v));
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
          <h2 class="wizard__title">添加用户</h2>
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
