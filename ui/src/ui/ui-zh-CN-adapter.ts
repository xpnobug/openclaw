/**
 * ui-zh-CN 适配层
 * 将所有 ui-zh-CN 引用集中到此文件，减少主 UI 文件的耦合
 *
 * Adapter layer for ui-zh-CN module
 * Centralizes all ui-zh-CN references to reduce coupling in main UI files
 */
import { html, nothing } from "lit";

import type { AppViewState } from "./app-view-state";
import type { CronJob } from "./types";
import type { CronFormState } from "./ui-types";
import { DEFAULT_CRON_FORM } from "./app-defaults";

// ============================================
// 类型重导出 / Type re-exports
// ============================================

// 从 views/model-config
export type {
  ProviderConfig,
  AgentDefaults,
  GatewayConfig,
  ModelConfig,
  ModelApi,
  AuthMode,
  ModelCost,
  ModelCompat,
  ModelConfigProps,
} from "../ui-zh-CN/views/model-config";

// 从 controllers/model-config
export type {
  ExecApprovalsSnapshot,
  ExecApprovalsFile,
  ExecApprovalsAllowlistEntry,
  AgentOption,
  WorkspaceFileInfo,
  SessionRow,
  SessionsListResult as AgentSessionsListResult,
  ToolProfileId,
  ToolPolicyConfig,
  ToolsConfig,
  AgentToolsConfig,
  AgentWithTools,
  PermissionsTabId,
  AgentIdentityEntry,
  ExecApprovalsTarget,
  ExecApprovalsTargetNode,
} from "../ui-zh-CN/controllers/model-config";

// 从 components/providers-content
export type { ProviderFormState } from "../ui-zh-CN/components/providers-content";

// 从 components/workspace-content
export type { WorkspaceAgentOption } from "../ui-zh-CN/components/workspace-content";

// 从 types/config-sections
export type { ConfigSectionId, ConfigSection } from "../ui-zh-CN/types/config-sections";

// 从 types/channel-config
export type { ChannelsConfigData } from "../ui-zh-CN/types/channel-config";

// 从 types/skills-config
export type {
  SkillsConfig,
  SkillSourceFilter,
  SkillStatusFilter,
  SkillEditState,
  SkillMessage as SkillConfigMessage,
  SkillEditorState,
  SkillCreateState,
  SkillDeleteState,
  EditableSkillSource,
  SkillEditorMode,
  SkillInstallOption,
  SkillStatusEntry,
  SkillEntryConfig,
  SkillsLoadConfig,
  SkillsInstallConfig,
  SkillGroup,
  SkillFileInfo,
  SkillFilesListResult,
} from "../ui-zh-CN/types/skills-config";

// ============================================
// 控制器函数重导出 / Controller function re-exports
// ============================================

// model-config 控制器
export {
  loadModelConfig,
  saveModelConfig,
  applyModelConfig,
  toggleProviderExpanded,
  addProvider,
  removeProvider,
  renameProvider,
  updateProviderField,
  addModel,
  removeModel,
  updateModelField,
  updateAgentDefaults,
  updateGatewayConfig,
  getAvailableModels,
  hasModelConfigChanges,
  setActiveSection,
  getPermissionsAgents,
  loadPermissions,
  savePermissions,
  selectPermissionsAgent,
  updatePermissionsFormValue,
  removePermissionsFormValue,
  addPermissionsAllowlistEntry,
  removePermissionsAllowlistEntry,
  addPermissionsAgent,
  removePermissionsAgent,
  setPermissionsActiveTab,
  resolveExecApprovalsNodes,
  getToolsAgents,
  selectToolsAgent,
  toggleToolsExpanded,
  updateGlobalToolsConfig,
  updateAgentToolsConfig,
  addGlobalToolsDenyEntry,
  removeGlobalToolsDenyEntry,
  addAgentToolsDenyEntry,
  removeAgentToolsDenyEntry,
  loadAgentSessions,
  patchSessionModel,
  loadWorkspaceFiles,
  selectWorkspaceFile,
  saveWorkspaceFile,
  createWorkspaceFile,
  showAddProviderModal,
  updateAddProviderForm,
  confirmAddProvider,
} from "../ui-zh-CN/controllers/model-config";

