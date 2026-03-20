/**
 * Agent 创建向导
 */
import { html, type TemplateResult } from "lit";
import { AGENT_TEMPLATES, AGENT_CATEGORIES, type AgentTemplate } from "../templates/index.js";
import { validator } from "../validators/index.js";
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

/** Agent 配置数据 */
export type AgentData = {
  id: string;
  displayName: string;
  emoji: string;
  model: string;
  systemPrompt: string;
  temperature: number;
};

/** Agent 向导 Props */
export type AgentWizardProps = WizardBaseProps<AgentData> & {
  existingIds?: string[];
  availableModels?: string[];
};

/** 向导步骤 */
const STEPS: WizardStep[] = [
  { id: "template", title: "选择模板", description: "从模板开始或从零创建" },
  { id: "basic", title: "基本信息", description: "名称、描述、头像" },
  { id: "model", title: "选择模型", description: "AI 模型和参数" },
  { id: "persona", title: "人设定义", description: "性格、语气、角色" },
  { id: "review", title: "确认创建", description: "预览并保存" },
];

/** 默认模型列表 */
const DEFAULT_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "gpt-4o",
  "gpt-4o-mini",
  "gemini-2.0-flash",
];

/** 常用 Emoji */
const EMOJI_OPTIONS = ["🤖", "👨‍💻", "📊", "✍️", "💬", "🎯", "🔧", "📚", "🎨", "🌐"];

/** 渲染模板选择 */
function renderTemplateStep(
  state: WizardState<AgentData>,
  onSelect: (template: AgentTemplate | null) => void,
  selectedCategory: string,
  onCategoryChange: (cat: string) => void,
): TemplateResult {
  const templates =
    selectedCategory === "all"
      ? AGENT_TEMPLATES
      : AGENT_TEMPLATES.filter((t) => t.category === selectedCategory);

  return html`
    <div class="wizard__template-step">
      <div class="wizard__categories">
        <button
          class="wizard__category ${selectedCategory === "all" ? "wizard__category--active" : ""}"
          @click=${() => onCategoryChange("all")}
        >全部</button>
        ${AGENT_CATEGORIES.map(
          (cat) => html`
          <button
            class="wizard__category ${selectedCategory === cat.id ? "wizard__category--active" : ""}"
            @click=${() => onCategoryChange(cat.id)}
          >${cat.icon} ${cat.label}</button>
        `,
        )}
      </div>
      
      <div class="wizard__templates">
        <button class="wizard__template-card wizard__template-card--blank" @click=${() => onSelect(null)}>
          <span class="wizard__template-icon">➕</span>
          <span class="wizard__template-name">从零开始</span>
          <span class="wizard__template-desc">自定义所有配置</span>
        </button>
        ${templates.map(
          (t) => html`
          <button class="wizard__template-card" @click=${() => onSelect(t)}>
            <span class="wizard__template-icon">${t.icon}</span>
            <span class="wizard__template-name">${t.name}</span>
            <span class="wizard__template-desc">${t.description}</span>
          </button>
        `,
        )}
      </div>
    </div>
  `;
}

/** 渲染基本信息步骤 */
function renderBasicStep(
  state: WizardState<AgentData>,
  onChange: (field: string, value: unknown) => void,
  errors: Record<string, string[]>,
): TemplateResult {
  return html`
    <div class="wizard__form">
      ${renderField({
        label: "Agent ID",
        required: true,
        error: errors.id?.[0],
        hint: "唯一标识，只能包含小写字母、数字和连字符",
        content: html`
          <input
            type="text"
            class="wizard__input"
            .value=${state.data.id ?? ""}
            @input=${(e: Event) => onChange("id", (e.target as HTMLInputElement).value)}
            placeholder="my-agent"
          />
        `,
      })}
      
      ${renderField({
        label: "显示名称",
        hint: "用户看到的名称",
        content: html`
          <input
            type="text"
            class="wizard__input"
            .value=${state.data.displayName ?? ""}
            @input=${(e: Event) => onChange("displayName", (e.target as HTMLInputElement).value)}
            placeholder="我的助手"
          />
        `,
      })}
      
      ${renderField({
        label: "头像 Emoji",
        content: html`
          <div class="wizard__emoji-picker">
            ${EMOJI_OPTIONS.map(
              (emoji) => html`
              <button
                type="button"
                class="wizard__emoji ${state.data.emoji === emoji ? "wizard__emoji--selected" : ""}"
                @click=${() => onChange("emoji", emoji)}
              >${emoji}</button>
            `,
            )}
          </div>
        `,
      })}
    </div>
  `;
}

