import type { AgentsConfigProps } from "../../views/agents/types.js";
import {
  loadWorkspaceFiles,
  selectWorkspaceFile,
  saveWorkspaceFile,
  createWorkspaceFile,
} from "../model-config.js";
/**
 * 文件编辑器 回调
 */
import type { CallbackContext } from "./types.js";

type Pick_ = Pick<
  AgentsConfigProps,
  | "onLoadFiles"
  | "onSelectFile"
  | "onFileDraftChange"
  | "onFileReset"
  | "onFileSave"
  | "onFilesEditorModeChange"
  | "onFilesFolderToggle"
  | "onFileCreate"
  | "onFilesMobileBack"
>;

export function createFileCallbacks(ctx: CallbackContext): Pick_ {
  const { s, update } = ctx;

  return {
    onLoadFiles: (agentId) => {
      s.workspaceAgentId = agentId;
      loadWorkspaceFiles(s).then(update);
    },
    onSelectFile: (name) => {
      selectWorkspaceFile(s, name).then(update);
      s.filesMobileView = "editor";
    },
    onFileDraftChange: (_name, content) => {
      s.workspaceEditorContent = content;
      update();
    },
    onFileReset: (_name) => {
      s.workspaceEditorContent = s.workspaceOriginalContent;
      update();
    },
    onFileSave: (_name) => {
      saveWorkspaceFile(s).then(update);
    },
    onFilesEditorModeChange: (mode) => {
      s.filesEditorMode = mode;
      update();
    },
    onFilesFolderToggle: (folder) => {
      const next = new Set(s.filesExpandedFolders);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      s.filesExpandedFolders = next;
      update();
    },
    onFileCreate: (fileName) => {
      createWorkspaceFile(s, fileName);
      update();
    },
    onFilesMobileBack: () => {
      s.filesMobileView = "list";
      update();
    },
  };
}
