import type { AgentsConfigProps } from "../../views/agents/types";
/**
 * 工具权限 回调
 */
import type { CallbackContext } from "./types";
import {
  loadPermissions,
  savePermissions,
  toggleToolsExpanded,
  updateGlobalToolsConfig,
  updateAgentToolsConfig,
  addGlobalToolsDenyEntry,
  removeGlobalToolsDenyEntry,
  addAgentToolsDenyEntry,
  removeAgentToolsDenyEntry,
} from "../model-config";

type Pick_ = Pick<
  AgentsConfigProps,
  | "onToolsToggleExpanded"
  | "onToolsUpdateGlobal"
  | "onToolsUpdateAgent"
  | "onToolsAddGlobalDeny"
  | "onToolsRemoveGlobalDeny"
  | "onToolsAddAgentDeny"
  | "onToolsRemoveAgentDeny"
  | "onToolsReload"
  | "onToolsSave"
>;

export function createToolsCallbacks(ctx: CallbackContext): Pick_ {
  const { s, update } = ctx;

  return {
    onToolsToggleExpanded: () => {
      toggleToolsExpanded(s);
      update();
    },
    onToolsUpdateGlobal: (field, value) => {
      updateGlobalToolsConfig(s, field, value);
      update();
    },
    onToolsUpdateAgent: (agentId, field, value) => {
      updateAgentToolsConfig(s, agentId, field, value);
      update();
    },
    onToolsAddGlobalDeny: (entry) => {
      addGlobalToolsDenyEntry(s, entry);
      update();
    },
    onToolsRemoveGlobalDeny: (entry) => {
      removeGlobalToolsDenyEntry(s, entry);
      update();
    },
    onToolsAddAgentDeny: (agentId, entry) => {
      addAgentToolsDenyEntry(s, agentId, entry);
      update();
    },
    onToolsRemoveAgentDeny: (agentId, entry) => {
      removeAgentToolsDenyEntry(s, agentId, entry);
      update();
    },
    onToolsReload: () => {
      loadPermissions(s, { kind: "gateway" }).then(update);
    },
    onToolsSave: () => {
      savePermissions(s, { kind: "gateway" }).then(update);
    },
  };
}
