import type { CronJob } from "../../ui/types";
/**
 * Props 数据构建器
 * 从 InternalState 构建 AgentsConfigProps 的数据部分（不含回调）
 */
import type { AgentsConfigProps } from "../views/agents/types";
import type { WorkspaceFileInfo } from "./model-config";
import { getAvailableModels, hasModelConfigChanges } from "./model-config";
import { hasSkillsConfigChanges } from "./skills-config";

/** on* 回调键名 */
/** AgentsConfigProps 中去掉所有 on* 回调和 showAgentWizard 后的数据部分 */
type DataProps = Omit<
  AgentsConfigProps,
  | "showAgentWizard"
  | "onAgentSelect"
  | "onPanelChange"
  | "onGlobalPanelChange"
  | "onRefresh"
  | "onSetDefault"
  | "onSidebarSearchChange"
  | "onSidebarToggleMenu"
  | "onSidebarToggleGroup"
  | "onAgentDuplicate"
  | "onAgentExport"
  | "onAgentDelete"
  | "onCreateAgent"
  | "onAgentWizardComplete"
  | "onAgentWizardCancel"
  | "onConfigReload"
  | "onConfigSave"
  | "onConfigApply"
  | "onModelChange"
  | "onModelFallbacksChange"
  | "onToolsToggleExpanded"
  | "onToolsUpdateGlobal"
  | "onToolsUpdateAgent"
  | "onToolsAddGlobalDeny"
  | "onToolsRemoveGlobalDeny"
  | "onToolsAddAgentDeny"
  | "onToolsRemoveAgentDeny"
  | "onToolsReload"
  | "onToolsSave"
  | "onLoadFiles"
  | "onSelectFile"
  | "onFileDraftChange"
  | "onFileReset"
  | "onFileSave"
  | "onFilesEditorModeChange"
  | "onFilesFolderToggle"
  | "onFileCreate"
  | "onFilesMobileBack"
  | "onSkillsRefresh"
  | "onSkillsSave"
  | "onSkillsFilterChange"
  | "onSkillsSourceFilterChange"
  | "onSkillsStatusFilterChange"
  | "onSkillsGroupToggle"
  | "onSkillsSkillSelect"
  | "onSkillsSkillToggle"
  | "onSkillsApiKeyChange"
  | "onSkillsApiKeySave"
  | "onSkillsAllowlistModeChange"
  | "onSkillsAllowlistToggle"
  | "onSkillsInstall"
  | "onSkillsGlobalSettingChange"
  | "onSkillsEnvChange"
  | "onSkillsEnvRemove"
  | "onSkillsConfigChange"
  | "onSkillsExtraDirsChange"
  | "onSkillsEditorOpen"
  | "onSkillsEditorClose"
  | "onSkillsEditorContentChange"
  | "onSkillsEditorModeChange"
  | "onSkillsEditorSave"
  | "onSkillsCreateOpen"
  | "onSkillsCreateClose"
  | "onSkillsCreateNameChange"
  | "onSkillsCreateSourceChange"
  | "onSkillsCreateConfirm"
  | "onSkillsDeleteOpen"
  | "onSkillsDeleteClose"
  | "onSkillsDeleteConfirm"
  | "onSkillsPreviewOpen"
  | "onSkillsPreviewClose"
  | "onProviderToggle"
  | "onProviderAdd"
  | "onProviderRemove"
  | "onProviderRename"
  | "onProviderUpdate"
  | "onModelAdd"
  | "onModelRemove"
  | "onModelUpdate"
  | "onProviderShowAddModal"
  | "onProviderAddFormChange"
  | "onProviderAddConfirm"
  | "onGatewayUpdate"
  | "onAgentDefaultsUpdate"
  | "onAgentSessionsRefresh"
  | "onAgentSessionModelChange"
  | "onAgentSessionNavigate"
  | "onAgentSessionDelete"
  | "onAgentSessionCreateShow"
  | "onAgentSessionCreateNameChange"
  | "onAgentSessionCreateModelChange"
  | "onAgentSessionCreate"
  | "onChannelSelect"
  | "onChannelConfigUpdate"
  | "onNavigateToChannels"
  | "onAddChannel"
  | "onChannelsRefresh"
  | "onCronFormChange"
  | "onCronRefresh"
  | "onCronAdd"
  | "onCronUpdate"
  | "onCronToggle"
  | "onCronRun"
  | "onCronRemove"
  | "onCronLoadRuns"
  | "onCronExpandJob"
  | "onCronDeleteConfirm"
  | "onCronShowCreateModal"
  | "onCronEdit"
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildPropsData(s: Record<string, any>): DataProps {
  return {
    loading: s.agentsLoading || s.modelConfigLoading,
    error: s.agentsError || s.lastError,
    agentsList: s.agentsList,
    defaultAgentId: s.agentsList?.defaultId ?? null,
    selectedAgentId: s.selectedAgentId,
    activePanel: s.activePanel,
    globalPanel: s.globalPanel,

    // 配置状态
    configForm: s.modelConfigFullSnapshot,
    configLoading: s.modelConfigLoading,
    configSaving: s.modelConfigSaving,
    configApplying: s.modelConfigApplying,
    configDirty: hasModelConfigChanges(s),
    connected: s.connected,

    // Agent 侧边栏
    sidebarSearchQuery: s.sidebarSearchQuery,
    sidebarOpenMenuId: s.sidebarOpenMenuId,
    sidebarMenuTop: s.sidebarMenuTop,
    sidebarMenuRight: s.sidebarMenuRight,

    // Agent Identity
    agentIdentity: s.selectedAgentId ? (s.agentIdentityById[s.selectedAgentId] ?? null) : null,
    agentIdentityLoading: s.agentIdentityLoading,
    agentIdentityError: s.agentIdentityError,
    agentIdentityById: s.agentIdentityById,

    // 文件面板
    agentFilesList:
      s.workspaceAgentId && s.workspaceFiles
        ? {
            agentId: s.workspaceAgentId,
            workspace: s.workspaceDir ?? "",
            files: (s.workspaceFiles ?? []).map((f: WorkspaceFileInfo) => ({
              name: f.name,
              path: f.path ?? f.name,
              missing: !f.exists,
              size: f.size,
              updatedAtMs: f.modifiedAt,
            })),
          }
        : null,
    agentFilesLoading: s.workspaceLoading,
    agentFilesError: s.workspaceError,
    agentFileActive: s.workspaceSelectedFile,
    agentFileContents: s.workspaceSelectedFile
      ? { [s.workspaceSelectedFile]: s.workspaceOriginalContent }
      : {},
    agentFileDrafts: s.workspaceSelectedFile
      ? { [s.workspaceSelectedFile]: s.workspaceEditorContent }
      : {},
    agentFileSaving: s.workspaceSaving,
    filesEditorMode: s.filesEditorMode,
    filesExpandedFolders: s.filesExpandedFolders,
    filesMobileView: s.filesMobileView,

    // 工具面板
    toolsConfig: s.toolsConfig,
    agentToolsConfigs: s.agentToolsConfigs,
    toolsLoading: s.permissionsLoading,
    toolsSaving: s.permissionsSaving,
    toolsDirty: s.permissionsDirty,
    toolsExpanded: s.toolsExpanded,

    // 技能面板
    skillsLoading: s.skillsConfigLoading,
    skillsSaving: s.skillsConfigSaving,
    skillsError: s.skillsConfigError,
    skillsHasChanges: hasSkillsConfigChanges(s),
    skillsReport: s.skillsConfigReport,
    skillsConfig: s.skillsConfig,
    skillsFilter: s.skillsConfigFilter,
    skillsSourceFilter: s.skillsConfigSourceFilter,
    skillsStatusFilter: s.skillsConfigStatusFilter,
    skillsExpandedGroups: s.skillsConfigExpandedGroups,
    skillsSelectedSkill: s.skillsConfigSelectedSkill,
    skillsBusySkill: s.skillsConfigBusySkill,
    skillsMessages: s.skillsConfigMessages,
    skillsAllowlistMode: s.skillsConfigAllowlistMode,
    skillsAllowlistDraft: s.skillsConfigAllowlistDraft,
    skillsEdits: s.skillsConfigEdits,
    skillsEditorState: s.skillsConfigEditor,
    skillsCreateState: s.skillsConfigCreate,
    skillsDeleteState: s.skillsConfigDelete,
    skillsPreviewState: s.skillsConfigPreview,

    // 供应商配置
    providersConfig: s.modelConfigProviders,
    providersExpanded: s.modelConfigExpandedProviders,
    providersAddModal: s.addProviderModalShow,
    providersAddForm: s.addProviderForm,
    providersAddError: s.addProviderError,

    // Gateway 配置
    gatewayConfig: s.modelConfigGateway,

    // Agent 默认设置
    agentDefaults: s.modelConfigAgentDefaults,
    agentAvailableModels: getAvailableModels(s.modelConfigProviders),
    agentSessionsLoading: s.agentSessionsLoading,
    agentSessionsResult: s.agentSessionsResult,
    agentSessionsError: s.agentSessionsError,
    agentSessionCreateShow: s.sessionCreateShow,
    agentSessionCreateName: s.sessionCreateName,
    agentSessionCreateModel: s.sessionCreateModel,
    agentSessionCreating: s.sessionCreating,

    // 通道配置
    channelsConfig: s.modelConfigChannelsConfig ?? {},
    channelsSelectedChannel: s.modelConfigSelectedChannel,
    channelsLoading: s.modelConfigLoading,
    channelsError: null,

    // 定时任务
    cronLoading: s.cronLoading,
    cronBusy: s.cronBusy,
    cronError: s.cronError,
    cronStatus: s.cronStatus,
    cronJobs: s.selectedAgentId
      ? s.cronJobs.filter((job: CronJob) => {
          if (job.agentId === s.selectedAgentId) {
            return true;
          }
          const defaultAgentId = s.agentsList?.defaultId;
          if (!job.agentId && s.selectedAgentId === defaultAgentId) {
            return true;
          }
          return false;
        })
      : s.cronJobs,
    cronForm: s.cronForm,
    cronAgents: s.agentsList?.agents ?? [],
    cronDefaultAgentId: s.agentsList?.defaultId ?? "",
    cronChannels: Object.keys(s.modelConfigChannelsConfig ?? {}),
    cronChannelLabels: Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(s.modelConfigChannelsConfig ?? {}).map(
        ([k, v]: [string, Record<string, any>]) => [k, v?.label ?? k],
      ),
    ),
    cronChannelMeta: s.cronChannelMeta,
    cronRunsJobId: s.cronRunsJobId,
    cronRuns: s.cronRuns,
    cronExpandedJobId: s.cronExpandedJobId,
    cronDeleteConfirmJobId: s.cronDeleteConfirmJobId,
    cronShowCreateModal: s.cronShowCreateModal,
    cronEditJobId: s.cronEditJobId,
  };
}
