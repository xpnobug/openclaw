# 方案 C：Agent-centric 完整重构设计文档

## 目录
1. [整体架构设计](#一整体架构设计)
2. [文件结构设计](#二文件结构设计)
3. [核心类型定义](#三核心类型定义)
4. [组件详细设计](#四组件详细设计)
5. [控制器设计](#五控制器设计)
6. [数据流设计](#六数据流设计)
7. [迁移策略](#七迁移策略)
8. [实施步骤](#八实施步骤)

---

## 一、整体架构设计

### 1.1 布局结构图

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              顶部操作栏                                         │
│  [状态指示器]                    [重新加载]  [保存配置]  [保存并应用]              │
├────────────────────┬───────────────────────────────────────────────────────────┤
│                    │                                                           │
│    Agent 侧边栏     │                     主内容区                              │
│                    │                                                           │
│  ┌──────────────┐  │  ┌─────────────────────────────────────────────────────┐  │
│  │   Agents     │  │  │                  Agent 头部信息                      │  │
│  │  ──────────  │  │  │  🤖 Agent-2 · 默认                                  │  │
│  │  🤖 Agent-1  │  │  │  工作区: ~/projects/bot                             │  │
│  │  🤖 Agent-2  │←─│  └─────────────────────────────────────────────────────┘  │
│  │  🤖 Agent-3  │  │  ┌─────────────────────────────────────────────────────┐  │
│  │              │  │  │  [概览] [文件] [工具] [技能] [通道] [定时任务]         │  │
│  │  ──────────  │  │  └─────────────────────────────────────────────────────┘  │
│  │  ⚙️ 全局配置  │  │  ┌─────────────────────────────────────────────────────┐  │
│  │   模型供应商  │  │  │                                                     │  │
│  │   Gateway    │  │  │              Tab 内容区域                            │  │
│  │   通道配置    │  │  │                                                     │  │
│  └──────────────┘  │  │         (根据选中的 Tab 动态渲染)                     │  │
│                    │  │                                                     │  │
│                    │  └─────────────────────────────────────────────────────┘  │
└────────────────────┴───────────────────────────────────────────────────────────┘
```

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| Agent 为中心 | 所有配置围绕选中的 Agent 展开，Agent 是配置的主体 |
| Tab 切换 | Agent 级配置通过 Tab 切换，减少页面跳转，保持上下文 |
| 全局配置分离 | 模型供应商、Gateway、通道配置 作为全局配置独立入口 |
| 状态隔离 | 每个 Agent 的配置状态独立管理，避免互相干扰 |
| 懒加载 | 切换 Tab 时按需加载数据，优化性能 |
| 样式一致 | 保持 ui-zh-CN 现有的 BEM 命名规范和组件样式 |

### 1.3 样式规范（沿用 ui-zh-CN 现有风格）

| 类型 | 命名规范 | 示例 |
|------|----------|------|
| 布局容器 | `{组件名}-layout` | `agents-config-layout` |
| 侧边栏 | `{组件名}-sidebar__*` | `agents-sidebar__header` |
| 内容区 | `config-content__*` | `config-content__title` |
| 区块 | `mc-section__*` | `mc-section__header` |
| 卡片 | `mc-card__*` | `mc-card__content` |
| 表单 | `mc-field__*` / `mc-input` / `mc-select` | `mc-field__label` |
| 按钮 | `mc-btn mc-btn--*` | `mc-btn--primary` |

---

## 二、文件结构设计

### 2.1 新增/修改文件清单

```
ui-zh-CN/
├── views/
│   ├── agents-config.ts          # 🆕 主视图入口（Agent-centric 布局）
│   ├── global-config.ts          # 🆕 全局配置视图（Providers/Gateway/Channels）
│   └── model-config.ts           # 🔄 修改：作为路由层，根据 section 分发
│
├── components/
│   │
│   ├── agent/                    # 🆕 Agent 相关组件目录
│   │   ├── index.ts              # 组件导出入口
│   │   ├── agent-sidebar.ts      # Agent 列表侧边栏
│   │   ├── agent-header.ts       # Agent 头部信息
│   │   ├── agent-tabs.ts         # Tab 切换栏
│   │   ├── agent-overview.ts     # 概览面板
│   │   ├── agent-files.ts        # 文件编辑面板
│   │   ├── agent-tools.ts        # 工具配置面板
│   │   ├── agent-skills.ts       # 技能管理面板
│   │   ├── agent-channels.ts     # 通道配置面板
│   │   └── agent-cron.ts         # 定时任务面板
│   │
│   ├── config-sidebar.ts         # 🔄 修改：简化为全局配置导航
│   ├── providers-content.ts      # 保留
│   ├── gateway-content.ts        # 保留
│   ├── channels-content.ts       # 保留（全局通道配置）
│   └── ...其他组件
│
├── controllers/
│   ├── agents-config.ts          # 🆕 Agent 配置控制器
│   └── model-config.ts           # 🔄 修改：添加 Agent 相关状态管理
│
├── types/
│   ├── agents-config.ts          # 🆕 Agent 配置相关类型
│   └── ...现有类型文件
│
└── docs/
    └── agent-centric-refactor.md # 本设计文档
```

### 2.2 文件职责说明

| 文件 | 职责 |
|------|------|
| `views/agents-config.ts` | 主视图，组合 Agent 侧边栏 + 主内容区 |
| `views/global-config.ts` | 全局配置视图，包含 Providers/Gateway/Channels |
| `components/agent/agent-sidebar.ts` | Agent 列表渲染，选中状态管理 |
| `components/agent/agent-header.ts` | Agent 头部信息（emoji、名称、ID、badge）|
| `components/agent/agent-tabs.ts` | Tab 切换栏渲染 |
| `components/agent/agent-overview.ts` | 概览面板（模型选择、基本信息）|
| `components/agent/agent-files.ts` | 工作区文件编辑 |
| `components/agent/agent-tools.ts` | 工具配置（profile、allow/deny）|
| `components/agent/agent-skills.ts` | 技能过滤和开关 |
| `components/agent/agent-channels.ts` | Agent 绑定的通道状态 |
| `components/agent/agent-cron.ts` | 定时任务管理 |
| `controllers/agents-config.ts` | Agent 配置的业务逻辑和状态管理 |

---

## 三、核心类型定义

### 3.1 Agent 面板类型

```typescript
// types/agents-config.ts

/**
 * Agent 配置面板类型
 * Agent configuration panel types
 */
export type AgentPanel =
  | "overview"   // 概览
  | "files"      // 文件
  | "tools"      // 工具
  | "skills"     // 技能
  | "channels"   // 通道
  | "cron";      // 定时任务

/**
 * 侧边栏区域类型
 * Sidebar section types
 */
export type SidebarSection =
  | "agents"     // Agent 列表（默认）
  | "providers"  // 模型供应商
  | "gateway"    // Gateway 配置
  | "channels";  // 全局通道配置
```

### 3.2 中文标签定义

```typescript
// types/agents-config.ts

/**
 * 中文标签常量
 * Chinese label constants
 */
export const LABELS = {
  // 面板标签 / Panel labels
  panels: {
    overview: "概览",
    files: "文件",
    tools: "工具",
    skills: "技能",
    channels: "通道",
    cron: "定时任务",
  },

  // 侧边栏标签 / Sidebar labels
  sidebar: {
    agents: "Agents",
    agentsCount: "个已配置",
    globalConfig: "全局配置",
    providers: "模型供应商",
    gateway: "Gateway",
    channels: "通道配置",
  },

  // 操作按钮 / Action buttons
  actions: {
    save: "保存配置",
    apply: "保存并应用",
    reload: "重新加载",
    refresh: "刷新",
    saving: "保存中...",
    applying: "应用中...",
    loading: "加载中...",
  },

  // 状态标签 / Status labels
  status: {
    default: "默认",
    configured: "已配置",
    notConfigured: "未配置",
    enabled: "已启用",
    disabled: "已禁用",
    connected: "已连接",
    disconnected: "未连接",
    unsaved: "未保存",
  },

  // 概览面板 / Overview panel
  overview: {
    title: "概览",
    desc: "工作区路径和身份元数据",
    workspace: "工作区",
    primaryModel: "主模型",
    identityName: "身份名称",
    identityEmoji: "身份图标",
    isDefault: "默认 Agent",
    skillsFilter: "技能过滤",
    allSkills: "全部技能",
    selectedSkills: "已选 {n} 个",
    modelSelection: "模型选择",
    fallbacks: "备选模型 (逗号分隔)",
    inheritDefault: "继承默认",
  },

  // 工具面板 / Tools panel
  tools: {
    title: "工具",
    desc: "配置此 Agent 可用的工具集",
    profile: "工具 Profile",
    profiles: {
      minimal: "最小",
      coding: "编程",
      messaging: "消息",
      full: "完整",
    },
    sections: {
      fs: "文件系统",
      runtime: "运行时",
      web: "网络",
      memory: "记忆",
      sessions: "会话",
      ui: "界面",
      messaging: "消息",
      automation: "自动化",
    },
  },

  // 文件面板 / Files panel
  files: {
    title: "文件",
    desc: "工作区提示词和身份文件",
    selectFile: "选择文件",
    noFiles: "暂无文件",
  },

  // 技能面板 / Skills panel
  skills: {
    title: "技能",
    desc: "管理此 Agent 可用的技能",
    filter: "搜索技能...",
    clearFilter: "清除",
    disableAll: "全部禁用",
    noSkills: "暂无技能",
  },

  // 通道面板 / Channels panel
  channels: {
    title: "通道",
    desc: "查看此 Agent 绑定的通道状态",
    noChannels: "暂无绑定通道",
  },

  // 定时任务面板 / Cron panel
  cron: {
    title: "定时任务",
    desc: "管理此 Agent 的定时任务",
    noJobs: "暂无定时任务",
  },

  // 空状态 / Empty states
  empty: {
    selectAgent: "选择一个 Agent",
    selectAgentDesc: "从左侧列表选择一个 Agent 来查看和编辑配置。",
    noAgents: "未找到 Agent",
  },
} as const;
```

### 3.3 Agent 配置 Props

```typescript
// types/agents-config.ts

import type {
  AgentsListResult,
  AgentIdentityResult,
  AgentsFilesListResult,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
  SkillStatusReport,
} from "../../ui/types";

/**
 * Agent 配置视图 Props
 * Agent configuration view props
 */
export type AgentsConfigProps = {
  // ===== 加载状态 / Loading states =====
  loading: boolean;
  error: string | null;

  // ===== Agent 列表 / Agent list =====
  agentsList: AgentsListResult | null;
  selectedAgentId: string | null;
  activePanel: AgentPanel;

  // ===== 配置表单状态 / Config form states =====
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;

  // ===== Agent 身份信息 / Agent identity =====
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;

  // ===== Agent 文件 / Agent files =====
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;

  // ===== 通道状态 / Channels status =====
  channelsLoading: boolean;
  channelsError: string | null;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsLastSuccess: number | null;

  // ===== 定时任务 / Cron jobs =====
  cronLoading: boolean;
  cronStatus: CronStatus | null;
  cronJobs: CronJob[];
  cronError: string | null;

  // ===== 技能管理 / Skills management =====
  agentSkillsLoading: boolean;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsError: string | null;
  agentSkillsAgentId: string | null;
  skillsFilter: string;

  // ===== 事件回调 / Event callbacks =====
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectPanel: (panel: AgentPanel) => void;

  // 文件操作 / File operations
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;

  // 工具配置 / Tools config
  onToolsProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onToolsOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => void;

  // 模型配置 / Model config
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;

  // 配置操作 / Config operations
  onConfigReload: () => void;
  onConfigSave: () => void;

  // 通道操作 / Channels operations
  onChannelsRefresh: () => void;

  // 定时任务操作 / Cron operations
  onCronRefresh: () => void;

  // 技能操作 / Skills operations
  onSkillsFilterChange: (next: string) => void;
  onSkillsRefresh: () => void;
  onAgentSkillToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  onAgentSkillsClear: (agentId: string) => void;
  onAgentSkillsDisableAll: (agentId: string) => void;
};
```

---

## 四、组件详细设计

### 4.1 主视图 - agents-config.ts

```typescript
/**
 * Agent 配置主视图
 * Agent configuration main view
 *
 * Agent-centric 布局：左侧 Agent 列表 + 右侧详情面板
 * Agent-centric layout: left agent list + right detail panel
 */
import { html, nothing } from "lit";
import type { AgentsConfigProps, AgentPanel } from "../types/agents-config";
import { LABELS } from "../types/agents-config";
import { renderAgentSidebar } from "../components/agent/agent-sidebar";
import { renderAgentHeader } from "../components/agent/agent-header";
import { renderAgentTabs } from "../components/agent/agent-tabs";
import { renderAgentOverview } from "../components/agent/agent-overview";
import { renderAgentFiles } from "../components/agent/agent-files";
import { renderAgentTools } from "../components/agent/agent-tools";
import { renderAgentSkills } from "../components/agent/agent-skills";
import { renderAgentChannels } from "../components/agent/agent-channels";
import { renderAgentCron } from "../components/agent/agent-cron";

// ─────────────────────────────────────────────────────────────────────────────
// 主渲染函数 / Main Render Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 渲染 Agent 配置主视图
 * Render agent configuration main view
 */
export function renderAgentsConfig(props: AgentsConfigProps) {
  const agents = props.agentsList?.agents ?? [];
  const defaultId = props.agentsList?.defaultId ?? null;
  const selectedId = props.selectedAgentId ?? defaultId ?? agents[0]?.id ?? null;
  const selectedAgent = selectedId
    ? (agents.find((agent) => agent.id === selectedId) ?? null)
    : null;

  return html`
    <div class="agents-config-layout">
      <!-- 左侧侧边栏 / Left sidebar -->
      ${renderAgentSidebar({
        agents,
        defaultId,
        selectedId,
        loading: props.loading,
        error: props.error,
        agentIdentityById: props.agentIdentityById,
        hasChanges: props.configDirty,
        connected: true,
        onSelectAgent: props.onSelectAgent,
        onRefresh: props.onRefresh,
      })}

      <!-- 右侧主内容区 / Right main content -->
      <main class="agents-config-main">
        ${!selectedAgent
          ? renderEmptyState()
          : html`
              ${renderAgentHeader({
                agent: selectedAgent,
                defaultId,
                agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
              })}

              ${renderAgentTabs({
                active: props.activePanel,
                onSelect: props.onSelectPanel,
              })}

              <div class="agents-config-content">
                ${renderActivePanel(props, selectedAgent)}
              </div>
            `
        }
      </main>
    </div>
  `;
}

/**
 * 渲染空状态提示
 * Render empty state prompt
 */
function renderEmptyState() {
  return html`
    <div class="mc-card">
      <div class="mc-card__content mc-card__content--center">
        <h3 class="mc-card__title">${LABELS.empty.selectAgent}</h3>
        <p class="mc-card__desc">${LABELS.empty.selectAgentDesc}</p>
      </div>
    </div>
  `;
}

/**
 * 根据当前 Tab 渲染对应面板
 * Render corresponding panel based on current tab
 */
function renderActivePanel(
  props: AgentsConfigProps,
  agent: NonNullable<AgentsConfigProps["agentsList"]>["agents"][number]
) {
  switch (props.activePanel) {
    case "overview":
      return renderAgentOverview({
        agent,
        defaultId: props.agentsList?.defaultId ?? null,
        configForm: props.configForm,
        agentFilesList: props.agentFilesList,
        agentIdentity: props.agentIdentityById[agent.id] ?? null,
        agentIdentityLoading: props.agentIdentityLoading,
        agentIdentityError: props.agentIdentityError,
        configLoading: props.configLoading,
        configSaving: props.configSaving,
        configDirty: props.configDirty,
        onConfigReload: props.onConfigReload,
        onConfigSave: props.onConfigSave,
        onModelChange: props.onModelChange,
        onModelFallbacksChange: props.onModelFallbacksChange,
      });

    case "files":
      return renderAgentFiles({
        agentId: agent.id,
        agentFilesList: props.agentFilesList,
        agentFilesLoading: props.agentFilesLoading,
        agentFilesError: props.agentFilesError,
        agentFileActive: props.agentFileActive,
        agentFileContents: props.agentFileContents,
        agentFileDrafts: props.agentFileDrafts,
        agentFileSaving: props.agentFileSaving,
        onLoadFiles: props.onLoadFiles,
        onSelectFile: props.onSelectFile,
        onFileDraftChange: props.onFileDraftChange,
        onFileReset: props.onFileReset,
        onFileSave: props.onFileSave,
      });

    case "tools":
      return renderAgentTools({
        agentId: agent.id,
        configForm: props.configForm,
        configLoading: props.configLoading,
        configSaving: props.configSaving,
        configDirty: props.configDirty,
        onProfileChange: props.onToolsProfileChange,
        onOverridesChange: props.onToolsOverridesChange,
        onConfigReload: props.onConfigReload,
        onConfigSave: props.onConfigSave,
      });

    case "skills":
      return renderAgentSkills({
        agentId: agent.id,
        report: props.agentSkillsReport,
        loading: props.agentSkillsLoading,
        error: props.agentSkillsError,
        activeAgentId: props.agentSkillsAgentId,
        configForm: props.configForm,
        configLoading: props.configLoading,
        configSaving: props.configSaving,
        configDirty: props.configDirty,
        filter: props.skillsFilter,
        onFilterChange: props.onSkillsFilterChange,
        onRefresh: props.onSkillsRefresh,
        onToggle: props.onAgentSkillToggle,
        onClear: props.onAgentSkillsClear,
        onDisableAll: props.onAgentSkillsDisableAll,
        onConfigReload: props.onConfigReload,
        onConfigSave: props.onConfigSave,
      });

    case "channels":
      return renderAgentChannels({
        agent,
        defaultId: props.agentsList?.defaultId ?? null,
        configForm: props.configForm,
        agentFilesList: props.agentFilesList,
        agentIdentity: props.agentIdentityById[agent.id] ?? null,
        snapshot: props.channelsSnapshot,
        loading: props.channelsLoading,
        error: props.channelsError,
        lastSuccess: props.channelsLastSuccess,
        onRefresh: props.onChannelsRefresh,
      });

    case "cron":
      return renderAgentCron({
        agent,
        defaultId: props.agentsList?.defaultId ?? null,
        configForm: props.configForm,
        agentFilesList: props.agentFilesList,
        agentIdentity: props.agentIdentityById[agent.id] ?? null,
        jobs: props.cronJobs,
        status: props.cronStatus,
        loading: props.cronLoading,
        error: props.cronError,
        onRefresh: props.onCronRefresh,
      });

    default:
      return nothing;
  }
}
```

### 4.2 Agent 侧边栏 - agent-sidebar.ts

```typescript
/**
 * Agent 侧边栏组件
 * Agent sidebar component
 *
 * 左侧导航：Agent 列表 + 全局配置入口
 * Left navigation: Agent list + global config entry
 */
import { html, nothing } from "lit";
import type { AgentsListResult, AgentIdentityResult } from "../../../ui/types";
import { LABELS } from "../../types/agents-config";

// ─────────────────────────────────────────────────────────────────────────────
// SVG 图标 / SVG Icons
// ─────────────────────────────────────────────────────────────────────────────

const icons = {
  // 刷新图标 / Refresh icon
  refresh: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
  // 供应商图标 / Provider icon
  provider: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>`,
  // Gateway 图标 / Gateway icon
  gateway: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
  // 通道图标 / Channel icon
  channel: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
};

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义 / Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type AgentSidebarProps = {
  agents: AgentsListResult["agents"];
  defaultId: string | null;
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  hasChanges?: boolean;
  connected?: boolean;
  onSelectAgent: (agentId: string) => void;
  onRefresh: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// 辅助函数 / Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 解析 Agent emoji
 * Resolve agent emoji
 */
function resolveAgentEmoji(
  agent: { identity?: { emoji?: string; avatar?: string } },
  agentIdentity?: AgentIdentityResult | null
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

// ─────────────────────────────────────────────────────────────────────────────
// 渲染函数 / Render Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 渲染单个 Agent 行
 * Render a single agent row
 */
function renderAgentRow(props: {
  agent: AgentsListResult["agents"][number];
  defaultId: string | null;
  isSelected: boolean;
  identity: AgentIdentityResult | null;
  onSelect: () => void;
}) {
  const { agent, defaultId, isSelected, identity, onSelect } = props;
  const isDefault = defaultId && agent.id === defaultId;
  const emoji = resolveAgentEmoji(agent, identity);
  const displayName = agent.name?.trim() || identity?.name?.trim() || agent.id;

  return html`
    <button
      type="button"
      class="agents-sidebar__item ${isSelected ? "agents-sidebar__item--active" : ""}"
      @click=${onSelect}
    >
      <span class="agents-sidebar__avatar">
        ${emoji || displayName.slice(0, 1)}
      </span>
      <span class="agents-sidebar__item-content">
        <span class="agents-sidebar__item-name">${displayName}</span>
        <span class="agents-sidebar__item-id">${agent.id}</span>
      </span>
      ${isDefault ? html`<span class="agents-sidebar__badge">${LABELS.status.default}</span>` : nothing}
    </button>
  `;
}

/**
 * 渲染全局配置入口
 * Render global config links
 */
function renderGlobalConfigLinks() {
  return html`
    <div class="agents-sidebar__section">
      <div class="agents-sidebar__section-title">${LABELS.sidebar.globalConfig}</div>
      <nav class="agents-sidebar__links">
        <a href="#providers" class="agents-sidebar__link">
          <span class="agents-sidebar__link-icon">${icons.provider}</span>
          <span>${LABELS.sidebar.providers}</span>
        </a>
        <a href="#gateway" class="agents-sidebar__link">
          <span class="agents-sidebar__link-icon">${icons.gateway}</span>
          <span>${LABELS.sidebar.gateway}</span>
        </a>
        <a href="#channels" class="agents-sidebar__link">
          <span class="agents-sidebar__link-icon">${icons.channel}</span>
          <span>${LABELS.sidebar.channels}</span>
        </a>
      </nav>
    </div>
  `;
}

/**
 * 渲染 Agent 侧边栏
 * Render agent sidebar
 */
export function renderAgentSidebar(props: AgentSidebarProps) {
  return html`
    <aside class="agents-sidebar">
      <!-- Agent 列表头部 / Agent list header -->
      <div class="agents-sidebar__header">
        <div class="agents-sidebar__header-info">
          <h2 class="agents-sidebar__title">${LABELS.sidebar.agents}</h2>
          <span class="agents-sidebar__count">${props.agents.length} ${LABELS.sidebar.agentsCount}</span>
        </div>
        <button
          class="mc-btn mc-btn--icon mc-btn--sm"
          ?disabled=${props.loading}
          @click=${props.onRefresh}
          title=${LABELS.actions.refresh}
        >
          ${icons.refresh}
        </button>
      </div>

      <!-- 错误提示 / Error message -->
      ${props.error
        ? html`<div class="mc-error" style="margin: 0 12px;">${props.error}</div>`
        : nothing}

      <!-- Agent 列表 / Agent list -->
      <div class="agents-sidebar__list">
        ${props.agents.length === 0
          ? html`<div class="agents-sidebar__empty">${props.loading ? LABELS.actions.loading : LABELS.empty.noAgents}</div>`
          : props.agents.map((agent) => renderAgentRow({
              agent,
              defaultId: props.defaultId,
              isSelected: props.selectedId === agent.id,
              identity: props.agentIdentityById[agent.id] ?? null,
              onSelect: () => props.onSelectAgent(agent.id),
            }))}
      </div>

      <!-- 全局配置入口 / Global config links -->
      ${renderGlobalConfigLinks()}

      <!-- 底部状态栏 / Footer status bar -->
      <div class="agents-sidebar__footer">
        <div class="agents-sidebar__status">
          <span class="agents-sidebar__status-dot ${props.connected ? "agents-sidebar__status-dot--ok" : ""}"></span>
          <span class="agents-sidebar__status-text">
            ${props.connected ? LABELS.status.connected : LABELS.status.disconnected}
          </span>
        </div>
        ${props.hasChanges
          ? html`<span class="agents-sidebar__unsaved">${LABELS.status.unsaved}</span>`
          : nothing}
      </div>
    </aside>
  `;
}
```

### 4.3 Agent Header - agent-header.ts

```typescript
/**
 * Agent 头部信息组件
 * Agent header component
 *
 * 显示 Agent 的 emoji、名称、ID 和 badge
 * Display agent emoji, name, ID and badge
 */
import { html, nothing } from "lit";
import type { AgentsListResult, AgentIdentityResult } from "../../../ui/types";
import { LABELS } from "../../types/agents-config";

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义 / Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type AgentHeaderProps = {
  agent: AgentsListResult["agents"][number];
  defaultId: string | null;
  agentIdentity: AgentIdentityResult | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 辅助函数 / Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 解析 Agent emoji（同 agent-sidebar.ts）
 */
function resolveAgentEmoji(
  agent: { identity?: { emoji?: string; avatar?: string } },
  agentIdentity?: AgentIdentityResult | null
): string {
  // ... 同上
}

// ─────────────────────────────────────────────────────────────────────────────
// 渲染函数 / Render Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 渲染 Agent 头部
 * Render agent header
 */
export function renderAgentHeader(props: AgentHeaderProps) {
  const { agent, defaultId, agentIdentity } = props;
  const isDefault = defaultId && agent.id === defaultId;
  const displayName = agent.name?.trim() || agentIdentity?.name?.trim() || agent.id;
  const subtitle = agent.identity?.theme?.trim() || "Agent 工作区和路由配置";
  const emoji = resolveAgentEmoji(agent, agentIdentity);

  return html`
    <header class="agent-header">
      <div class="agent-header__main">
        <span class="agent-header__avatar">
          ${emoji || displayName.slice(0, 1)}
        </span>
        <div class="agent-header__info">
          <h2 class="agent-header__name">${displayName}</h2>
          <p class="agent-header__desc">${subtitle}</p>
        </div>
      </div>
      <div class="agent-header__meta">
        <span class="agent-header__id">${agent.id}</span>
        ${isDefault ? html`<span class="agent-header__badge">${LABELS.status.default}</span>` : nothing}
      </div>
    </header>
  `;
}
```

### 4.4 Agent Tabs - agent-tabs.ts

```typescript
/**
 * Agent Tab 切换栏组件
 * Agent tab navigation component
 *
 * 提供 6 个 Tab 切换：概览、文件、工具、技能、通道、定时任务
 * Provides 6 tabs: Overview, Files, Tools, Skills, Channels, Cron
 */
import { html } from "lit";
import type { AgentPanel } from "../../types/agents-config";
import { LABELS } from "../../types/agents-config";

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义 / Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type AgentTabsProps = {
  active: AgentPanel;
  onSelect: (panel: AgentPanel) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab 定义 / Tab Definitions
// ─────────────────────────────────────────────────────────────────────────────

const TABS: Array<{ id: AgentPanel; label: string }> = [
  { id: "overview", label: LABELS.panels.overview },
  { id: "files", label: LABELS.panels.files },
  { id: "tools", label: LABELS.panels.tools },
  { id: "skills", label: LABELS.panels.skills },
  { id: "channels", label: LABELS.panels.channels },
  { id: "cron", label: LABELS.panels.cron },
];

// ─────────────────────────────────────────────────────────────────────────────
// 渲染函数 / Render Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 渲染 Agent Tab 切换栏
 * Render agent tab navigation
 */
export function renderAgentTabs(props: AgentTabsProps) {
  return html`
    <nav class="agent-tabs">
      ${TABS.map(
        (tab) => html`
          <button
            class="agent-tabs__item ${props.active === tab.id ? "agent-tabs__item--active" : ""}"
            type="button"
            @click=${() => props.onSelect(tab.id)}
          >
            ${tab.label}
          </button>
        `
      )}
    </nav>
  `;
}
```

### 4.5 Agent Overview - agent-overview.ts

```typescript
/**
 * Agent 概览面板组件
 * Agent overview panel component
 *
 * 显示基本信息和模型选择
 * Display basic info and model selection
 */
import { html, nothing } from "lit";
import type { AgentsListResult, AgentIdentityResult, AgentsFilesListResult } from "../../../ui/types";
import { LABELS } from "../../types/agents-config";

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
  const cfg = config as {
    agents?: {
      defaults?: Record<string, unknown>;
      list?: Array<{ id: string; [key: string]: unknown }>;
    };
  } | null;
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
  agentId: string
): string {
  const workspaceFromFiles =
    agentFilesList && agentFilesList.agentId === agentId ? agentFilesList.workspace : null;
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
 */
function resolveAgentEmoji(
  agent: { identity?: { emoji?: string; avatar?: string } },
  agentIdentity?: AgentIdentityResult | null
): string {
  // ... 同前
}

/**
 * 构建模型下拉选项
 * Build model dropdown options
 */
function buildModelOptions(configForm: Record<string, unknown> | null) {
  const cfg = configForm as {
    agents?: { defaults?: { models?: Record<string, { alias?: string }> } };
  } | null;
  const models = cfg?.agents?.defaults?.models;
  if (!models || typeof models !== "object") {
    return html`<option value="" disabled>无可用模型</option>`;
  }

  return Object.entries(models).map(([modelId, modelRaw]) => {
    const alias = modelRaw?.alias?.trim();
    const label = alias && alias !== modelId ? `${alias} (${modelId})` : modelId;
    return html`<option value=${modelId}>${label}</option>`;
  });
}

/**
 * 解析备选模型列表
 * Parse fallback list
 */
function parseFallbackList(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
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
  const identityName = agentIdentity?.name?.trim() ||
                       agent.identity?.name?.trim() ||
                       agent.name?.trim() ||
                       config.entry?.name ||
                       "-";
  const identityEmoji = resolveAgentEmoji(agent, agentIdentity) || "-";
  const skillFilter = Array.isArray(config.entry?.skills) ? config.entry?.skills : null;
  const skillCount = skillFilter?.length ?? null;
  const isDefault = Boolean(props.defaultId && agent.id === props.defaultId);
  const identityStatus = agentIdentityLoading
    ? LABELS.actions.loading
    : agentIdentityError
      ? "不可用"
      : "";

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
              ${identityStatus
                ? html`<span class="mc-kv__sub">${identityStatus}</span>`
                : nothing}
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
                ?disabled=${!configForm || configLoading || configSaving}
                @change=${(e: Event) =>
                  onModelChange(agent.id, (e.target as HTMLSelectElement).value || null)}
              >
                <option value="">${LABELS.overview.inheritDefault}</option>
                ${buildModelOptions(configForm)}
              </select>
            </label>
            <label class="mc-field">
              <span class="mc-field__label">${LABELS.overview.fallbacks}</span>
              <input
                type="text"
                class="mc-input"
                placeholder="provider/model, provider/model"
                ?disabled=${!configForm || configLoading || configSaving}
                @input=${(e: Event) =>
                  onModelFallbacksChange(
                    agent.id,
                    parseFallbackList((e.target as HTMLInputElement).value)
                  )}
              />
            </label>
          </div>
        </div>
      </div>

      <!-- 操作按钮 / Action buttons -->
      <div class="mc-actions" style="margin-top: 16px;">
        <button
          class="mc-btn mc-btn--sm"
          ?disabled=${configLoading || configSaving}
          @click=${onConfigReload}
        >
          ${icons.refresh}
          ${configLoading ? LABELS.actions.loading : LABELS.actions.reload}
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
```

### 4.6 Agent Tools - agent-tools.ts

```typescript
/**
 * Agent 工具配置面板组件
 * Agent tools configuration panel component
 *
 * 配置 Agent 可用的工具集
 * Configure available tools for agent
 */
import { html, nothing } from "lit";
import { LABELS } from "../../types/agents-config";

// ─────────────────────────────────────────────────────────────────────────────
// 工具分类定义 / Tool Sections Definition
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_SECTIONS = [
  {
    id: "fs",
    label: LABELS.tools.sections.fs,
    tools: [
      { id: "read", label: "read", description: "读取文件内容" },
      { id: "write", label: "write", description: "创建或覆盖文件" },
      { id: "edit", label: "edit", description: "精确编辑文件" },
      { id: "apply_patch", label: "apply_patch", description: "应用补丁 (OpenAI)" },
    ],
  },
  {
    id: "runtime",
    label: LABELS.tools.sections.runtime,
    tools: [
      { id: "exec", label: "exec", description: "执行 shell 命令" },
      { id: "process", label: "process", description: "管理后台进程" },
    ],
  },
  {
    id: "web",
    label: LABELS.tools.sections.web,
    tools: [
      { id: "web_search", label: "web_search", description: "搜索网络" },
      { id: "web_fetch", label: "web_fetch", description: "获取网页内容" },
    ],
  },
  {
    id: "memory",
    label: LABELS.tools.sections.memory,
    tools: [
      { id: "memory_search", label: "memory_search", description: "语义搜索" },
      { id: "memory_get", label: "memory_get", description: "读取记忆文件" },
    ],
  },
  {
    id: "sessions",
    label: LABELS.tools.sections.sessions,
    tools: [
      { id: "sessions_list", label: "sessions_list", description: "列出会话" },
      { id: "sessions_history", label: "sessions_history", description: "会话历史" },
      { id: "sessions_send", label: "sessions_send", description: "发送到会话" },
      { id: "sessions_spawn", label: "sessions_spawn", description: "生成子 Agent" },
      { id: "session_status", label: "session_status", description: "会话状态" },
    ],
  },
  {
    id: "ui",
    label: LABELS.tools.sections.ui,
    tools: [
      { id: "browser", label: "browser", description: "控制网页浏览器" },
      { id: "canvas", label: "canvas", description: "控制画布" },
    ],
  },
  {
    id: "messaging",
    label: LABELS.tools.sections.messaging,
    tools: [{ id: "message", label: "message", description: "发送消息" }],
  },
  {
    id: "automation",
    label: LABELS.tools.sections.automation,
    tools: [
      { id: "cron", label: "cron", description: "定时任务" },
      { id: "gateway", label: "gateway", description: "Gateway 控制" },
    ],
  },
];

/**
 * 工具 Profile 选项
 * Tool profile options
 */
const PROFILE_OPTIONS = [
  { id: "minimal", label: LABELS.tools.profiles.minimal },
  { id: "coding", label: LABELS.tools.profiles.coding },
  { id: "messaging", label: LABELS.tools.profiles.messaging },
  { id: "full", label: LABELS.tools.profiles.full },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义 / Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type AgentToolsProps = {
  agentId: string;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  onProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => void;
  onConfigReload: () => void;
  onConfigSave: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// 辅助函数 / Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 解析 Agent 工具配置
 * Resolve agent tools config
 */
function resolveAgentTools(configForm: Record<string, unknown> | null, agentId: string) {
  const cfg = configForm as {
    agents?: {
      list?: Array<{
        id: string;
        tools?: {
          profile?: string;
          allow?: string[];
          alsoAllow?: string[];
          deny?: string[];
        };
      }>;
    };
    tools?: {
      allow?: string[];
      deny?: string[];
    };
  } | null;

  const agent = cfg?.agents?.list?.find((a) => a.id === agentId);
  return {
    profile: agent?.tools?.profile ?? "coding",
    allow: agent?.tools?.allow ?? [],
    alsoAllow: agent?.tools?.alsoAllow ?? [],
    deny: agent?.tools?.deny ?? [],
    globalAllow: cfg?.tools?.allow ?? [],
    globalDeny: cfg?.tools?.deny ?? [],
  };
}

/**
 * 判断工具是否被允许
 * Check if tool is allowed
 */
function isToolAllowed(toolId: string, tools: ReturnType<typeof resolveAgentTools>): boolean {
  return tools.allow.includes(toolId) || tools.alsoAllow.includes(toolId);
}

/**
 * 判断工具是否被禁止
 * Check if tool is denied
 */
function isToolDenied(toolId: string, tools: ReturnType<typeof resolveAgentTools>): boolean {
  return tools.deny.includes(toolId) || tools.globalDeny.includes(toolId);
}

// ─────────────────────────────────────────────────────────────────────────────
// 渲染函数 / Render Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 渲染单个工具开关
 * Render a single tool toggle
 */
function renderToolToggle(props: {
  tool: { id: string; label: string; description: string };
  isAllowed: boolean;
  isDenied: boolean;
  disabled: boolean;
  onToggle: (allowed: boolean) => void;
}) {
  const { tool, isAllowed, isDenied, disabled, onToggle } = props;
  const status = isDenied ? "denied" : isAllowed ? "allowed" : "default";

  return html`
    <div class="tool-item ${status === "denied" ? "tool-item--denied" : status === "allowed" ? "tool-item--allowed" : ""}">
      <div class="tool-item__info">
        <span class="tool-item__name">${tool.label}</span>
        <span class="tool-item__desc">${tool.description}</span>
      </div>
      <div class="tool-item__actions">
        <button
          class="mc-btn mc-btn--xs ${status === "allowed" ? "mc-btn--success" : ""}"
          type="button"
          ?disabled=${disabled}
          @click=${() => onToggle(true)}
          title="允许"
        >
          ✓
        </button>
        <button
          class="mc-btn mc-btn--xs ${status === "denied" ? "mc-btn--danger" : ""}"
          type="button"
          ?disabled=${disabled}
          @click=${() => onToggle(false)}
          title="禁止"
        >
          ✗
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染 Agent 工具配置面板
 * Render agent tools configuration panel
 */
export function renderAgentTools(props: AgentToolsProps) {
  const { agentId, configForm, configLoading, configSaving, configDirty } = props;
  const agentTools = resolveAgentTools(configForm, agentId);

  return html`
    <div class="mc-section">
      <div class="mc-section__header">
        <div class="mc-section__titles">
          <h3 class="mc-section__title">${LABELS.tools.title}</h3>
          <p class="mc-section__desc">${LABELS.tools.desc}</p>
        </div>
      </div>

      <!-- Profile 选择 / Profile selection -->
      <div class="mc-card">
        <div class="mc-card__header">
          <h4 class="mc-card__title">${LABELS.tools.profile}</h4>
        </div>
        <div class="mc-card__content">
          <div class="mc-btn-group">
            ${PROFILE_OPTIONS.map(
              (option) => html`
                <button
                  class="mc-btn mc-btn--sm ${agentTools.profile === option.id ? "mc-btn--primary" : ""}"
                  type="button"
                  ?disabled=${configLoading || configSaving}
                  @click=${() => props.onProfileChange(agentId, option.id, false)}
                >
                  ${option.label}
                </button>
              `
            )}
          </div>
        </div>
      </div>

      <!-- 工具列表 / Tools list -->
      <div class="tools-sections">
        ${TOOL_SECTIONS.map(
          (section) => html`
            <div class="mc-card" style="margin-top: 16px;">
              <div class="mc-card__header">
                <h4 class="mc-card__title">${section.label}</h4>
              </div>
              <div class="mc-card__content">
                <div class="tools-grid">
                  ${section.tools.map(
                    (tool) => renderToolToggle({
                      tool,
                      isAllowed: isToolAllowed(tool.id, agentTools),
                      isDenied: isToolDenied(tool.id, agentTools),
                      disabled: configLoading || configSaving,
                      onToggle: (allowed) => {
                        const alsoAllow = [...(agentTools.alsoAllow || [])];
                        const deny = [...(agentTools.deny || [])];

                        if (allowed) {
                          const denyIndex = deny.indexOf(tool.id);
                          if (denyIndex >= 0) deny.splice(denyIndex, 1);
                          if (!alsoAllow.includes(tool.id)) alsoAllow.push(tool.id);
                        } else {
                          const allowIndex = alsoAllow.indexOf(tool.id);
                          if (allowIndex >= 0) alsoAllow.splice(allowIndex, 1);
                          if (!deny.includes(tool.id)) deny.push(tool.id);
                        }

                        props.onOverridesChange(agentId, alsoAllow, deny);
                      },
                    })
                  )}
                </div>
              </div>
            </div>
          `
        )}
      </div>

      <!-- 操作按钮 / Action buttons -->
      <div class="mc-actions" style="margin-top: 16px;">
        <button
          class="mc-btn mc-btn--sm"
          ?disabled=${configLoading || configSaving}
          @click=${props.onConfigReload}
        >
          ${configLoading ? LABELS.actions.loading : LABELS.actions.reload}
        </button>
        <button
          class="mc-btn mc-btn--sm mc-btn--primary"
          ?disabled=${!configDirty || configLoading || configSaving}
          @click=${props.onConfigSave}
        >
          ${configSaving ? LABELS.actions.saving : LABELS.actions.save}
        </button>
      </div>
    </div>
  `;
}
```

---

## 五、控制器设计

### 5.1 agents-config.ts 控制器

```typescript
/**
 * Agent 配置控制器
 * Agent configuration controller
 *
 * 管理 Agent 配置的状态和业务逻辑
 * Manage agent configuration state and business logic
 */
import type { AgentPanel, AgentsConfigProps } from "../types/agents-config";

// ─────────────────────────────────────────────────────────────────────────────
// 状态类型定义 / State Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Agent 配置控制器状态
 * Agent configuration controller state
 */
export type AgentsConfigState = {
  // Agent 列表 / Agent list
  agentsList: AgentsConfigProps["agentsList"];
  selectedAgentId: string | null;
  activePanel: AgentPanel;

  // 加载状态 / Loading states
  loading: boolean;
  error: string | null;

  // 配置表单 / Config form
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  originalConfig: Record<string, unknown> | null;

  // Agent 身份 / Agent identity
  agentIdentityById: Record<string, AgentsConfigProps["agentIdentityById"][string]>;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;

  // Agent 文件 / Agent files
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsConfigProps["agentFilesList"];
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;

  // 通道状态 / Channels status
  channelsLoading: boolean;
  channelsError: string | null;
  channelsSnapshot: AgentsConfigProps["channelsSnapshot"];
  channelsLastSuccess: number | null;

  // 定时任务 / Cron jobs
  cronLoading: boolean;
  cronStatus: AgentsConfigProps["cronStatus"];
  cronJobs: AgentsConfigProps["cronJobs"];
  cronError: string | null;

  // 技能管理 / Skills management
  agentSkillsLoading: boolean;
  agentSkillsReport: AgentsConfigProps["agentSkillsReport"];
  agentSkillsError: string | null;
  agentSkillsAgentId: string | null;
  skillsFilter: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// 初始状态 / Initial State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建初始状态
 * Create initial state
 */
export function createInitialState(): AgentsConfigState {
  return {
    agentsList: null,
    selectedAgentId: null,
    activePanel: "overview",
    loading: false,
    error: null,
    configForm: null,
    configLoading: false,
    configSaving: false,
    configDirty: false,
    originalConfig: null,
    agentIdentityById: {},
    agentIdentityLoading: false,
    agentIdentityError: null,
    agentFilesLoading: false,
    agentFilesError: null,
    agentFilesList: null,
    agentFileActive: null,
    agentFileContents: {},
    agentFileDrafts: {},
    agentFileSaving: false,
    channelsLoading: false,
    channelsError: null,
    channelsSnapshot: null,
    channelsLastSuccess: null,
    cronLoading: false,
    cronStatus: null,
    cronJobs: [],
    cronError: null,
    agentSkillsLoading: false,
    agentSkillsReport: null,
    agentSkillsError: null,
    agentSkillsAgentId: null,
    skillsFilter: "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 动作类型 / Action Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 控制器动作类型
 * Controller action types
 */
export type AgentsConfigAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_AGENTS_LIST"; payload: AgentsConfigState["agentsList"] }
  | { type: "SELECT_AGENT"; payload: string }
  | { type: "SELECT_PANEL"; payload: AgentPanel }
  | { type: "SET_CONFIG_FORM"; payload: Record<string, unknown> | null }
  | { type: "SET_CONFIG_LOADING"; payload: boolean }
  | { type: "SET_CONFIG_SAVING"; payload: boolean }
  | { type: "SET_CONFIG_DIRTY"; payload: boolean }
  | { type: "UPDATE_CONFIG"; payload: Partial<Record<string, unknown>> }
  // ... 其他动作
  ;

// ─────────────────────────────────────────────────────────────────────────────
// Reducer / Reducer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 控制器 Reducer
 * Controller reducer
 */
export function agentsConfigReducer(
  state: AgentsConfigState,
  action: AgentsConfigAction
): AgentsConfigState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_AGENTS_LIST":
      return { ...state, agentsList: action.payload };
    case "SELECT_AGENT":
      return { ...state, selectedAgentId: action.payload };
    case "SELECT_PANEL":
      return { ...state, activePanel: action.payload };
    case "SET_CONFIG_FORM":
      return {
        ...state,
        configForm: action.payload,
        originalConfig: action.payload ? JSON.parse(JSON.stringify(action.payload)) : null,
        configDirty: false,
      };
    case "SET_CONFIG_LOADING":
      return { ...state, configLoading: action.payload };
    case "SET_CONFIG_SAVING":
      return { ...state, configSaving: action.payload };
    case "SET_CONFIG_DIRTY":
      return { ...state, configDirty: action.payload };
    case "UPDATE_CONFIG":
      return {
        ...state,
        configForm: state.configForm
          ? { ...state.configForm, ...action.payload }
          : action.payload,
        configDirty: true,
      };
    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API 调用函数 / API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 获取 Agent 列表
 * Fetch agents list
 */
export async function fetchAgentsList(baseUrl: string): Promise<AgentsConfigState["agentsList"]> {
  const response = await fetch(`${baseUrl}/api/agents`);
  if (!response.ok) {
    throw new Error(`获取 Agent 列表失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 获取配置
 * Fetch config
 */
export async function fetchConfig(baseUrl: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/api/config`);
  if (!response.ok) {
    throw new Error(`获取配置失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 保存配置
 * Save config
 */
export async function saveConfig(
  baseUrl: string,
  config: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`保存配置失败: ${response.statusText}`);
  }
}

/**
 * 获取 Agent 文件列表
 * Fetch agent files
 */
export async function fetchAgentFiles(
  baseUrl: string,
  agentId: string
): Promise<AgentsConfigState["agentFilesList"]> {
  const response = await fetch(`${baseUrl}/api/agents/${agentId}/files`);
  if (!response.ok) {
    throw new Error(`获取 Agent 文件失败: ${response.statusText}`);
  }
  return response.json();
}
```

---

## 六、数据流设计

### 6.1 数据流图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Gateway API                                    │
│  /api/agents  /api/config  /api/channels  /api/cron  /api/skills        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Controller (agents-config.ts)                       │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                           State                                   │   │
│  │  - agentsList                - configForm                         │   │
│  │  - selectedAgentId           - agentFilesList                     │   │
│  │  - activePanel               - channelsSnapshot                   │   │
│  │  - agentIdentityById         - cronJobs                           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                          Actions                                  │   │
│  │  - fetchAgentsList()         - saveConfig()                       │   │
│  │  - selectAgent()             - loadFiles()                        │   │
│  │  - selectPanel()             - refreshChannels()                  │   │
│  │  - updateConfig()            - refreshCron()                      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         View (agents-config.ts)                          │
│                                                                          │
│  renderAgentsConfig(props)                                               │
│       │                                                                  │
│       ├── renderAgentSidebar()     ← Agent 列表 + 全局配置入口           │
│       │                                                                  │
│       └── renderActivePanel()                                            │
│               │                                                          │
│               ├── renderAgentHeader()                                    │
│               ├── renderAgentTabs()                                      │
│               └── [activePanel]                                          │
│                       ├── renderAgentOverview()                          │
│                       ├── renderAgentFiles()                             │
│                       ├── renderAgentTools()                             │
│                       ├── renderAgentSkills()                            │
│                       ├── renderAgentChannels()                          │
│                       └── renderAgentCron()                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 状态更新流程

```
用户操作                    Controller                      View
   │                           │                             │
   │  点击 Agent               │                             │
   ├─────────────────────────►│                             │
   │                           │  dispatch(SELECT_AGENT)     │
   │                           │  dispatch(SET_LOADING)      │
   │                           │  fetchAgentIdentity()       │
   │                           │  fetchAgentFiles()          │
   │                           ├────────────────────────────►│
   │                           │                             │  重新渲染
   │                           │                             │
   │  切换 Tab                 │                             │
   ├─────────────────────────►│                             │
   │                           │  dispatch(SELECT_PANEL)     │
   │                           │  lazyLoadPanelData()        │
   │                           ├────────────────────────────►│
   │                           │                             │  重新渲染
   │                           │                             │
   │  修改配置                 │                             │
   ├─────────────────────────►│                             │
   │                           │  dispatch(UPDATE_CONFIG)    │
   │                           │  dispatch(SET_CONFIG_DIRTY) │
   │                           ├────────────────────────────►│
   │                           │                             │  重新渲染
   │                           │                             │  (显示保存按钮)
   │  点击保存                 │                             │
   ├─────────────────────────►│                             │
   │                           │  dispatch(SET_CONFIG_SAVING)│
   │                           │  saveConfig()               │
   │                           │  dispatch(SET_CONFIG_DIRTY) │
   │                           ├────────────────────────────►│
   │                           │                             │  重新渲染
```

---

## 七、迁移策略

### 7.1 渐进式迁移步骤

| 阶段 | 目标 | 工作内容 |
|------|------|----------|
| 阶段 1 | 基础架构 | 创建类型定义、目录结构、空组件骨架 |
| 阶段 2 | 侧边栏 | 实现 Agent 侧边栏 + 全局配置入口 |
| 阶段 3 | 核心面板 | 实现 Overview、Files、Tools 三个核心 Tab |
| 阶段 4 | 扩展面板 | 实现 Skills、Channels、Cron 三个 Tab |
| 阶段 5 | 集成测试 | 端到端测试，修复 bug |
| 阶段 6 | 切换默认 | 将新视图设为默认，保留旧视图作为回退 |

### 7.2 兼容性处理

```typescript
// views/model-config.ts（修改后）
// 路由层：根据 section 决定渲染哪个视图
// Router layer: decide which view to render based on section

import { renderAgentsConfig } from "./agents-config";
import { renderGlobalConfig } from "./global-config";

export function renderModelConfig(props: ModelConfigProps) {
  const { activeSection } = props;

  // Agent-centric 视图（默认）/ Agent-centric view (default)
  if (activeSection === "agents" || !activeSection) {
    return renderAgentsConfig(toAgentsConfigProps(props));
  }

  // 全局配置视图 / Global config view
  if (["providers", "gateway", "channels"].includes(activeSection)) {
    return renderGlobalConfig(toGlobalConfigProps(props));
  }

  // 其他保留原有逻辑... / Keep original logic for others...
}
```

### 7.3 复用现有代码

以下函数/组件可直接从 `ui/views/agents.ts` 复用或移植：

| 函数 | 来源行号 | 用途 |
|------|----------|------|
| `normalizeAgentLabel()` | agents.ts:209 | 获取 Agent 显示名称 |
| `resolveAgentEmoji()` | agents.ts:237 | 解析 Agent emoji |
| `isLikelyEmoji()` | agents.ts:213 | 判断是否为 emoji |
| `resolveAgentConfig()` | agents.ts:281 | 从配置获取 Agent 条目 |
| `resolveModelLabel()` | agents.ts:335 | 格式化模型标签 |
| `buildModelOptions()` | agents.ts:440 | 构建模型下拉选项 |
| `TOOL_SECTIONS` | agents.ts:85 | 工具分类定义 |
| `PROFILE_OPTIONS` | agents.ts:169 | Profile 选项 |

---

## 八、实施步骤

### 8.1 详细任务清单

```
□ 阶段 1：基础架构
  □ 1.1 创建 types/agents-config.ts
  □ 1.2 创建 components/agent/ 目录结构
  □ 1.3 创建空组件文件（带类型签名）
  □ 1.4 创建 views/agents-config.ts 骨架
  □ 1.5 创建 controllers/agents-config.ts 骨架

□ 阶段 2：侧边栏实现
  □ 2.1 实现 agent-sidebar.ts
  □ 2.2 实现 Agent 列表渲染
  □ 2.3 实现 Agent 选中状态
  □ 2.4 添加全局配置入口链接
  □ 2.5 添加必要的 CSS 样式

□ 阶段 3：核心面板实现
  □ 3.1 实现 agent-header.ts
  □ 3.2 实现 agent-tabs.ts
  □ 3.3 实现 agent-overview.ts
       □ 基本信息展示
       □ 模型选择功能
  □ 3.4 实现 agent-files.ts
       □ 文件列表
       □ 文件编辑器
       □ 保存功能
  □ 3.5 实现 agent-tools.ts
       □ Profile 选择
       □ 工具开关

□ 阶段 4：扩展面板实现
  □ 4.1 实现 agent-skills.ts
       □ 技能列表
       □ 过滤功能
       □ 启用/禁用
  □ 4.2 实现 agent-channels.ts
       □ 通道状态展示
       □ 刷新功能
  □ 4.3 实现 agent-cron.ts
       □ 定时任务列表
       □ 状态展示

□ 阶段 5：集成与测试
  □ 5.1 集成到 model-config.ts
  □ 5.2 控制器状态管理完善
  □ 5.3 API 调用测试
  □ 5.4 端到端功能测试
  □ 5.5 修复发现的 bug

□ 阶段 6：上线切换
  □ 6.1 设为默认视图
  □ 6.2 添加回退开关（可选）
  □ 6.3 更新 README 文档
```

### 8.2 CSS 样式（沿用 ui-zh-CN BEM 规范）

```css
/* 以下样式遵循 ui-zh-CN 现有的 BEM 命名规范 */

/* ========== 布局 / Layout ========== */

.agents-config-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 0;
  height: 100%;
  overflow: hidden;
}

.agents-config-main {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 20px;
  gap: 16px;
}

.agents-config-content {
  flex: 1;
}

/* ========== Agent 侧边栏 / Agent Sidebar ========== */

.agents-sidebar {
  display: flex;
  flex-direction: column;
  background: var(--sidebar-bg, #f8f9fa);
  border-right: 1px solid var(--border-color, #e5e7eb);
  height: 100%;
  overflow: hidden;
}

.agents-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.agents-sidebar__header-info {
  display: flex;
  flex-direction: column;
}

.agents-sidebar__title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.agents-sidebar__count {
  font-size: 12px;
  color: var(--text-muted, #6b7280);
}

.agents-sidebar__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.agents-sidebar__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s;
}

.agents-sidebar__item:hover {
  background: var(--hover-bg, rgba(0, 0, 0, 0.04));
}

.agents-sidebar__item--active {
  background: var(--active-bg, rgba(59, 130, 246, 0.1));
}

.agents-sidebar__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--avatar-bg, #e5e7eb);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.agents-sidebar__item-content {
  flex: 1;
  min-width: 0;
}

.agents-sidebar__item-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.agents-sidebar__item-id {
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  font-family: var(--font-mono, monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.agents-sidebar__badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--accent-color, #3b82f6);
  color: white;
  flex-shrink: 0;
}

.agents-sidebar__empty {
  padding: 20px;
  text-align: center;
  color: var(--text-muted, #6b7280);
  font-size: 13px;
}

.agents-sidebar__section {
  padding: 12px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.agents-sidebar__section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
  text-transform: uppercase;
  margin-bottom: 8px;
}

.agents-sidebar__links {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agents-sidebar__link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  text-decoration: none;
  color: var(--text-primary, #374151);
  font-size: 13px;
  transition: background-color 0.15s;
}

.agents-sidebar__link:hover {
  background: var(--hover-bg, rgba(0, 0, 0, 0.04));
}

.agents-sidebar__link-icon {
  width: 16px;
  height: 16px;
  opacity: 0.7;
}

.agents-sidebar__link-icon svg {
  width: 100%;
  height: 100%;
}

.agents-sidebar__footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color, #e5e7eb);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.agents-sidebar__status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.agents-sidebar__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted, #6b7280);
}

.agents-sidebar__status-dot--ok {
  background: var(--success-color, #10b981);
}

.agents-sidebar__status-text {
  font-size: 12px;
  color: var(--text-muted, #6b7280);
}

.agents-sidebar__unsaved {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--warning-bg, #fef3c7);
  color: var(--warning-color, #d97706);
}

/* ========== Agent 头部 / Agent Header ========== */

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--card-bg, white);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
}

.agent-header__main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-header__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--avatar-bg, #e5e7eb);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.agent-header__info {
  display: flex;
  flex-direction: column;
}

.agent-header__name {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.agent-header__desc {
  font-size: 13px;
  color: var(--text-muted, #6b7280);
  margin: 2px 0 0;
}

.agent-header__meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-header__id {
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted, #6b7280);
}

.agent-header__badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--accent-color, #3b82f6);
  color: white;
}

/* ========== Agent Tabs / Agent Tabs ========== */

.agent-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  padding-bottom: 0;
}

.agent-tabs__item {
  padding: 10px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-muted, #6b7280);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.agent-tabs__item:hover {
  color: var(--text-primary, #374151);
}

.agent-tabs__item--active {
  color: var(--accent-color, #3b82f6);
  border-bottom-color: var(--accent-color, #3b82f6);
}

/* ========== 工具面板 / Tools Panel ========== */

.tools-sections {
  display: flex;
  flex-direction: column;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.tool-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--tool-bg, #f9fafb);
  border-radius: 6px;
  border-left: 3px solid transparent;
}

.tool-item--allowed {
  border-left-color: var(--success-color, #10b981);
}

.tool-item--denied {
  border-left-color: var(--danger-color, #ef4444);
  opacity: 0.6;
}

.tool-item__info {
  flex: 1;
  min-width: 0;
}

.tool-item__name {
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  display: block;
}

.tool-item__desc {
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  display: block;
}

.tool-item__actions {
  display: flex;
  gap: 4px;
}

/* ========== 通用样式扩展 / Common Style Extensions ========== */

.mc-grid--3col {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.mc-kv {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mc-kv__label {
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  text-transform: uppercase;
  font-weight: 500;
}

.mc-kv__value {
  font-size: 14px;
}

.mc-kv__value--mono {
  font-family: var(--font-mono, monospace);
}

.mc-kv__sub {
  font-size: 11px;
  color: var(--text-muted, #6b7280);
}

.mc-actions {
  display: flex;
  gap: 8px;
}

.mc-btn-group {
  display: flex;
  gap: 4px;
}

.mc-btn--icon {
  padding: 6px;
}

.mc-btn--icon svg {
  width: 16px;
  height: 16px;
}

.mc-btn--success {
  background: var(--success-color, #10b981);
  color: white;
}

.mc-btn--danger {
  background: var(--danger-color, #ef4444);
  color: white;
}

.mc-btn--xs {
  padding: 4px 8px;
  font-size: 11px;
}
```

---

## 附录

### A. 参考文件

| 文件 | 路径 | 说明 |
|------|------|------|
| agents.ts | `ui/src/ui/views/agents.ts` | 原版 Agent 视图（设计参考）|
| config-sidebar.ts | `ui/src/ui-zh-CN/components/config-sidebar.ts` | 现有侧边栏（样式参考）|
| agent-content.ts | `ui/src/ui-zh-CN/components/agent-content.ts` | 现有 Agent 内容（样式参考）|
| model-config.ts | `ui/src/ui-zh-CN/views/model-config.ts` | 现有中文配置视图 |

### B. 术语表

| 中文 | 英文 | 说明 |
|------|------|------|
| 概览 | Overview | Agent 基本信息面板 |
| 文件 | Files | 工作区文件编辑 |
| 工具 | Tools | 工具配置 |
| 技能 | Skills | 技能过滤和管理 |
| 通道 | Channels | 消息通道状态 |
| 定时任务 | Cron Jobs | 定时任务管理 |
| 模型供应商 | Providers | AI 模型提供商配置 |

### C. 变更日志

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0 | 2024-XX-XX | 初始设计文档 |
| v1.1 | 2024-XX-XX | 更新为 ui-zh-CN 样式风格，使用中文注释 |

---

*文档结束*