// skills-config 控制器
export {
  loadSkillsStatus as loadSkillsConfig,
  saveSkillsConfig,
  updateSkillEnabled as updateSkillEnabledConfig,
  saveSkillApiKey as saveSkillApiKeyConfig,
  installSkillDependency,
  updateSkillsFilter,
  updateSkillsSourceFilter,
  updateSkillsStatusFilter,
  toggleSkillsGroup,
  selectSkill,
  updateSkillApiKeyEdit as updateSkillApiKeyEditConfig,
  setAllowlistMode,
  toggleAllowlistEntry,
  updateGlobalSetting,
  hasSkillsConfigChanges,
  updateSkillEnv as updateSkillEnvConfig,
  removeSkillEnv as removeSkillEnvConfig,
  updateSkillConfig as updateSkillConfigConfig,
  updateExtraDirs as updateExtraDirsConfig,
  openSkillEditor,
  closeSkillEditor,
  updateEditorContent,
  updateEditorMode,
  saveSkillFile,
  openCreateSkill,
  closeCreateSkill,
  updateCreateSkillName,
  updateCreateSkillSource,
  confirmCreateSkill,
  openDeleteSkill,
  closeDeleteSkill,
  confirmDeleteSkill,
} from "../ui-zh-CN/controllers/skills-config";

// 视图渲染
import { renderModelConfig } from "../ui-zh-CN/views/model-config";
import {
  loadModelConfig as loadModelConfigInternal,
  saveModelConfig as saveModelConfigInternal,
  applyModelConfig as applyModelConfigInternal,
  toggleProviderExpanded as toggleProviderExpandedInternal,
  addProvider as addProviderInternal,
  removeProvider as removeProviderInternal,
  renameProvider as renameProviderInternal,
  updateProviderField as updateProviderFieldInternal,
  addModel as addModelInternal,
  removeModel as removeModelInternal,
  updateModelField as updateModelFieldInternal,
  updateAgentDefaults as updateAgentDefaultsInternal,
  updateGatewayConfig as updateGatewayConfigInternal,
  getAvailableModels as getAvailableModelsInternal,
  hasModelConfigChanges as hasModelConfigChangesInternal,
  setActiveSection as setActiveSectionInternal,
  getPermissionsAgents as getPermissionsAgentsInternal,
  loadPermissions as loadPermissionsInternal,
  savePermissions as savePermissionsInternal,
  selectPermissionsAgent as selectPermissionsAgentInternal,
  updatePermissionsFormValue as updatePermissionsFormValueInternal,
  removePermissionsFormValue as removePermissionsFormValueInternal,
  addPermissionsAllowlistEntry as addPermissionsAllowlistEntryInternal,
  removePermissionsAllowlistEntry as removePermissionsAllowlistEntryInternal,
  addPermissionsAgent as addPermissionsAgentInternal,
  removePermissionsAgent as removePermissionsAgentInternal,
  resolveExecApprovalsNodes as resolveExecApprovalsNodesInternal,
  getToolsAgents as getToolsAgentsInternal,
  selectToolsAgent as selectToolsAgentInternal,
  toggleToolsExpanded as toggleToolsExpandedInternal,
  updateGlobalToolsConfig as updateGlobalToolsConfigInternal,
  updateAgentToolsConfig as updateAgentToolsConfigInternal,
  addGlobalToolsDenyEntry as addGlobalToolsDenyEntryInternal,
  removeGlobalToolsDenyEntry as removeGlobalToolsDenyEntryInternal,
  addAgentToolsDenyEntry as addAgentToolsDenyEntryInternal,
  removeAgentToolsDenyEntry as removeAgentToolsDenyEntryInternal,
  loadAgentSessions as loadAgentSessionsInternal,
  patchSessionModel as patchSessionModelInternal,
  loadWorkspaceFiles as loadWorkspaceFilesInternal,
  selectWorkspaceFile as selectWorkspaceFileInternal,
  saveWorkspaceFile as saveWorkspaceFileInternal,
  createWorkspaceFile as createWorkspaceFileInternal,
  showAddProviderModal as showAddProviderModalInternal,
  updateAddProviderForm as updateAddProviderFormInternal,
  confirmAddProvider as confirmAddProviderInternal,
} from "../ui-zh-CN/controllers/model-config";

