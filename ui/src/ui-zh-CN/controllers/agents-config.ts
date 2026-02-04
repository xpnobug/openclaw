/**
 * Agent 配置控制器
 * Agent configuration controller
 *
 * 管理 Agent 列表、配置加载、状态管理逻辑
 * Manages agent list, config loading, and state management logic
 */
import type { AgentsListResult, AgentIdentityResult, AgentsFilesListResult } from "../../ui/types";
import type { AgentPanel, ConfigSnapshot } from "../types/agents-config";
import type { SkillInfo } from "../components/agent/agent-skills";
import type { ChannelStatus } from "../components/agent/agent-channels";
import type { CronJob } from "../components/agent/agent-cron";

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义 / Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gateway 客户端接口（精简）
 * Gateway client interface (minimal)
 */
export type AgentsConfigClient = {
  request: (method: string, params: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Agent 配置状态
 * Agent configuration state
 */
export type AgentsConfigState = {
  // 客户端 / Client
  client: AgentsConfigClient | null;
  connected: boolean;

  // 加载状态 / Loading state
  loading: boolean;
  error: string | null;

  // Agent 列表 / Agent list
  agentsList: AgentsListResult | null;
  defaultAgentId: string | null;

  // 当前选中 / Current selection
  selectedAgentId: string | null;
  activePanel: AgentPanel;

  // 配置表单 / Config form
  configForm: ConfigSnapshot | null;
  configSnapshot: ConfigSnapshot | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;

  // Agent Identity
  agentIdentity: AgentIdentityResult | null;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;

  // 文件面板 / Files panel
  agentFilesList: AgentsFilesListResult | null;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;

  // 技能面板 / Skills panel
  availableSkills: SkillInfo[];
  skillsLoading: boolean;
  skillsError: string | null;

  // 通道面板 / Channels panel
  channels: ChannelStatus[];
  channelsLoading: boolean;
  channelsError: string | null;

  // 定时任务面板 / Cron panel
  cronJobs: CronJob[];
  cronLoading: boolean;
  cronError: string | null;
  cronSaving: boolean;
};

/**
 * 创建初始状态
 * Create initial state
 */
export function createAgentsConfigState(): AgentsConfigState {
  return {
    client: null,
    connected: false,
    loading: false,
    error: null,
    agentsList: null,
    defaultAgentId: null,
    selectedAgentId: null,
    activePanel: "overview",
    configForm: null,
    configSnapshot: null,
    configLoading: false,
    configSaving: false,
    configDirty: false,
    agentIdentity: null,
    agentIdentityLoading: false,
    agentIdentityError: null,
    agentFilesList: null,
    agentFilesLoading: false,
    agentFilesError: null,
    agentFileActive: null,
    agentFileContents: {},
    agentFileDrafts: {},
    agentFileSaving: false,
    availableSkills: [],
    skillsLoading: false,
    skillsError: null,
    channels: [],
    channelsLoading: false,
    channelsError: null,
    cronJobs: [],
    cronLoading: false,
    cronError: null,
    cronSaving: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 类型守卫 / Type Guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 判断配置是否有修改
 * Check if config has changes
 */
function isConfigDirty(form: ConfigSnapshot | null, snapshot: ConfigSnapshot | null): boolean {
  if (!form || !snapshot) return false;
  return JSON.stringify(form) !== JSON.stringify(snapshot);
}

// ─────────────────────────────────────────────────────────────────────────────
// 核心操作 / Core Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 加载 Agent 列表
 * Load agent list
 */
export async function loadAgentsList(
  state: AgentsConfigState,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected) return;

  state.loading = true;
  state.error = null;
  requestUpdate();

  try {
    const res = (await state.client.request("agents.list", {})) as AgentsListResult;
    state.agentsList = res;
    state.defaultAgentId = res.defaultId ?? null;

    // 如果没有选中的 Agent，自动选中第一个或默认的
    // If no agent selected, auto-select first or default
    if (!state.selectedAgentId && res.agents.length > 0) {
      const defaultAgent = res.agents.find((a) => a.id === res.defaultId);
      state.selectedAgentId = defaultAgent?.id ?? res.agents[0].id;
    }
  } catch (err) {
    state.error = `加载 Agent 列表失败: ${String(err)}`;
  } finally {
    state.loading = false;
    requestUpdate();
  }
}

/**
 * 选择 Agent
 * Select agent
 */
export async function selectAgent(
  state: AgentsConfigState,
  agentId: string,
  requestUpdate: () => void,
): Promise<void> {
  state.selectedAgentId = agentId;
  state.activePanel = "overview";

  // 清空当前 Agent 相关的状态
  // Clear current agent related state
  state.agentIdentity = null;
  state.agentIdentityError = null;
  state.agentFilesList = null;
  state.agentFilesError = null;
  state.agentFileActive = null;
  state.agentFileContents = {};
  state.agentFileDrafts = {};

  requestUpdate();

  // 加载 Agent Identity
  // Load agent identity
  await loadAgentIdentity(state, agentId, requestUpdate);
}

/**
 * 切换面板
 * Change panel
 */
export function changePanel(
  state: AgentsConfigState,
  panel: AgentPanel,
  requestUpdate: () => void,
): void {
  state.activePanel = panel;
  requestUpdate();
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Identity 操作 / Agent Identity Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 加载 Agent Identity
 * Load agent identity
 */
export async function loadAgentIdentity(
  state: AgentsConfigState,
  agentId: string,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected) return;

  state.agentIdentityLoading = true;
  state.agentIdentityError = null;
  requestUpdate();

  try {
    const res = (await state.client.request("agents.identity", {
      agentId,
    })) as AgentIdentityResult;
    state.agentIdentity = res;
  } catch (err) {
    state.agentIdentityError = `加载 Agent Identity 失败: ${String(err)}`;
  } finally {
    state.agentIdentityLoading = false;
    requestUpdate();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 配置操作 / Config Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 加载配置
 * Load config
 */
export async function loadConfig(
  state: AgentsConfigState,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected) return;

  state.configLoading = true;
  requestUpdate();

  try {
    const res = (await state.client.request("config.get", {})) as ConfigSnapshot;
    state.configSnapshot = res;
    state.configForm = JSON.parse(JSON.stringify(res));
    state.configDirty = false;
  } catch (err) {
    state.error = `加载配置失败: ${String(err)}`;
  } finally {
    state.configLoading = false;
    requestUpdate();
  }
}

/**
 * 保存配置
 * Save config
 */
export async function saveConfig(
  state: AgentsConfigState,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected || !state.configForm) return;

  state.configSaving = true;
  requestUpdate();

  try {
    await state.client.request("config.set", {
      config: state.configForm,
    });
    state.configSnapshot = JSON.parse(JSON.stringify(state.configForm));
    state.configDirty = false;
  } catch (err) {
    state.error = `保存配置失败: ${String(err)}`;
  } finally {
    state.configSaving = false;
    requestUpdate();
  }
}

/**
 * 更新 Agent 模型配置
 * Update agent model config
 */
export function updateAgentModel(
  state: AgentsConfigState,
  agentId: string,
  modelId: string | null,
  requestUpdate: () => void,
): void {
  if (!state.configForm) return;

  const agents = state.configForm.agents?.list ?? [];
  const agentIndex = agents.findIndex((a) => a.id === agentId);

  if (agentIndex < 0) return;

  const agent = agents[agentIndex];
  if (modelId) {
    if (typeof agent.model === "object" && agent.model) {
      agent.model.primary = modelId;
    } else {
      agent.model = { primary: modelId };
    }
  } else {
    delete agent.model;
  }

  state.configDirty = isConfigDirty(state.configForm, state.configSnapshot);
  requestUpdate();
}

/**
 * 更新 Agent 模型备选列表
 * Update agent model fallbacks
 */
export function updateAgentModelFallbacks(
  state: AgentsConfigState,
  agentId: string,
  fallbacks: string[],
  requestUpdate: () => void,
): void {
  if (!state.configForm) return;

  const agents = state.configForm.agents?.list ?? [];
  const agentIndex = agents.findIndex((a) => a.id === agentId);

  if (agentIndex < 0) return;

  const agent = agents[agentIndex];
  if (typeof agent.model === "object" && agent.model) {
    if (fallbacks.length > 0) {
      agent.model.fallbacks = fallbacks;
    } else {
      delete agent.model.fallbacks;
    }
  } else if (fallbacks.length > 0) {
    agent.model = { fallbacks };
  }

  state.configDirty = isConfigDirty(state.configForm, state.configSnapshot);
  requestUpdate();
}

/**
 * 更新 Agent 工具 Profile
 * Update agent tools profile
 */
export function updateAgentToolsProfile(
  state: AgentsConfigState,
  agentId: string,
  profile: string | null,
  clearAllow: boolean,
  requestUpdate: () => void,
): void {
  if (!state.configForm) return;

  const agents = state.configForm.agents?.list ?? [];
  const agentIndex = agents.findIndex((a) => a.id === agentId);

  if (agentIndex < 0) return;

  const agent = agents[agentIndex];
  if (!agent.tools) agent.tools = {};

  if (profile) {
    agent.tools.profile = profile;
  } else {
    delete agent.tools.profile;
  }

  if (clearAllow) {
    delete agent.tools.allow;
    delete agent.tools.alsoAllow;
  }

  state.configDirty = isConfigDirty(state.configForm, state.configSnapshot);
  requestUpdate();
}

/**
 * 更新 Agent 工具覆盖
 * Update agent tools overrides
 */
export function updateAgentToolsOverrides(
  state: AgentsConfigState,
  agentId: string,
  alsoAllow: string[],
  deny: string[],
  requestUpdate: () => void,
): void {
  if (!state.configForm) return;

  const agents = state.configForm.agents?.list ?? [];
  const agentIndex = agents.findIndex((a) => a.id === agentId);

  if (agentIndex < 0) return;

  const agent = agents[agentIndex];
  if (!agent.tools) agent.tools = {};

  if (alsoAllow.length > 0) {
    agent.tools.alsoAllow = alsoAllow;
  } else {
    delete agent.tools.alsoAllow;
  }

  if (deny.length > 0) {
    agent.tools.deny = deny;
  } else {
    delete agent.tools.deny;
  }

  state.configDirty = isConfigDirty(state.configForm, state.configSnapshot);
  requestUpdate();
}

// ─────────────────────────────────────────────────────────────────────────────
// 文件操作 / Files Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 加载 Agent 文件列表
 * Load agent files list
 */
export async function loadAgentFiles(
  state: AgentsConfigState,
  agentId: string,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected) return;

  state.agentFilesLoading = true;
  state.agentFilesError = null;
  requestUpdate();

  try {
    const res = (await state.client.request("agents.files.list", {
      agentId,
    })) as AgentsFilesListResult;
    state.agentFilesList = res;
  } catch (err) {
    state.agentFilesError = `加载文件列表失败: ${String(err)}`;
  } finally {
    state.agentFilesLoading = false;
    requestUpdate();
  }
}

/**
 * 选择文件
 * Select file
 */
export async function selectAgentFile(
  state: AgentsConfigState,
  fileName: string,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected || !state.selectedAgentId) return;

  state.agentFileActive = fileName;

  // 如果已有内容缓存，直接使用
  // If content is cached, use it directly
  if (state.agentFileContents[fileName] !== undefined) {
    requestUpdate();
    return;
  }

  state.agentFilesLoading = true;
  requestUpdate();

  try {
    const res = (await state.client.request("agents.file.read", {
      agentId: state.selectedAgentId,
      fileName,
    })) as { content: string };

    state.agentFileContents[fileName] = res.content;
    state.agentFileDrafts[fileName] = res.content;
  } catch (err) {
    state.agentFilesError = `读取文件失败: ${String(err)}`;
  } finally {
    state.agentFilesLoading = false;
    requestUpdate();
  }
}

/**
 * 更新文件草稿
 * Update file draft
 */
export function updateFileDraft(
  state: AgentsConfigState,
  fileName: string,
  content: string,
  requestUpdate: () => void,
): void {
  state.agentFileDrafts[fileName] = content;
  requestUpdate();
}

/**
 * 重置文件草稿
 * Reset file draft
 */
export function resetFileDraft(
  state: AgentsConfigState,
  fileName: string,
  requestUpdate: () => void,
): void {
  const original = state.agentFileContents[fileName];
  if (original !== undefined) {
    state.agentFileDrafts[fileName] = original;
  }
  requestUpdate();
}

/**
 * 保存文件
 * Save file
 */
export async function saveAgentFile(
  state: AgentsConfigState,
  fileName: string,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected || !state.selectedAgentId) return;

  const content = state.agentFileDrafts[fileName];
  if (content === undefined) return;

  state.agentFileSaving = true;
  requestUpdate();

  try {
    await state.client.request("agents.file.write", {
      agentId: state.selectedAgentId,
      fileName,
      content,
    });
    state.agentFileContents[fileName] = content;
  } catch (err) {
    state.agentFilesError = `保存文件失败: ${String(err)}`;
  } finally {
    state.agentFileSaving = false;
    requestUpdate();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 技能操作 / Skills Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 加载可用技能列表
 * Load available skills
 */
export async function loadAvailableSkills(
  state: AgentsConfigState,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected) return;

  state.skillsLoading = true;
  state.skillsError = null;
  requestUpdate();

  try {
    const res = (await state.client.request("skills.list", {})) as { skills: SkillInfo[] };
    state.availableSkills = res.skills ?? [];
  } catch (err) {
    state.skillsError = `加载技能列表失败: ${String(err)}`;
  } finally {
    state.skillsLoading = false;
    requestUpdate();
  }
}

/**
 * 切换 Agent 技能
 * Toggle agent skill
 */
export function toggleAgentSkill(
  state: AgentsConfigState,
  agentId: string,
  skillId: string,
  enabled: boolean,
  requestUpdate: () => void,
): void {
  if (!state.configForm) return;

  const agents = state.configForm.agents?.list ?? [];
  const agentIndex = agents.findIndex((a) => a.id === agentId);

  if (agentIndex < 0) return;

  const agent = agents[agentIndex];
  let skills = agent.skills ?? [];

  if (enabled) {
    if (!skills.includes(skillId)) {
      skills = [...skills, skillId];
    }
  } else {
    skills = skills.filter((s) => s !== skillId);
  }

  // 如果全部启用，则清空 skills 列表（表示无过滤）
  // If all enabled, clear skills list (means no filter)
  if (skills.length === state.availableSkills.length) {
    delete agent.skills;
  } else {
    agent.skills = skills;
  }

  state.configDirty = isConfigDirty(state.configForm, state.configSnapshot);
  requestUpdate();
}

// ─────────────────────────────────────────────────────────────────────────────
// 通道操作 / Channels Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 加载 Agent 通道状态
 * Load agent channels status
 */
export async function loadAgentChannels(
  state: AgentsConfigState,
  agentId: string,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected) return;

  state.channelsLoading = true;
  state.channelsError = null;
  requestUpdate();

  try {
    const res = (await state.client.request("channels.status", {
      agentId,
    })) as { channels: ChannelStatus[] };
    state.channels = res.channels ?? [];
  } catch (err) {
    state.channelsError = `加载通道状态失败: ${String(err)}`;
  } finally {
    state.channelsLoading = false;
    requestUpdate();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 定时任务操作 / Cron Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 加载 Agent 定时任务
 * Load agent cron jobs
 */
export async function loadAgentCronJobs(
  state: AgentsConfigState,
  agentId: string,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected) return;

  state.cronLoading = true;
  state.cronError = null;
  requestUpdate();

  try {
    const res = (await state.client.request("cron.list", {
      agentId,
    })) as { jobs: CronJob[] };
    state.cronJobs = res.jobs ?? [];
  } catch (err) {
    state.cronError = `加载定时任务失败: ${String(err)}`;
  } finally {
    state.cronLoading = false;
    requestUpdate();
  }
}

/**
 * 切换定时任务状态
 * Toggle cron job
 */
export async function toggleCronJob(
  state: AgentsConfigState,
  agentId: string,
  jobId: string,
  enabled: boolean,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected) return;

  state.cronSaving = true;
  requestUpdate();

  try {
    await state.client.request("cron.toggle", {
      agentId,
      jobId,
      enabled,
    });

    // 更新本地状态
    // Update local state
    const job = state.cronJobs.find((j) => j.id === jobId);
    if (job) job.enabled = enabled;
  } catch (err) {
    state.cronError = `切换定时任务状态失败: ${String(err)}`;
  } finally {
    state.cronSaving = false;
    requestUpdate();
  }
}

