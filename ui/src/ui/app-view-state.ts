import type { EventLogEntry } from "./app-events.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { UiSettings } from "./storage.ts";
import type { ThemeTransitionContext } from "./theme-transition.ts";
import type { ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ChannelsStatusSnapshot,
  ConfigSnapshot,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  NostrProfile,
  PresenceEntry,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
} from "./types.ts";
import type { ChatAttachment, ChatQueueItem, CronFormState } from "./ui-types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import type {
  ProviderConfig,
  AgentDefaults,
  GatewayConfig,
  ToolsConfig,
  AgentWithTools,
  PermissionsTabId,
  AgentSessionsListResult,
  AgentIdentityEntry,
  WorkspaceFileInfo,
  ProviderFormState,
  ChannelsConfigData,
  SkillsConfig,
  SkillSourceFilter,
  SkillStatusFilter,
  SkillEditState,
  SkillConfigMessage,
  SkillEditorState,
  SkillCreateState,
  SkillDeleteState,
  EditableSkillSource,
  SkillEditorMode,
} from "./ui-zh-CN-adapter.ts";

export type AppViewState = {
  settings: UiSettings;
  password: string;
  tab: Tab;
  onboarding: boolean;
  basePath: string;
  connected: boolean;
  theme: ThemeMode;
  themeResolved: "light" | "dark";
  hello: GatewayHelloOk | null;
  lastError: string | null;
  eventLog: EventLogEntry[];
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  sessionKey: string;
  chatLoading: boolean;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatMessages: unknown[];
  chatToolMessages: unknown[];
  chatStream: string | null;
  chatRunId: string | null;
  chatAvatarUrl: string | null;
  chatThinkingLevel: string | null;
  chatQueue: ChatQueueItem[];
  nodesLoading: boolean;
  nodes: Array<Record<string, unknown>>;
  chatNewMessagesBelow: boolean;
  scrollToBottom: () => void;
  devicesLoading: boolean;
  devicesError: string | null;
  devicesList: DevicePairingList | null;
  execApprovalsLoading: boolean;
  execApprovalsSaving: boolean;
  execApprovalsDirty: boolean;
  execApprovalsSnapshot: ExecApprovalsSnapshot | null;
  execApprovalsForm: ExecApprovalsFile | null;
  execApprovalsSelectedAgent: string | null;
  execApprovalsTarget: "gateway" | "node";
  execApprovalsTargetNodeId: string | null;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalBusy: boolean;
  execApprovalError: string | null;
  pendingGatewayUrl: string | null;
  configLoading: boolean;
  configRaw: string;
  configRawOriginal: string;
  configValid: boolean | null;
  configIssues: unknown[];
  configSaving: boolean;
  configApplying: boolean;
  updateRunning: boolean;
  configSnapshot: ConfigSnapshot | null;
  configSchema: unknown;
  configSchemaLoading: boolean;
  configUiHints: Record<string, unknown>;
  configForm: Record<string, unknown> | null;
  configFormOriginal: Record<string, unknown> | null;
  configFormMode: "form" | "raw";
  channelsLoading: boolean;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsError: string | null;
  channelsLastSuccess: number | null;
  whatsappLoginMessage: string | null;
  whatsappLoginQrDataUrl: string | null;
  whatsappLoginConnected: boolean | null;
  whatsappBusy: boolean;
  nostrProfileFormState: NostrProfileFormState | null;
  nostrProfileAccountId: string | null;
  configFormDirty: boolean;
  presenceLoading: boolean;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: string | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  agentsSelectedId: string | null;
  agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron";
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileActive: string | null;
  agentFileSaving: boolean;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentSkillsLoading: boolean;
  agentSkillsError: string | null;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsAgentId: string | null;
  sessionsLoading: boolean;
  sessionsResult: SessionsListResult | null;
  sessionsError: string | null;
  sessionsFilterActive: string;
  sessionsFilterLimit: string;
  sessionsIncludeGlobal: boolean;
  sessionsIncludeUnknown: boolean;
  cronLoading: boolean;
  cronJobs: CronJob[];
  cronStatus: CronStatus | null;
  cronError: string | null;
  cronForm: CronFormState;
  cronRunsJobId: string | null;
  cronRuns: CronRunLogEntry[];
  cronBusy: boolean;
  cronExpandedJobId: string | null;
  cronDeleteConfirmJobId: string | null;
  cronShowCreateModal: boolean;
  cronEditJobId: string | null;
  skillsLoading: boolean;
  skillsReport: SkillStatusReport | null;
  skillsError: string | null;
  skillsFilter: string;
  skillEdits: Record<string, string>;
  skillMessages: Record<string, SkillMessage>;
  skillsBusyKey: string | null;
  debugLoading: boolean;
  debugStatus: StatusSummary | null;
  debugHealth: HealthSnapshot | null;
  debugModels: unknown[];
  debugHeartbeat: unknown;
  debugCallMethod: string;
  debugCallParams: string;
  debugCallResult: string | null;
  debugCallError: string | null;
  logsLoading: boolean;
  logsError: string | null;
  logsFile: string | null;
  logsEntries: LogEntry[];
  logsFilterText: string;
  logsLevelFilters: Record<LogLevel, boolean>;
  logsAutoFollow: boolean;
  logsTruncated: boolean;
  // 模型配置状态
  modelConfigLoading: boolean;
  modelConfigSaving: boolean;
  modelConfigApplying: boolean;
  modelConfigProviders: Record<string, ProviderConfig>;
  modelConfigAgentDefaults: AgentDefaults;
  modelConfigGateway: GatewayConfig;
  modelConfigExpandedProviders: Set<string>;
  modelConfigOriginal: {
    providers: Record<string, ProviderConfig>;
    agentDefaults: AgentDefaults;
    gateway: GatewayConfig;
    channels: ChannelsConfigData | null;
  } | null;
  // 完整配置快照（用于保存）
  modelConfigFullSnapshot: Record<string, unknown> | null;
  modelConfigHash: string | null;
  // 当前选中的配置区块
  modelConfigActiveSection: ConfigSectionId;
  // 通道配置
  modelConfigChannelsConfig: ChannelsConfigData | null;
  modelConfigSelectedChannel: string | null;
  // 权限管理状态（模型配置页面）
  permissionsLoading: boolean;
  permissionsSaving: boolean;
  permissionsDirty: boolean;
  permissionsSelectedAgent: string | null;
  permissionsActiveTab: PermissionsTabId;
  // 工具权限状态
  toolsConfig: ToolsConfig | null;
  toolsConfigOriginal: ToolsConfig | null;
  agentToolsConfigs: AgentWithTools[];
  agentToolsConfigsOriginal: AgentWithTools[];
  toolsSelectedAgent: string | null;
  toolsExpanded: boolean;
  // 会话管理状态 (Agent 设置页)
  agentSessionsLoading: boolean;
  agentSessionsResult: AgentSessionsListResult | null;
  agentSessionsError: string | null;
  // Agent 身份配置状态 / Agent identity config state
  modelConfigAgentsList: AgentIdentityEntry[];
  modelConfigAgentsListOriginal: AgentIdentityEntry[];
  modelConfigSelectedAgentId: string | null;
  // 工作区文件状态 / Workspace file state
  workspaceFiles: WorkspaceFileInfo[];
  workspaceDir: string;
  workspaceAgentId: string;
  workspaceSelectedFile: string | null;
  workspaceEditorContent: string;
  workspaceOriginalContent: string;
  workspaceLoading: boolean;
  workspaceSaving: boolean;
  workspaceError: string | null;
  workspaceEditorMode: "edit" | "preview" | "split";
  workspaceExpandedFolders: Set<string>;
  // 添加供应商弹窗状态 / Add provider modal state
  addProviderModalShow: boolean;
  addProviderForm: ProviderFormState;
  addProviderError: string | null;
  // 技能管理状态 (Skills management state for changeoradd)
  skillsConfigLoading: boolean;
  skillsConfigSaving: boolean;
  skillsConfigError: string | null;
  skillsConfigReport: SkillStatusReport | null;
  skillsConfig: SkillsConfig | null;
  skillsConfigOriginal: SkillsConfig | null;
  skillsConfigFilter: string;
  skillsConfigSourceFilter: SkillSourceFilter;
  skillsConfigStatusFilter: SkillStatusFilter;
  skillsConfigExpandedGroups: Set<string>;
  skillsConfigSelectedSkill: string | null;
  skillsConfigBusySkill: string | null;
  skillsConfigMessages: Record<string, SkillConfigMessage>;
  skillsConfigAllowlistMode: "all" | "whitelist";
  skillsConfigAllowlistDraft: Set<string>;
  skillsConfigEdits: Record<string, SkillEditState>;
  // 技能编辑器状态 / Skills editor state (Phase 5-6)
  skillsConfigEditor: SkillEditorState;
  skillsConfigCreate: SkillCreateState;
  skillsConfigDelete: SkillDeleteState;
  client: GatewayBrowserClient | null;
  connect: () => void;
  setTab: (tab: Tab) => void;
  setTheme: (theme: ThemeMode, context?: ThemeTransitionContext) => void;
  applySettings: (next: UiSettings) => void;
  loadOverview: () => Promise<void>;
  loadAssistantIdentity: () => Promise<void>;
  loadCron: () => Promise<void>;
  handleWhatsAppStart: (force: boolean) => Promise<void>;
  handleWhatsAppWait: () => Promise<void>;
  handleWhatsAppLogout: () => Promise<void>;
  handleChannelConfigSave: () => Promise<void>;
  handleChannelConfigReload: () => Promise<void>;
  handleNostrProfileEdit: (accountId: string, profile: NostrProfile | null) => void;
  handleNostrProfileCancel: () => void;
  handleNostrProfileFieldChange: (field: keyof NostrProfile, value: string) => void;
  handleNostrProfileSave: () => Promise<void>;
  handleNostrProfileImport: () => Promise<void>;
  handleNostrProfileToggleAdvanced: () => void;
  handleExecApprovalDecision: (decision: "allow-once" | "allow-always" | "deny") => Promise<void>;
  handleGatewayUrlConfirm: () => void;
  handleGatewayUrlCancel: () => void;
  handleConfigLoad: () => Promise<void>;
  handleConfigSave: () => Promise<void>;
  handleConfigApply: () => Promise<void>;
  handleConfigFormUpdate: (path: string, value: unknown) => void;
  handleConfigFormModeChange: (mode: "form" | "raw") => void;
  handleConfigRawChange: (raw: string) => void;
  handleInstallSkill: (key: string) => Promise<void>;
  handleUpdateSkill: (key: string) => Promise<void>;
  handleToggleSkillEnabled: (key: string, enabled: boolean) => Promise<void>;
  handleUpdateSkillEdit: (key: string, value: string) => void;
  handleSaveSkillApiKey: (key: string, apiKey: string) => Promise<void>;
  handleCronToggle: (jobId: string, enabled: boolean) => Promise<void>;
  handleCronRun: (jobId: string) => Promise<void>;
  handleCronRemove: (jobId: string) => Promise<void>;
  handleCronAdd: () => Promise<void>;
  handleCronRunsLoad: (jobId: string) => Promise<void>;
  handleCronFormUpdate: (path: string, value: unknown) => void;
  handleSessionsLoad: () => Promise<void>;
  handleSessionsPatch: (key: string, patch: unknown) => Promise<void>;
  handleLoadNodes: () => Promise<void>;
  handleLoadPresence: () => Promise<void>;
  handleLoadSkills: () => Promise<void>;
  handleLoadDebug: () => Promise<void>;
  handleLoadLogs: () => Promise<void>;
  handleDebugCall: () => Promise<void>;
  handleRunUpdate: () => Promise<void>;
  setPassword: (next: string) => void;
  setSessionKey: (next: string) => void;
  setChatMessage: (next: string) => void;
  handleChatSend: () => Promise<void>;
  handleChatAbort: () => Promise<void>;
  handleChatSelectQueueItem: (id: string) => void;
  handleChatDropQueueItem: (id: string) => void;
  handleChatClearQueue: () => void;
  handleLogsFilterChange: (next: string) => void;
  handleLogsLevelFilterToggle: (level: LogLevel) => void;
  handleLogsAutoFollowToggle: (next: boolean) => void;
  handleCallDebugMethod: (method: string, params: string) => Promise<void>;
  // 技能编辑器处理函数 / Skills editor handlers (Phase 5-6)
  handleSkillEditorOpen: (skillKey: string, skillName: string, source: EditableSkillSource) => Promise<void>;
  handleSkillEditorClose: () => void;
  handleSkillEditorContentChange: (content: string) => void;
  handleSkillEditorModeChange: (mode: SkillEditorMode) => void;
  handleSkillEditorSave: () => Promise<void>;
  handleSkillCreateOpen: (source?: EditableSkillSource) => void;
  handleSkillCreateClose: () => void;
  handleSkillCreateNameChange: (name: string) => void;
  handleSkillCreateSourceChange: (source: EditableSkillSource) => void;
  handleSkillCreateConfirm: () => Promise<void>;
  handleSkillDeleteOpen: (skillKey: string, skillName: string, source: EditableSkillSource) => void;
  handleSkillDeleteClose: () => void;
  handleSkillDeleteConfirm: () => Promise<void>;
};
