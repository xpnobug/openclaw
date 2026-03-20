/**
 * 工作区文件管理控制器
 * Workspace file management controller
 *
 * 处理工作区文件的读取、保存操作
 * Handles workspace file read and save operations
 */
import type { ModelConfigState } from "./state.js";

type WorkspaceListResult = {
  workspaceDir: string;
  agentId: string;
  files: Array<{
    name: string;
    path: string;
    exists: boolean;
    size: number;
    modifiedAt: number | null;
  }>;
};

type WorkspaceReadResult = {
  name: string;
  path: string;
  exists: boolean;
  content: string;
  workspaceDir?: string;
};

function formatWorkspaceError(action: string, err: unknown, workspaceDir?: string): string {
  const details = String(err);
  const location = workspaceDir ? ` 当前工作区目录: ${workspaceDir}。` : "";
  return `${action}: ${details}。${location}请检查 Agent 工作区配置，优先使用绝对路径或以 ~ 开头的路径。`;
}

function isWorkspaceMethodUnavailableError(err: unknown): boolean {
  return /unknown method:\s*workspace\./i.test(String(err));
}

function getWorkspaceAgentId(state: ModelConfigState): string {
  return state.workspaceAgentId?.trim() || state.selectedAgentId?.trim() || "";
}

async function requestWorkspaceFilesList(state: ModelConfigState): Promise<WorkspaceListResult> {
  try {
    return (await state.client!.request("workspace.files.list", {
      agentId: state.workspaceAgentId || undefined,
    }));
  } catch (err) {
    if (!isWorkspaceMethodUnavailableError(err)) {
      throw err;
    }

    const agentId = getWorkspaceAgentId(state);
    if (!agentId) {
      throw err;
    }

    const res = (await state.client!.request("agents.files.list", {
      agentId,
    }));

    return {
      workspaceDir: res.workspace,
      agentId: res.agentId,
      files: res.files.map((file) => ({
        name: file.name,
        path: file.path,
        exists: !file.missing,
        size: file.size ?? 0,
        modifiedAt: file.updatedAtMs ?? null,
      })),
    };
  }
}

async function requestWorkspaceFileRead(
  state: ModelConfigState,
  fileName: string,
): Promise<WorkspaceReadResult> {
  try {
    return (await state.client!.request("workspace.file.read", {
      fileName,
      agentId: state.workspaceAgentId || undefined,
    }));
  } catch (err) {
    if (!isWorkspaceMethodUnavailableError(err)) {
      throw err;
    }

    const agentId = getWorkspaceAgentId(state);
    if (!agentId) {
      throw err;
    }

    const res = (await state.client!.request("agents.files.get", {
      agentId,
      name: fileName,
    }));

    return {
      name: res.file.name,
      path: res.file.path,
      exists: !res.file.missing,
      content: res.file.content ?? "",
      workspaceDir: res.workspace,
    };
  }
}

async function requestWorkspaceFileWrite(
  state: ModelConfigState,
  fileName: string,
  content: string,
): Promise<{ workspaceDir?: string }> {
  try {
    await state.client!.request("workspace.file.write", {
      fileName,
      content,
      agentId: state.workspaceAgentId || undefined,
    });
    return {};
  } catch (err) {
    if (!isWorkspaceMethodUnavailableError(err)) {
      throw err;
    }

    const agentId = getWorkspaceAgentId(state);
    if (!agentId) {
      throw err;
    }

    const res = (await state.client!.request("agents.files.set", {
      agentId,
      name: fileName,
      content,
    }));

    return { workspaceDir: res.workspace };
  }
}

/**
 * 加载工作区文件列表
 * Load workspace file list
 */