import {
  loadSkillsStatus as loadSkillsConfigInternal,
  saveSkillsConfig as saveSkillsConfigInternal,
  updateSkillEnabled as updateSkillEnabledConfigInternal,
  saveSkillApiKey as saveSkillApiKeyConfigInternal,
  installSkillDependency as installSkillDependencyInternal,
  toggleSkillsGroup as toggleSkillsGroupInternal,
  setAllowlistMode as setAllowlistModeInternal,
  toggleAllowlistEntry as toggleAllowlistEntryInternal,
  updateGlobalSetting as updateGlobalSettingInternal,
  hasSkillsConfigChanges as hasSkillsConfigChangesInternal,
  updateSkillEnv as updateSkillEnvConfigInternal,
  removeSkillEnv as removeSkillEnvConfigInternal,
  updateSkillConfig as updateSkillConfigConfigInternal,
  updateExtraDirs as updateExtraDirsConfigInternal,
  openSkillEditor as openSkillEditorInternal,
  closeSkillEditor as closeSkillEditorInternal,
  updateEditorContent as updateEditorContentInternal,
  updateEditorMode as updateEditorModeInternal,
  saveSkillFile as saveSkillFileInternal,
  openCreateSkill as openCreateSkillInternal,
  closeCreateSkill as closeCreateSkillInternal,
  updateCreateSkillName as updateCreateSkillNameInternal,
  updateCreateSkillSource as updateCreateSkillSourceInternal,
  confirmCreateSkill as confirmCreateSkillInternal,
  openDeleteSkill as openDeleteSkillInternal,
  closeDeleteSkill as closeDeleteSkillInternal,
  confirmDeleteSkill as confirmDeleteSkillInternal,
  updateSkillApiKeyEdit as updateSkillApiKeyEditConfigInternal,
} from "../ui-zh-CN/controllers/skills-config";

import { loadCronRuns, toggleCronJob, runCronJob, removeCronJob, addCronJob, updateCronJob } from "./controllers/cron";
import type { GatewayAgentRow } from "./types";

// ============================================
// 辅助函数 / Helper functions
// ============================================

/**
 * 将 CronJob 转换为 CronFormState（用于编辑）
 */
function jobToFormState(job: CronJob): CronFormState {
  const schedule = job.schedule;
  let scheduleKind: "at" | "every" | "cron" = "every";
  let scheduleAt = "";
  let everyAmount = "30";
  let everyUnit: "minutes" | "hours" | "days" = "minutes";
  let cronExpr = "0 7 * * *";
  let cronTz = "";

  if (schedule.kind === "at") {
    scheduleKind = "at";
    scheduleAt = new Date(schedule.atMs).toISOString().slice(0, 16);
  } else if (schedule.kind === "every") {
    scheduleKind = "every";
    const ms = schedule.everyMs;
    if (ms % 86400000 === 0) {
      everyAmount = String(ms / 86400000);
      everyUnit = "days";
    } else if (ms % 3600000 === 0) {
      everyAmount = String(ms / 3600000);
      everyUnit = "hours";
    } else {
      everyAmount = String(ms / 60000);
      everyUnit = "minutes";
    }
  } else if (schedule.kind === "cron") {
    scheduleKind = "cron";
    cronExpr = schedule.expr;
    cronTz = schedule.tz ?? "";
  }

  const payload = job.payload;
  const payloadKind = payload.kind;
  const payloadText = payload.kind === "systemEvent" ? payload.text : payload.message;

  return {
    name: job.name,
    description: job.description ?? "",
    agentId: job.agentId ?? "",
    enabled: job.enabled,
    scheduleKind,
    scheduleAt,
    everyAmount,
    everyUnit,
    cronExpr,
    cronTz,
    sessionTarget: job.sessionTarget,
    wakeMode: job.wakeMode,
    payloadKind,
    payloadText,
    deliver: payload.kind === "agentTurn" ? (payload.deliver ?? false) : false,
    channel: payload.kind === "agentTurn" ? (payload.provider ?? "last") : "last",
    to: payload.kind === "agentTurn" ? (payload.to ?? "") : "",
    timeoutSeconds: payload.kind === "agentTurn" ? String(payload.timeoutSeconds ?? "") : "",
    postToMainPrefix: job.isolation?.postToMainPrefix ?? "",
  };
}