/** 渲染模型选择步骤 */
function renderModelStep(
  state: WizardState<AgentData>,
  onChange: (field: string, value: unknown) => void,
  availableModels: string[],
): TemplateResult {
  const models = availableModels.length > 0 ? availableModels : DEFAULT_MODELS;

  return html`
    <div class="wizard__form">
      ${renderField({
        label: "AI 模型",
        required: true,
        content: html`
          <select
            class="wizard__select"
            .value=${state.data.model ?? ""}
            @change=${(e: Event) => onChange("model", (e.target as HTMLSelectElement).value)}
          >
            <option value="">请选择模型</option>
            ${models.map((m) => html`<option value=${m} ?selected=${state.data.model === m}>${m}</option>`)}
          </select>
        `,
      })}
      
      ${renderField({
        label: "Temperature",
        hint: "控制回复的随机性，0 最确定，1 最随机",
        content: html`
          <div class="wizard__slider-group">
            <input
              type="range"
              class="wizard__slider"
              min="0"
              max="1"
              step="0.1"
              .value=${String(state.data.temperature ?? 0.7)}
              @input=${(e: Event) => onChange("temperature", parseFloat((e.target as HTMLInputElement).value))}
            />
            <span class="wizard__slider-value">${state.data.temperature ?? 0.7}</span>
          </div>
        `,
      })}
    </div>
  `;
}

/** 渲染人设步骤 */
function renderPersonaStep(
  state: WizardState<AgentData>,
  onChange: (field: string, value: unknown) => void,
): TemplateResult {
  return html`
    <div class="wizard__form">
      ${renderField({
        label: "系统提示词",
        hint: "定义 Agent 的角色、能力和行为方式",
        content: html`
          <textarea
            class="wizard__textarea"
            rows="12"
            .value=${state.data.systemPrompt ?? ""}
            @input=${(e: Event) => onChange("systemPrompt", (e.target as HTMLTextAreaElement).value)}
            placeholder="你是一个..."
          ></textarea>
        `,
      })}
    </div>
  `;
}

/** 渲染预览步骤 */
function renderReviewStep(state: WizardState<AgentData>): TemplateResult {
  const { data } = state;
  return html`
    <div class="wizard__review">
      <div class="wizard__review-header">
        <span class="wizard__review-emoji">${data.emoji ?? "🤖"}</span>
        <div>
          <div class="wizard__review-name">${data.displayName || data.id || "未命名"}</div>
          <div class="wizard__review-id">${data.id || "-"}</div>
        </div>
      </div>
      
      <div class="wizard__review-section">
        <div class="wizard__review-label">模型</div>
        <div class="wizard__review-value">${data.model || "-"}</div>
      </div>
      
      <div class="wizard__review-section">
        <div class="wizard__review-label">Temperature</div>
        <div class="wizard__review-value">${data.temperature ?? 0.7}</div>
      </div>
      
      <div class="wizard__review-section">
        <div class="wizard__review-label">系统提示词</div>
        <div class="wizard__review-value wizard__review-value--pre">${data.systemPrompt || "-"}</div>
      </div>
    </div>
  `;
}

/** Agent 向导组件 */
export class AgentWizard {
  private state: WizardState<AgentData>;
  private props: AgentWizardProps;
  private selectedCategory = "all";

  constructor(props: AgentWizardProps) {
    this.props = props;
    this.state = createWizardState(props.initialData);
  }

  /** 选择模板 */
  selectTemplate(template: AgentTemplate | null): void {
    if (template) {
      this.state = {
        ...this.state,
        data: {
          emoji: template.icon,
          displayName: template.config.displayName as string,
          model: template.config.model as string,
          systemPrompt: template.config.systemPrompt as string,
          temperature: (template.config.temperature as number) ?? 0.7,
        },
      };
    }
    this.state = nextStep(this.state, STEPS.length);
  }

  /** 更新字段 */
  updateField(field: string, value: unknown): void {
    this.state = updateData(this.state, field, value);
  }

  /** 验证当前步骤 */
  validateCurrentStep(): boolean {
    const step = STEPS[this.state.currentStep];
    if (step.id === "basic") {
      const result = validator.validateAgent(
        this.state.data as Record<string, unknown>,
        this.props.existingIds,
      );
      this.state = { ...this.state, errors: {} };
      if (!result.valid) {
        const errors: Record<string, string[]> = {};
        result.errors.forEach((e) => {
          if (!errors[e.path]) {
            errors[e.path] = [];
          }
          errors[e.path].push(e.message);
        });
        this.state = { ...this.state, errors };
        return false;
      }
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
    if (this.validateCurrentStep()) {
      this.props.onComplete(this.state.data as AgentData);
    }
  }

  /** 渲染 */
  render(): TemplateResult {
    const step = STEPS[this.state.currentStep];

    let content: TemplateResult;
    switch (step.id) {
      case "template":
        content = renderTemplateStep(
          this.state,
          (t) => this.selectTemplate(t),
          this.selectedCategory,
          (cat) => {
            this.selectedCategory = cat;
          },
        );
        break;
      case "basic":
        content = renderBasicStep(this.state, (f, v) => this.updateField(f, v), this.state.errors);
        break;
      case "model":
        content = renderModelStep(
          this.state,
          (f, v) => this.updateField(f, v),
          this.props.availableModels ?? [],
        );
        break;
      case "persona":
        content = renderPersonaStep(this.state, (f, v) => this.updateField(f, v));
        break;
      case "review":
        content = renderReviewStep(this.state);
        break;
      default:
        content = html``;
    }

    return html`
      <div class="wizard">
        <div class="wizard__header">
          <h2 class="wizard__title">创建 Agent</h2>
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
        })}
      </div>
    `;
  }
}
