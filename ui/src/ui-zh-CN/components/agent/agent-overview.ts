/**
 * Agent 概览面板组件
 * Agent overview panel component
 *
 * 显示基本信息和模型选择
 * Display basic info and model selection
 */
import { html, nothing } from "lit";
import type { AgentsListResult, AgentIdentityResult, AgentsFilesListResult } from "../../../ui/types";
import { LABELS, type ConfigSnapshot } from "../../types/agents-config";

// ─────────────────────────────────────────────────────────────────────────────
// SVG 图标 / SVG Icons
// ─────────────────────────────────────────────────────────────────────────────

const icons = {
  refresh: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
};

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义 / Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type AgentOverviewProps = {
  agent: AgentsListResult["agents"][number];
  defaultId: string | null;
  configForm: Record<string, unknown> | null;
  agentFilesList: AgentsFilesListResult | null;
  agentIdentity: AgentIdentityResult | null;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// 辅助函数 / Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从配置中解析 Agent 条目
 * Resolve agent config entry from config form
 */
function resolveAgentConfig(config: Record<string, unknown> | null, agentId: string) {
  const cfg = config as ConfigSnapshot | null;
  const list = cfg?.agents?.list ?? [];
  const entry = list.find((agent) => agent?.id === agentId);
  return { entry, defaults: cfg?.agents?.defaults };
}

/**
 * 解析工作区路径
 * Resolve workspace path
 */
function resolveWorkspace(
  config: { entry?: { workspace?: string }; defaults?: { workspace?: string } },
  agentFilesList: AgentsFilesListResult | null,
  agentId: string,
): string {
  const workspaceFromFiles = agentFilesList && agentFilesList.agentId === agentId ? agentFilesList.workspace : null;
  return workspaceFromFiles || config.entry?.workspace || config.defaults?.workspace || "default";
}

/**
 * 格式化模型标签
 * Format model label
 */
function resolveModelLabel(model?: unknown): string {
  if (!model) return "-";
  if (typeof model === "string") return model.trim() || "-";
  if (typeof model === "object" && model) {
    const record = model as { primary?: string; fallbacks?: string[] };
    const primary = record.primary?.trim();
    if (primary) {
      const fallbackCount = Array.isArray(record.fallbacks) ? record.fallbacks.length : 0;
      return fallbackCount > 0 ? `${primary} (+${fallbackCount} 备选)` : primary;
    }
  }
  return "-";
}

/**
 * 解析 Agent emoji
 * Resolve agent emoji
 */
function resolveAgentEmoji(
  agent: { identity?: { emoji?: string; avatar?: string } },
  agentIdentity?: AgentIdentityResult | null,
): string {
  const candidates = [
    agentIdentity?.emoji?.trim(),
    agent.identity?.emoji?.trim(),
    agentIdentity?.avatar?.trim(),
    agent.identity?.avatar?.trim(),
  ];

  for (const candidate of candidates) {
    if (candidate && isLikelyEmoji(candidate)) {
      return candidate;
    }
  }
  return "";
}

/**
 * 判断是否为 emoji
 * Check if string is likely an emoji
 */
function isLikelyEmoji(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16) return false;

  let hasNonAscii = false;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed.charCodeAt(i) > 127) {
      hasNonAscii = true;
      break;
    }
  }
  if (!hasNonAscii) return false;
  if (trimmed.includes("://") || trimmed.includes("/") || trimmed.includes(".")) {
    return false;
  }
  return true;
}

/**
 * 解析主模型
 * Resolve model primary
 */
function resolveModelPrimary(model?: unknown): string | null {
  if (!model) return null;
  if (typeof model === "string") {
    const trimmed = model.trim();
    return trimmed || null;
  }
  if (typeof model === "object" && model) {
    const record = model as Record<string, unknown>;
    const candidate =
      typeof record.primary === "string"
        ? record.primary
        : typeof record.model === "string"
          ? record.model
          : null;
    return candidate?.trim() || null;
  }
  return null;
}

/**
 * 解析备选模型列表
 * Resolve model fallbacks
 */
function resolveModelFallbacks(model?: unknown): string[] | null {
  if (!model || typeof model === "string") return null;
  if (typeof model === "object" && model) {
    const record = model as Record<string, unknown>;
    const fallbacks = Array.isArray(record.fallbacks) ? record.fallbacks : null;
    return fallbacks ? fallbacks.filter((entry): entry is string => typeof entry === "string") : null;
  }
  return null;
}

/**
 * 构建模型下拉选项
 * Build model dropdown options
 */
function buildModelOptions(configForm: Record<string, unknown> | null, current?: string | null) {
  const cfg = configForm as ConfigSnapshot | null;
  const models = cfg?.agents?.defaults?.models;
  if (!models || typeof models !== "object") {
    return html`<option value="" disabled>无可用模型</option>`;
  }

  const options: Array<{ value: string; label: string }> = [];
  for (const [modelId, modelRaw] of Object.entries(models)) {
    const trimmed = modelId.trim();
    if (!trimmed) continue;
    const alias = modelRaw?.alias?.trim();
    const label = alias && alias !== trimmed ? `${alias} (${trimmed})` : trimmed;
    options.push({ value: trimmed, label });
  }

  // 如果当前值不在选项中，添加它
  if (current && !options.some((opt) => opt.value === current)) {
    options.unshift({ value: current, label: `当前 (${current})` });
  }

  if (options.length === 0) {
    return html`<option value="" disabled>无可用模型</option>`;
  }

  return options.map((opt) => html`<option value=${opt.value}>${opt.label}</option>`);
}

/**
 * 解析备选模型列表文本
 * Parse fallback list
 */
