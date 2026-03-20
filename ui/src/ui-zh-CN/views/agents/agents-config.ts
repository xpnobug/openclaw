/**
 * Agent 配置页面视图 - 主入口
 * Agent configuration page view - Main entry
 */
import { html, nothing } from "lit";
import {
  renderAgentSidebar,
  renderAgentHeader,
  renderAgentTabs,
} from "../../components/agent/index.js";
import { AGENT_TEMPLATES, AGENT_CATEGORIES } from "../../templates/index.js";
import type { GlobalPanel } from "../../types/agents-config.js";
import { LABELS } from "../../types/agents-config.js";
import type { AgentData } from "../../wizards/agent-wizard.js";
import { renderStepIndicator, renderWizardFooter, renderField } from "../../wizards/wizard-base.js";
import { renderActivePanel, renderGlobalPanel } from "./panel-renderer.js";
import type { AgentsConfigProps } from "./types.js";

// 扩展 AgentData 类型，添加 workspace
type WizardAgentData = AgentData & { workspace?: string };

// 向导状态（模块级别）
let wizardState = {
  step: 0,
  data: {} as Partial<WizardAgentData>,
  selectedCategory: "all",
  errors: {} as Record<string, string[]>,
  saving: false,
  saveError: null as string | null,
};

const WIZARD_STEPS = [
  { id: "template", title: "选择模板" },
  { id: "basic", title: "基本信息" },
  { id: "model", title: "选择模型" },
  { id: "persona", title: "人设定义" },
  { id: "review", title: "确认创建" },
];

const EMOJI_OPTIONS = ["🤖", "👨‍💻", "📊", "✍️", "💬", "🎯", "🔧", "📚", "🎨", "🌐"];
const DEFAULT_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "gpt-4o",
  "gpt-4o-mini",
];

/**
 * 重置向导状态
 */
function resetWizardState() {
  wizardState = {
    step: 0,
    data: {},
    selectedCategory: "all",
    errors: {},
    saving: false,
    saveError: null,
  };
}

/**
 * 渲染 Agent 创建向导
 */