/**
 * 处理工作区文件选择
 */
function handleWorkspaceFileSelect(state: AppViewState, fileName: string): void {
  void selectWorkspaceFileInternal(state as Parameters<typeof selectWorkspaceFileInternal>[0], fileName);
}

/**
 * 处理工作区文件保存
 */
function handleWorkspaceFileSave(state: AppViewState): void {
  void saveWorkspaceFileInternal(state as Parameters<typeof saveWorkspaceFileInternal>[0]);
}

/**
 * 处理工作区文件刷新
 */
function handleWorkspaceRefresh(state: AppViewState): void {
  void loadWorkspaceFilesInternal(state as Parameters<typeof loadWorkspaceFilesInternal>[0]);
}

/**
 * 处理工作区 Agent 切换
 */
function handleWorkspaceAgentChange(state: AppViewState, agentId: string): void {
  state.workspaceAgentId = agentId;
  state.workspaceSelectedFile = null;
  state.workspaceEditorContent = "";
  state.workspaceOriginalContent = "";
  void loadWorkspaceFilesInternal(state as Parameters<typeof loadWorkspaceFilesInternal>[0]);
}

/**
 * 获取工作区可用的 Agent 列表
 */
function getWorkspaceAgents(state: AppViewState): Array<{ id: string; name?: string; default?: boolean }> {
  const agents = state.modelConfigAgentsList ?? [];
  if (agents.length === 0) {
    return [{ id: "main", name: "Main Agent", default: true }];
  }
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name ?? agent.identity?.name,
    default: agent.default,
  }));
}

/**
 * 处理工作区文件创建
 */
function handleWorkspaceFileCreate(state: AppViewState, fileName: string): void {
  createWorkspaceFileInternal(state as Parameters<typeof createWorkspaceFileInternal>[0], fileName);
}

// ============================================
// 主渲染函数 / Main render function
// ============================================

/**
 * 渲染 model-config Tab
 * Render the model-config tab with all props mapped from AppViewState
 */