function parseFallbackList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// 渲染函数 / Render Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 渲染 Agent 概览面板
 * Render agent overview panel
 */
export function renderAgentOverview(props: AgentOverviewProps) {
  const {
    agent,
    configForm,
    agentFilesList,
    agentIdentity,
    agentIdentityLoading,
    agentIdentityError,
    configLoading,
    configSaving,
    configDirty,
    onConfigReload,
    onConfigSave,
    onModelChange,
    onModelFallbacksChange,
  } = props;

  const config = resolveAgentConfig(configForm, agent.id);
  const workspace = resolveWorkspace(config, agentFilesList, agent.id);
  const model = resolveModelLabel(config.entry?.model ?? config.defaults?.model);
  const defaultModel = resolveModelLabel(config.defaults?.model);
  const modelPrimary = resolveModelPrimary(config.entry?.model);
  const defaultPrimary = resolveModelPrimary(config.defaults?.model);
  const effectivePrimary = modelPrimary ?? defaultPrimary ?? null;
  const modelFallbacks = resolveModelFallbacks(config.entry?.model);
  const fallbackText = modelFallbacks ? modelFallbacks.join(", ") : "";

  const identityName =
    agentIdentity?.name?.trim() ||
    agent.identity?.name?.trim() ||
    agent.name?.trim() ||
    config.entry?.name ||
    "-";
  const identityEmoji = resolveAgentEmoji(agent, agentIdentity) || "-";
  const skillFilter = Array.isArray(config.entry?.skills) ? config.entry?.skills : null;
  const skillCount = skillFilter?.length ?? null;
  const isDefault = Boolean(props.defaultId && agent.id === props.defaultId);
  const identityStatus = agentIdentityLoading ? LABELS.actions.loading : agentIdentityError ? "不可用" : "";

  return html`
    <div class="mc-section">
      <div class="mc-section__header">
        <div class="mc-section__titles">
          <h3 class="mc-section__title">${LABELS.overview.title}</h3>
          <p class="mc-section__desc">${LABELS.overview.desc}</p>
        </div>
      </div>

      <!-- 基本信息网格 / Basic info grid -->
      <div class="mc-card">
        <div class="mc-card__content">
          <div class="mc-grid mc-grid--3col">
            <div class="mc-kv">
              <span class="mc-kv__label">${LABELS.overview.workspace}</span>
              <span class="mc-kv__value mc-kv__value--mono">${workspace}</span>
            </div>
            <div class="mc-kv">
              <span class="mc-kv__label">${LABELS.overview.primaryModel}</span>
              <span class="mc-kv__value mc-kv__value--mono">${model}</span>
            </div>
            <div class="mc-kv">
              <span class="mc-kv__label">${LABELS.overview.identityName}</span>
              <span class="mc-kv__value">${identityName}</span>
              ${identityStatus ? html`<span class="mc-kv__sub">${identityStatus}</span>` : nothing}
            </div>
            <div class="mc-kv">
              <span class="mc-kv__label">${LABELS.overview.isDefault}</span>
              <span class="mc-kv__value">${isDefault ? "是" : "否"}</span>
            </div>
            <div class="mc-kv">
              <span class="mc-kv__label">${LABELS.overview.identityEmoji}</span>
              <span class="mc-kv__value">${identityEmoji}</span>
            </div>
            <div class="mc-kv">
              <span class="mc-kv__label">${LABELS.overview.skillsFilter}</span>
              <span class="mc-kv__value">${skillFilter ? `已选 ${skillCount} 个` : LABELS.overview.allSkills}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 模型选择区域 / Model selection area -->
      <div class="mc-card" style="margin-top: 16px;">
        <div class="mc-card__header">
          <h4 class="mc-card__title">${LABELS.overview.modelSelection}</h4>
        </div>
        <div class="mc-card__content">
          <div class="mc-form-row mc-form-row--2col">
            <label class="mc-field">
              <span class="mc-field__label">${LABELS.overview.primaryModel}</span>
              <select
                class="mc-select"
                .value=${effectivePrimary ?? ""}
                ?disabled=${!configForm || configLoading || configSaving}
                @change=${(e: Event) => onModelChange(agent.id, (e.target as HTMLSelectElement).value || null)}
              >
                <option value="">
                  ${defaultPrimary ? `${LABELS.overview.inheritDefault} (${defaultPrimary})` : LABELS.overview.inheritDefault}
                </option>
                ${buildModelOptions(configForm, effectivePrimary)}
              </select>
            </label>
            <label class="mc-field">
              <span class="mc-field__label">${LABELS.overview.fallbacks}</span>
              <input
                type="text"
                class="mc-input"
                .value=${fallbackText}
                placeholder="provider/model, provider/model"
                ?disabled=${!configForm || configLoading || configSaving}
                @input=${(e: Event) => onModelFallbacksChange(agent.id, parseFallbackList((e.target as HTMLInputElement).value))}
              />
            </label>
          </div>
        </div>
      </div>

      <!-- 操作按钮 / Action buttons -->
      <div class="mc-actions" style="margin-top: 16px;">
        <button class="mc-btn mc-btn--sm" ?disabled=${configLoading || configSaving} @click=${onConfigReload}>
          ${icons.refresh} ${configLoading ? LABELS.actions.loading : LABELS.actions.reload}
        </button>
        <button
          class="mc-btn mc-btn--sm mc-btn--primary"
          ?disabled=${!configDirty || configLoading || configSaving}
          @click=${onConfigSave}
        >
          ${configSaving ? LABELS.actions.saving : LABELS.actions.save}
        </button>
      </div>
    </div>
  `;
}