function renderAgentWizard(props: AgentsConfigProps) {
  const { step, data, selectedCategory, errors } = wizardState;
  const existingIds = new Set((props.agentsList?.agents ?? []).map((a: { id: string }) => a.id));
  const models = props.agentAvailableModels?.map((m: { id: string }) => m.id) ?? DEFAULT_MODELS;

  const updateAndRefresh = () => {
    // 触发 Lit 重新渲染
    props.onAgentWizardComplete?.({
      ...data,
      _refresh: true,
    } as AgentsConfigProps["onAgentWizardComplete"] extends (data: infer T) => void ? T : never);
  };

  const setStep = (s: number) => {
    wizardState.step = s;
    updateAndRefresh();
  };
  const setData = (field: string, value: unknown) => {
    wizardState.data = { ...wizardState.data, [field]: value };
    updateAndRefresh();
  };
  const setCategory = (cat: string) => {
    wizardState.selectedCategory = cat;
    updateAndRefresh();
  };

  const validateBasic = () => {
    const errs: Record<string, string[]> = {};
    if (!data.id) {
      errs.id = ["Agent ID 是必填项"];
    } else if (!/^[a-z][a-z0-9-]*$/.test(data.id)) {
      errs.id = ["只能包含小写字母、数字和连字符"];
    } else if (existingIds.has(data.id)) {
      errs.id = ["ID 已存在"];
    }
    wizardState.errors = errs;
    return Object.keys(errs).length === 0;
  };

  const canProceed = () => {
    if (step === 1) {
      return !!data.id && !errors.id?.length;
    }
    if (step === 2) {
      return !!data.model;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateBasic()) {
      updateAndRefresh();
      return;
    }
    if (step < WIZARD_STEPS.length - 1) {
      setStep(step + 1);
    }
  };

  const handleComplete = () => {
    if (validateBasic() && !wizardState.saving) {
      wizardState.saving = true;
      wizardState.saveError = null;
      updateAndRefresh();
      const result = { ...data } as AgentData;
      props.onAgentWizardComplete?.(result);
    }
  };

  const handleCancel = () => {
    resetWizardState();
    props.onAgentWizardCancel?.();
  };

  const selectTemplate = (t: (typeof AGENT_TEMPLATES)[number] | null) => {
    if (t) {
      wizardState.data = {
        emoji: t.icon,
        displayName: t.config.displayName as string,
        model: t.config.model as string,
        systemPrompt: t.config.systemPrompt as string,
        temperature: (t.config.temperature as number) ?? 0.7,
      };
    }
    setStep(1);
  };

  // 渲染步骤内容
  let content;
  if (step === 0) {
    // 模板选择
    const templates =
      selectedCategory === "all"
        ? AGENT_TEMPLATES
        : AGENT_TEMPLATES.filter((t) => t.category === selectedCategory);
    content = html`
      <div class="wizard__template-step">
        <div class="wizard__categories">
          <button class="wizard__category ${selectedCategory === "all" ? "wizard__category--active" : ""}" 
            @click=${() => setCategory("all")}>全部</button>
          ${AGENT_CATEGORIES.map(
            (cat: (typeof AGENT_CATEGORIES)[number]) => html`
            <button class="wizard__category ${selectedCategory === cat.id ? "wizard__category--active" : ""}"
              @click=${() => setCategory(cat.id)}>${cat.icon} ${cat.label}</button>
          `,
          )}
        </div>
        <div class="wizard__templates">
          <button class="wizard__template-card wizard__template-card--blank" @click=${() => selectTemplate(null)}>
            <span class="wizard__template-icon">➕</span>
            <span class="wizard__template-name">从零开始</span>
          </button>
          ${templates.map(
            (t: (typeof AGENT_TEMPLATES)[number]) => html`
            <button class="wizard__template-card" @click=${() => selectTemplate(t)}>
              <span class="wizard__template-icon">${t.icon}</span>
              <span class="wizard__template-name">${t.name}</span>
              <span class="wizard__template-desc">${t.description}</span>
            </button>
          `,
          )}
        </div>
      </div>
    `;
  } else if (step === 1) {
    // 基本信息
    content = html`
      <div class="wizard__form">
        ${renderField({
          label: "Agent ID",
          required: true,
          error: errors.id?.[0],
          hint: "唯一标识，只能包含小写字母、数字和连字符",
          content: html`<input type="text" class="wizard__input" .value=${data.id ?? ""} 
            @input=${(e: Event) => setData("id", (e.target as HTMLInputElement).value)} placeholder="my-agent" />`,
        })}
        ${renderField({
          label: "显示名称",
          content: html`<input type="text" class="wizard__input" .value=${data.displayName ?? ""} 
            @input=${(e: Event) => setData("displayName", (e.target as HTMLInputElement).value)} placeholder="我的助手" />`,
        })}
        ${renderField({
          label: "头像 Emoji",
          content: html`<div class="wizard__emoji-picker">
            ${EMOJI_OPTIONS.map(
              (emoji) => html`
              <button type="button" class="wizard__emoji ${data.emoji === emoji ? "wizard__emoji--selected" : ""}"
                @click=${() => setData("emoji", emoji)}>${emoji}</button>
            `,
            )}
          </div>`,
        })}
        ${renderField({
          label: "工作区目录",
          hint: "留空则使用 OpenClaw 默认工作区规则；建议填写绝对路径或以 ~ 开头的路径，避免使用相对路径",
          content: html`<input type="text" class="wizard__input" .value=${data.workspace ?? ""} 
            @input=${(e: Event) => setData("workspace", (e.target as HTMLInputElement).value)} 
            placeholder="~/agent-workspaces/${data.id || "my-agent"}" />`,
        })}
      </div>
    `;
  } else if (step === 2) {
    // 模型选择
    content = html`
      <div class="wizard__form">
        ${renderField({
          label: "AI 模型",
          required: true,
          content: html`<select class="wizard__select" .value=${data.model ?? ""} 
            @change=${(e: Event) => setData("model", (e.target as HTMLSelectElement).value)}>
            <option value="">请选择模型</option>
            ${models.map((m: string) => html`<option value=${m} ?selected=${data.model === m}>${m}</option>`)}
          </select>`,
        })}
        ${renderField({
          label: "Temperature",
          hint: "控制回复的随机性，0 最确定，1 最随机",
          content: html`<div class="wizard__slider-group">
            <input type="range" class="wizard__slider" min="0" max="1" step="0.1" 
              .value=${String(data.temperature ?? 0.7)}
              @input=${(e: Event) => setData("temperature", parseFloat((e.target as HTMLInputElement).value))} />
            <span class="wizard__slider-value">${data.temperature ?? 0.7}</span>
          </div>`,
        })}
      </div>
    `;
  } else if (step === 3) {
    // 人设
    content = html`
      <div class="wizard__form">
        ${renderField({
          label: "系统提示词",
          hint: "定义 Agent 的角色、能力和行为方式",
          content: html`<textarea class="wizard__textarea" rows="12" .value=${data.systemPrompt ?? ""}
            @input=${(e: Event) => setData("systemPrompt", (e.target as HTMLTextAreaElement).value)}
            placeholder="你是一个..."></textarea>`,
        })}
      </div>
    `;
  } else {
    // 预览
    content = html`
      <div class="wizard__review">
        <div class="wizard__review-header">
          <span class="wizard__review-emoji">${data.emoji ?? "🤖"}</span>
          <div>
            <div class="wizard__review-name">${data.displayName || data.id || "未命名"}</div>
            <div class="wizard__review-id">${data.id || "-"}</div>
          </div>
        </div>
        <div class="wizard__review-section">
          <div class="wizard__review-label">工作区目录</div>
          <div class="wizard__review-value">${data.workspace || `agents/${data.id}`}</div>
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

  return html`
    <div class="agents-wizard-overlay" @click=${(e: Event) => {
      if (e.target === e.currentTarget && !wizardState.saving) {
        handleCancel();
      }
    }}>
      <div class="agents-wizard-modal">
        <div class="wizard">
          <div class="wizard__header"><h2 class="wizard__title">创建 Agent</h2></div>
          ${renderStepIndicator(WIZARD_STEPS, step, (i: number) => {
            if (i < step && !wizardState.saving) {
              setStep(i);
            }
          })}
          <div class="wizard__content">
            ${
              wizardState.saveError
                ? html`
              <div class="wizard__error-banner">
                <span>❌ ${wizardState.saveError}</span>
                <button class="wizard__error-close" @click=${() => {
                  wizardState.saveError = null;
                  updateAndRefresh();
                }}>×</button>
              </div>
            `
                : nothing
            }
            ${content}
          </div>
          ${renderWizardFooter({
            currentStep: step,
            totalSteps: WIZARD_STEPS.length,
            onPrev: () => setStep(step - 1),
            onNext: handleNext,
            onCancel: handleCancel,
            onComplete: handleComplete,
            canProceed: canProceed() && !wizardState.saving,
            nextLabel: wizardState.saving ? "创建中..." : undefined,
          })}
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染 Agent 详情区域（头部 + Tab + 内容）
 * Render agent details area (header + tabs + content)
 */
function renderAgentDetails(props: AgentsConfigProps) {
  const { agentsList, selectedAgentId, activePanel, agentIdentity, defaultAgentId } = props;

  const agents = agentsList?.agents ?? [];
  const selectedAgent = agents.find((a: { id: string }) => a.id === selectedAgentId);

  if (!selectedAgent) {
    return html`
      <div class="agents-detail agents-detail--empty">
        <div class="agents-detail__placeholder">
          <p>${LABELS.sidebar.selectAgent}</p>
        </div>
      </div>
    `;
  }

  return html`
    <div class="agents-detail">
      <!-- Agent 头部 / Agent header -->
      ${renderAgentHeader({
        agent: selectedAgent,
        defaultId: defaultAgentId,
        agentIdentity,
      })}

      <!-- Tab 切换栏 / Tab navigation -->
      ${renderAgentTabs({
        active: activePanel,
        onSelect: props.onPanelChange,
      })}

      <!-- 面板内容 / Panel content -->
      <div class="agents-detail__content">
        ${renderActivePanel(props, selectedAgent)}
      </div>
    </div>
  `;
}

/**
 * 主渲染函数 - Agent 配置页面
 * Main render function - Agent configuration page
 */
export function renderAgentsConfig(props: AgentsConfigProps) {
  const {
    loading,
    error,
    agentsList,
    selectedAgentId,
    defaultAgentId,
    globalPanel,
    onAgentSelect,
    onRefresh,
    onGlobalPanelChange,
  } = props;

  // 错误状态 / Error state
  if (error && !agentsList) {
    return html`
      <div class="agents-layout agents-layout--error">
        <div class="mc-error">
          <p>${error}</p>
          <button class="mc-btn mc-btn--primary" @click=${onRefresh}>${LABELS.actions.retry}</button>
        </div>
      </div>
    `;
  }

  // 加载状态 / Loading state
  if (loading && !agentsList) {
    return html`
      <div class="agents-layout agents-layout--loading">
        <div class="mc-loading">${LABELS.actions.loading}</div>
      </div>
    `;
  }

  const agents = agentsList?.agents ?? [];

  // 处理全局配置点击 / Handle global config click
  const handleGlobalConfigClick = (section: string) => {
    onGlobalPanelChange(section as GlobalPanel);
  };

  // 渲染配置操作按钮 / Render config action buttons
  const renderConfigActions = () => {
    const {
      configDirty,
      configLoading,
      configSaving,
      configApplying,
      onConfigReload,
      onConfigSave,
      onConfigApply,
    } = props;
    const isBusy = configLoading || configSaving || configApplying;

    return html`
      <div class="agents-actions">
        <button
          class="mc-btn mc-btn--sm"
          ?disabled=${isBusy}
          @click=${onConfigReload}
        >
          ${configLoading ? LABELS.actions.loading : LABELS.actions.reload}
        </button>
        <button
          class="mc-btn mc-btn--sm"
          ?disabled=${!configDirty || isBusy}
          @click=${onConfigSave}
        >
          ${configSaving ? LABELS.actions.saving : LABELS.actions.save}
        </button>
        <button
          class="mc-btn mc-btn--sm mc-btn--primary"
          ?disabled=${!configDirty || isBusy}
          @click=${onConfigApply}
        >
          ${configApplying ? LABELS.actions.applying : LABELS.actions.apply}
        </button>
      </div>
    `;
  };

  return html`
    <div class="agents-layout">
      <!-- Agent 创建向导 / Agent creation wizard -->
      ${props.showAgentWizard ? renderAgentWizard(props) : nothing}

      <!-- 左侧 Agent 侧边栏 / Left agent sidebar -->
      ${renderAgentSidebar({
        agents,
        selectedId: globalPanel ? null : selectedAgentId,
        defaultId: defaultAgentId,
        activeGlobalPanel: globalPanel,
        loading,
        error,
        agentIdentityById: props.agentIdentityById,
        agentStatusById: props.sidebarAgentStatusById,
        hasChanges: props.configDirty,
        connected: props.connected,
        searchQuery: props.sidebarSearchQuery,
        openMenuId: props.sidebarOpenMenuId,
        menuPosition:
          props.sidebarMenuTop != null && props.sidebarMenuRight != null
            ? { top: props.sidebarMenuTop, right: props.sidebarMenuRight }
            : undefined,
        groups: props.sidebarGroups,
        collapsedGroups: props.sidebarCollapsedGroups,
        onSelectAgent: (agentId: string) => {
          onGlobalPanelChange(null);
          onAgentSelect(agentId);
        },
        onRefresh,
        onGlobalConfigClick: handleGlobalConfigClick,
        onSetDefault: props.onSetDefault,
        onSearchChange: props.onSidebarSearchChange,
        onToggleMenu: props.onSidebarToggleMenu,
        onToggleGroup: props.onSidebarToggleGroup,
        onDuplicate: props.onAgentDuplicate,
        onExport: props.onAgentExport,
        onDelete: props.onAgentDelete,
        onCreateAgent: props.onCreateAgent,
      })}

      <!-- 右侧内容区域 / Right content area -->
      <div class="agents-main">
        <!-- 配置操作按钮 / Config action buttons -->
        ${renderConfigActions()}

        ${globalPanel ? renderGlobalPanel(props) : renderAgentDetails(props)}
      </div>
    </div>
  `;
}