export function renderModelConfigTab(state: AppViewState) {
  return renderModelConfig({
    loading: state.modelConfigLoading,
    saving: state.modelConfigSaving,
    applying: state.modelConfigApplying,
    connected: state.connected,
    hasChanges: hasModelConfigChangesInternal(state),
    providers: state.modelConfigProviders,
    agentDefaults: state.modelConfigAgentDefaults,
    gatewayConfig: state.modelConfigGateway,
    availableModels: getAvailableModelsInternal(state.modelConfigProviders),
    channelsConfig: state.modelConfigChannelsConfig ?? {},
    selectedChannel: state.modelConfigSelectedChannel,
    expandedProviders: state.modelConfigExpandedProviders,
    activeSection: state.modelConfigActiveSection,
    // 会话管理相关状态
    agentSessionsLoading: state.agentSessionsLoading,
    agentSessionsResult: state.agentSessionsResult,
    agentSessionsError: state.agentSessionsError,
    onAgentSessionsRefresh: () => loadAgentSessionsInternal(state),
    onAgentSessionModelChange: (sessionKey, model) => patchSessionModelInternal(state, sessionKey, model),
    onAgentSessionNavigate: (sessionKey) => {
      state.sessionKey = sessionKey;
      state.chatMessage = "";
      state.resetToolStream();
      state.applySettings({
        ...state.settings,
        sessionKey,
        lastActiveSessionKey: sessionKey,
      });
      void state.loadAssistantIdentity();
      state.setTab("chat");
    },
    // 工作区文件相关 / Workspace file props
    workspaceFiles: state.workspaceFiles,
    workspaceDir: state.workspaceDir,
    workspaceAgentId: state.workspaceAgentId,
    workspaceAgents: getWorkspaceAgents(state),
    workspaceSelectedFile: state.workspaceSelectedFile,
    workspaceEditorContent: state.workspaceEditorContent,
    workspaceOriginalContent: state.workspaceOriginalContent,
    workspaceLoading: state.workspaceLoading,
    workspaceSaving: state.workspaceSaving,
    workspaceError: state.workspaceError,
    workspaceEditorMode: state.workspaceEditorMode,
    onWorkspaceFileSelect: (fileName) => handleWorkspaceFileSelect(state, fileName),
    onWorkspaceContentChange: (content) => { state.workspaceEditorContent = content; },
    onWorkspaceFileSave: () => handleWorkspaceFileSave(state),
    onWorkspaceRefresh: () => handleWorkspaceRefresh(state),
    onWorkspaceModeChange: (mode) => { state.workspaceEditorMode = mode; },
    onWorkspaceFileCreate: (fileName) => handleWorkspaceFileCreate(state, fileName),
    onWorkspaceAgentChange: (agentId) => handleWorkspaceAgentChange(state, agentId),
    expandedFolders: state.workspaceExpandedFolders,
    onFolderToggle: (folderName) => {
      const next = new Set(state.workspaceExpandedFolders);
      if (next.has(folderName)) {
        next.delete(folderName);
      } else {
        next.add(folderName);
      }
      state.workspaceExpandedFolders = next;
    },
    // 权限管理相关状态 / Permissions state
    permissionsLoading: state.permissionsLoading,
    permissionsSaving: state.permissionsSaving,
    permissionsDirty: state.permissionsDirty,
    execApprovalsSnapshot: state.execApprovalsSnapshot,
    execApprovalsForm: state.execApprovalsForm,
    permissionsSelectedAgent: state.permissionsSelectedAgent,
    permissionsAgents: getPermissionsAgentsInternal(state),
    // Exec Approvals 目标选择
    execTarget: state.execApprovalsTarget ?? "gateway",
    execTargetNodeId: state.execApprovalsTargetNodeId ?? null,
    execTargetNodes: resolveExecApprovalsNodesInternal(state.nodes ?? []),
    onExecTargetChange: (target, nodeId) => {
      state.execApprovalsTarget = target;
      state.execApprovalsTargetNodeId = nodeId;
      state.execApprovalsSnapshot = null;
      state.execApprovalsForm = null;
      state.permissionsDirty = false;
      state.permissionsSelectedAgent = null;
      // 自动加载新目标的权限配置
      const loadTarget = target === "node" && nodeId
        ? { kind: "node" as const, nodeId }
        : { kind: "gateway" as const };
      void loadPermissionsInternal(state, loadTarget);
    },
    onReload: () => loadModelConfigInternal(state),
    onSave: () => saveModelConfigInternal(state),
    onApply: () => applyModelConfigInternal(state),
    onSectionChange: (sectionId) => {
      setActiveSectionInternal(state, sectionId);
      // 自动加载工作区文件 / Auto-load workspace files
      if (sectionId === "workspace" && state.workspaceFiles.length === 0) {
        void loadWorkspaceFilesInternal(state as Parameters<typeof loadWorkspaceFilesInternal>[0]);
      }
      // 自动加载技能数据 / Auto-load skills data
      if (sectionId === "skills" && !state.skillsConfigReport) {
        void loadSkillsConfigInternal(state as Parameters<typeof loadSkillsConfigInternal>[0]);
      }
      // 自动加载定时任务数据 / Auto-load cron data
      if (sectionId === "cron" && state.cronJobs.length === 0 && !state.cronLoading) {
        void state.loadCron();
      }
    },
    onProviderToggle: (key) => toggleProviderExpandedInternal(state, key),
    onProviderAdd: () => addProviderInternal(state),
    // 添加供应商弹窗 / Add provider modal
    showAddProviderModal: state.addProviderModalShow,
    addProviderForm: state.addProviderForm,
    addProviderError: state.addProviderError,
    onShowAddProviderModal: (show) => showAddProviderModalInternal(state, show),
    onAddProviderFormChange: (patch) => updateAddProviderFormInternal(state, patch),
    onAddProviderConfirm: () => confirmAddProviderInternal(state),
    onProviderRemove: (key) => removeProviderInternal(state, key),
    onProviderRename: (oldKey, newKey) => renameProviderInternal(state, oldKey, newKey),
    onProviderUpdate: (key, field, value) =>
      updateProviderFieldInternal(state, key, field, value),
    onModelAdd: (providerKey) => addModelInternal(state, providerKey),
    onModelRemove: (providerKey, modelIndex) =>
      removeModelInternal(state, providerKey, modelIndex),
    onModelUpdate: (providerKey, modelIndex, field, value) =>
      updateModelFieldInternal(state, providerKey, modelIndex, field, value),
    onAgentDefaultsUpdate: (path, value) =>
      updateAgentDefaultsInternal(state, path, value),
    onGatewayUpdate: (path, value) =>
      updateGatewayConfigInternal(state, path, value),
    onNavigateToChannels: () => state.setTab("channels"),
    onChannelSelect: (channelId) => {
      state.modelConfigSelectedChannel = channelId;
    },
    onChannelConfigUpdate: (channelId, field, value) => {
      const current = state.modelConfigChannelsConfig ?? {};
      const channelConfig = JSON.parse(JSON.stringify(current[channelId] ?? {})) as Record<string, unknown>;

      // 支持嵌套路径，如 "polling.pollingIntervalMs"
      const parts = field.split(".");
      if (parts.length === 1) {
        channelConfig[field] = value;
      } else {
        let target = channelConfig;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!target[part] || typeof target[part] !== "object") {
            target[part] = {};
          }
          target = target[part] as Record<string, unknown>;
        }
        target[parts[parts.length - 1]] = value;
      }

      state.modelConfigChannelsConfig = {
        ...current,
        [channelId]: channelConfig,
      };
    },
    // 权限管理回调
    permissionsActiveTab: state.permissionsActiveTab ?? "exec",
    onPermissionsTabChange: (tab) => { state.permissionsActiveTab = tab; },
    onPermissionsLoad: () => {
      const target = state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
        ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
        : { kind: "gateway" as const };
      return loadPermissionsInternal(state, target);
    },
    onPermissionsSave: () => {
      const target = state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
        ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
        : { kind: "gateway" as const };
      return savePermissionsInternal(state, target);
    },
    onPermissionsSelectAgent: (agentId) => selectPermissionsAgentInternal(state, agentId),
    onPermissionsPatch: (path, value) => updatePermissionsFormValueInternal(state, path, value),
    onPermissionsRemove: (path) => removePermissionsFormValueInternal(state, path),
    onPermissionsAddAllowlistEntry: (agentId) => addPermissionsAllowlistEntryInternal(state, agentId),
    onPermissionsRemoveAllowlistEntry: (agentId, index) => removePermissionsAllowlistEntryInternal(state, agentId, index),
    onPermissionsAddAgent: (agentId) => addPermissionsAgentInternal(state, agentId),
    onPermissionsRemoveAgent: (agentId) => removePermissionsAgentInternal(state, agentId),
    // 工具权限相关状态
    toolsConfig: state.toolsConfig,
    agentToolsConfigs: state.agentToolsConfigs,
    toolsAgents: getToolsAgentsInternal(state),
    toolsSelectedAgent: state.toolsSelectedAgent,
    toolsExpanded: state.toolsExpanded,
    // 工具权限回调
    onToolsSelectAgent: (agentId) => selectToolsAgentInternal(state, agentId),
    onToolsToggleExpanded: () => toggleToolsExpandedInternal(state),
    onToolsUpdateGlobal: (field, value) => updateGlobalToolsConfigInternal(state, field, value),
    onToolsUpdateAgent: (agentId, field, value) => updateAgentToolsConfigInternal(state, agentId, field, value),
    onToolsAddGlobalDeny: (entry) => addGlobalToolsDenyEntryInternal(state, entry),
    onToolsRemoveGlobalDeny: (entry) => removeGlobalToolsDenyEntryInternal(state, entry),
    onToolsAddAgentDeny: (agentId, entry) => addAgentToolsDenyEntryInternal(state, agentId, entry),
    onToolsRemoveAgentDeny: (agentId, entry) => removeAgentToolsDenyEntryInternal(state, agentId, entry),
    onToolsToggleDeny: (tool, denied) => {
      if (denied) {
        addGlobalToolsDenyEntryInternal(state, tool);
      } else {
        removeGlobalToolsDenyEntryInternal(state, tool);
      }
    },
    // 技能管理相关状态 / Skills management props
    skillsLoading: state.skillsConfigLoading,
    skillsSaving: state.skillsConfigSaving,
    skillsError: state.skillsConfigError,
    skillsReport: state.skillsConfigReport,
    skillsConfig: state.skillsConfig,
    skillsHasChanges: hasSkillsConfigChangesInternal(state as Parameters<typeof hasSkillsConfigChangesInternal>[0]),
    skillsFilter: state.skillsConfigFilter,
    skillsSourceFilter: state.skillsConfigSourceFilter,
    skillsStatusFilter: state.skillsConfigStatusFilter,
    skillsExpandedGroups: state.skillsConfigExpandedGroups,
    skillsSelectedSkill: state.skillsConfigSelectedSkill,
    skillsBusySkill: state.skillsConfigBusySkill,
    skillsMessages: state.skillsConfigMessages,
    skillsAllowlistMode: state.skillsConfigAllowlistMode,
    skillsAllowlistDraft: state.skillsConfigAllowlistDraft,
    skillsEdits: state.skillsConfigEdits,
    // 技能管理回调 / Skills management callbacks
    onSkillsRefresh: () => loadSkillsConfigInternal(state as Parameters<typeof loadSkillsConfigInternal>[0]),
    onSkillsSave: () => saveSkillsConfigInternal(state as Parameters<typeof saveSkillsConfigInternal>[0]),
    onSkillsFilterChange: (filter) => { state.skillsConfigFilter = filter; },
    onSkillsSourceFilterChange: (source) => { state.skillsConfigSourceFilter = source; },
    onSkillsStatusFilterChange: (status) => { state.skillsConfigStatusFilter = status; },
    onSkillsGroupToggle: (group) => toggleSkillsGroupInternal(state as Parameters<typeof toggleSkillsGroupInternal>[0], group),
    onSkillsSkillSelect: (skillKey) => { state.skillsConfigSelectedSkill = skillKey; },
    onSkillsSkillToggle: (skillKey, enabled) => updateSkillEnabledConfigInternal(state as Parameters<typeof updateSkillEnabledConfigInternal>[0], skillKey, enabled),
    onSkillsApiKeyChange: (skillKey, apiKey) => updateSkillApiKeyEditConfigInternal(state as Parameters<typeof updateSkillApiKeyEditConfigInternal>[0], skillKey, apiKey),
    onSkillsApiKeySave: (skillKey) => saveSkillApiKeyConfigInternal(state as Parameters<typeof saveSkillApiKeyConfigInternal>[0], skillKey),
    onSkillsAllowlistModeChange: (mode) => setAllowlistModeInternal(state as Parameters<typeof setAllowlistModeInternal>[0], mode),
    onSkillsAllowlistToggle: (skillKey, inList) => toggleAllowlistEntryInternal(state as Parameters<typeof toggleAllowlistEntryInternal>[0], skillKey, inList),
    onSkillsInstall: (skillKey, name, installId) => installSkillDependencyInternal(state as Parameters<typeof installSkillDependencyInternal>[0], skillKey, name, installId),
    onSkillsGlobalSettingChange: (field, value) => updateGlobalSettingInternal(state as Parameters<typeof updateGlobalSettingInternal>[0], field, value),
    // Phase 3: 环境变量和配置编辑
    onSkillsEnvChange: (skillKey, envKey, value) => updateSkillEnvConfigInternal(state as Parameters<typeof updateSkillEnvConfigInternal>[0], skillKey, envKey, value),
    onSkillsEnvRemove: (skillKey, envKey) => removeSkillEnvConfigInternal(state as Parameters<typeof removeSkillEnvConfigInternal>[0], skillKey, envKey),
    onSkillsConfigChange: (skillKey, config) => updateSkillConfigConfigInternal(state as Parameters<typeof updateSkillConfigConfigInternal>[0], skillKey, config),
    onSkillsExtraDirsChange: (dirs) => updateExtraDirsConfigInternal(state as Parameters<typeof updateExtraDirsConfigInternal>[0], dirs),
    // Phase 5-6: 编辑器状态和回调
    skillsEditorState: state.skillsConfigEditor,
    skillsCreateState: state.skillsConfigCreate,
    skillsDeleteState: state.skillsConfigDelete,
    onSkillsEditorOpen: (skillKey, skillName, source) => openSkillEditorInternal(state as Parameters<typeof openSkillEditorInternal>[0], skillKey, skillName, source),
    onSkillsEditorClose: () => closeSkillEditorInternal(state as Parameters<typeof closeSkillEditorInternal>[0]),
    onSkillsEditorContentChange: (content) => updateEditorContentInternal(state as Parameters<typeof updateEditorContentInternal>[0], content),
    onSkillsEditorModeChange: (mode) => updateEditorModeInternal(state as Parameters<typeof updateEditorModeInternal>[0], mode),
    onSkillsEditorSave: () => saveSkillFileInternal(state as Parameters<typeof saveSkillFileInternal>[0]),
    onSkillsCreateOpen: (source) => openCreateSkillInternal(state as Parameters<typeof openCreateSkillInternal>[0], source),
    onSkillsCreateClose: () => closeCreateSkillInternal(state as Parameters<typeof closeCreateSkillInternal>[0]),
    onSkillsCreateNameChange: (name) => updateCreateSkillNameInternal(state as Parameters<typeof updateCreateSkillNameInternal>[0], name),
    onSkillsCreateSourceChange: (source) => updateCreateSkillSourceInternal(state as Parameters<typeof updateCreateSkillSourceInternal>[0], source),
    onSkillsCreateConfirm: () => confirmCreateSkillInternal(state as Parameters<typeof confirmCreateSkillInternal>[0]),
    onSkillsDeleteOpen: (skillKey, skillName, source) => openDeleteSkillInternal(state as Parameters<typeof openDeleteSkillInternal>[0], skillKey, skillName, source),
    onSkillsDeleteClose: () => closeDeleteSkillInternal(state as Parameters<typeof closeDeleteSkillInternal>[0]),
    onSkillsDeleteConfirm: () => confirmDeleteSkillInternal(state as Parameters<typeof confirmDeleteSkillInternal>[0]),
    // 定时任务状态 / Cron state props
    cronLoading: state.cronLoading,
    cronBusy: state.cronBusy,
    cronError: state.cronError,
    cronStatus: state.cronStatus,
    cronJobs: state.cronJobs,
    cronForm: state.cronForm,
    cronAgents: (state.agentsList?.agents ?? []) as GatewayAgentRow[],
    cronDefaultAgentId: state.agentsList?.defaultId ?? "",
    cronChannels: state.channelsSnapshot?.channelMeta?.length
      ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
      : state.channelsSnapshot?.channelOrder ?? [],
    cronChannelLabels: state.channelsSnapshot?.channelLabels ?? {},
    cronChannelMeta: state.channelsSnapshot?.channelMeta ?? [],
    cronRunsJobId: state.cronRunsJobId,
    cronRuns: state.cronRuns,
    cronExpandedJobId: state.cronExpandedJobId,
    cronDeleteConfirmJobId: state.cronDeleteConfirmJobId,
    cronShowCreateModal: state.cronShowCreateModal,
    cronEditJobId: state.cronEditJobId,
    // 定时任务回调 / Cron callbacks
    onCronFormChange: (patch) => { state.cronForm = { ...state.cronForm, ...patch }; },
    onCronRefresh: () => state.loadCron(),
    onCronAdd: () => addCronJob(state),
    onCronUpdate: () => {
      if (state.cronEditJobId) {
        void updateCronJob(state, state.cronEditJobId);
      }
    },
    onCronToggle: (job, enabled) => toggleCronJob(state, job, enabled),
    onCronRun: (job) => runCronJob(state, job),
    onCronRemove: (job) => removeCronJob(state, job),
    onCronLoadRuns: (jobId) => loadCronRuns(state, jobId),
    onCronExpandJob: (jobId) => { state.cronExpandedJobId = jobId; },
    onCronDeleteConfirm: (jobId) => { state.cronDeleteConfirmJobId = jobId; },
    onCronShowCreateModal: (show) => {
      state.cronShowCreateModal = show;
      if (show) {
        // 打开新建模式时，重置表单和编辑状态
        state.cronEditJobId = null;
        state.cronForm = { ...DEFAULT_CRON_FORM };
      } else {
        state.cronEditJobId = null;
      }
    },
    onCronEdit: (job) => {
      // 填充表单数据
      state.cronForm = jobToFormState(job);
      state.cronEditJobId = job.id;
      state.cronShowCreateModal = true;
    },
  });
}