/**
 * 删除定时任务
 * Delete cron job
 */
export async function deleteCronJob(
  state: AgentsConfigState,
  agentId: string,
  jobId: string,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected) return;

  state.cronSaving = true;
  requestUpdate();

  try {
    await state.client.request("cron.delete", {
      agentId,
      jobId,
    });

    // 从本地状态移除
    // Remove from local state
    state.cronJobs = state.cronJobs.filter((j) => j.id !== jobId);
  } catch (err) {
    state.cronError = `删除定时任务失败: ${String(err)}`;
  } finally {
    state.cronSaving = false;
    requestUpdate();
  }
}

/**
 * 立即运行定时任务
 * Run cron job immediately
 */
export async function runCronJob(
  state: AgentsConfigState,
  agentId: string,
  jobId: string,
  requestUpdate: () => void,
): Promise<void> {
  if (!state.client || !state.connected) return;

  // 更新任务状态为运行中
  // Update job status to running
  const job = state.cronJobs.find((j) => j.id === jobId);
  if (job) job.status = "running";
  requestUpdate();

  try {
    await state.client.request("cron.run", {
      agentId,
      jobId,
    });

    // 重新加载任务列表以获取最新状态
    // Reload jobs list to get latest status
    await loadAgentCronJobs(state, agentId, requestUpdate);
  } catch (err) {
    state.cronError = `运行定时任务失败: ${String(err)}`;
    if (job) job.status = "error";
    requestUpdate();
  }
}