export async function loadWorkspaceFiles(state: ModelConfigState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }

  state.workspaceLoading = true;
  state.workspaceError = null;

  try {
    // 优先使用 workspace-editor 扩展；未启用时回退到内建 agents.files.* 方法
    const res = await requestWorkspaceFilesList(state);

    state.workspaceFiles = res.files;
    state.workspaceDir = res.workspaceDir;
    state.workspaceAgentId = res.agentId;
  } catch (err) {
    state.workspaceError = formatWorkspaceError("加载文件列表失败", err, state.workspaceDir);
  } finally {
    state.workspaceLoading = false;
  }
}

/**
 * 选择并读取工作区文件
 * Select and read a workspace file
 */
export async function selectWorkspaceFile(
  state: ModelConfigState,
  fileName: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }

  state.workspaceSelectedFile = fileName;
  state.workspaceLoading = true;
  state.workspaceError = null;

  try {
    const res = await requestWorkspaceFileRead(state, fileName);

    state.workspaceEditorContent = res.content ?? "";
    state.workspaceOriginalContent = res.content ?? "";
    if (res.workspaceDir) {
      state.workspaceDir = res.workspaceDir;
    }

    if (!res.exists) {
      state.workspaceError = "文件不存在，编辑后保存将自动创建";
    }
  } catch (err) {
    state.workspaceError = formatWorkspaceError("读取文件失败", err, state.workspaceDir);
  } finally {
    state.workspaceLoading = false;
  }
}

/**
 * 保存当前工作区文件
 * Save current workspace file
 */
export async function saveWorkspaceFile(state: ModelConfigState): Promise<void> {
  if (!state.client || !state.connected || !state.workspaceSelectedFile) {
    return;
  }

  state.workspaceSaving = true;
  state.workspaceError = null;

  try {
    const res = await requestWorkspaceFileWrite(
      state,
      state.workspaceSelectedFile,
      state.workspaceEditorContent,
    );

    if (res.workspaceDir) {
      state.workspaceDir = res.workspaceDir;
    }

    // 保存成功后更新原始内容 / Update original content after save
    state.workspaceOriginalContent = state.workspaceEditorContent;

    // 刷新文件列表 / Refresh file list
    await loadWorkspaceFiles(state);
  } catch (err) {
    state.workspaceError = formatWorkspaceError("保存文件失败", err, state.workspaceDir);
  } finally {
    state.workspaceSaving = false;
  }
}

/**
 * 创建新的工作区文件（设置空内容，等待用户编辑后保存）
 * Create new workspace file (set empty content, wait for user to edit and save)
 */
export function createWorkspaceFile(state: ModelConfigState, fileName: string): void {
  state.workspaceSelectedFile = fileName;
  state.workspaceEditorContent = "";
  state.workspaceOriginalContent = "";
  state.workspaceError = "文件不存在，编辑后保存将自动创建";
}

/**
 * 更新编辑器内容
 * Update editor content
 */
export function updateWorkspaceEditorContent(state: ModelConfigState, content: string): void {
  state.workspaceEditorContent = content;
}

/**
 * 切换编辑器模式
 * Toggle editor mode
 */
export function setWorkspaceEditorMode(
  state: ModelConfigState,
  mode: "edit" | "preview" | "split",
): void {
  state.workspaceEditorMode = mode;
}

/**
 * 检查工作区文件是否有未保存的更改
 * Check if workspace file has unsaved changes
 */
export function hasWorkspaceChanges(state: ModelConfigState): boolean {
  return state.workspaceEditorContent !== state.workspaceOriginalContent;
}

/**
 * 重置工作区文件到原始内容
 * Reset workspace file to original content
 */
export function resetWorkspaceFile(state: ModelConfigState): void {
  state.workspaceEditorContent = state.workspaceOriginalContent;
}

/**
 * 切换工作区 Agent
 * Switch workspace agent
 */
export async function switchWorkspaceAgent(
  state: ModelConfigState,
  agentId: string,
): Promise<void> {
  state.workspaceAgentId = agentId;
  state.workspaceSelectedFile = null;
  state.workspaceEditorContent = "";
  state.workspaceOriginalContent = "";
  state.workspaceError = null;
  await loadWorkspaceFiles(state);
}
