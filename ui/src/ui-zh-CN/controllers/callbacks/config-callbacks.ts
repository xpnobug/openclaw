import type { AgentsConfigProps } from "../../views/agents/types.js";
import {
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
  updateAgentModel,
  updateAgentModelFallbacks,
  showAddProviderModal,
  updateAddProviderForm,
  confirmAddProvider,
} from "../model-config.js";
/**
 * 配置/供应商/Gateway/Agent默认设置 回调
 */
import type { CallbackContext } from "./types.js";

type Pick_ = Pick<
  AgentsConfigProps,
  | "onConfigReload"
  | "onConfigSave"
  | "onConfigApply"
  | "onModelChange"
  | "onModelFallbacksChange"
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
>;

export function createConfigCallbacks(ctx: CallbackContext): Pick_ {
  const { s, update } = ctx;

  return {
    onConfigReload: () => {
      loadModelConfig(s).then(update);
    },
    onConfigSave: () => {
      saveModelConfig(s).then(update);
    },
    onConfigApply: () => {
      applyModelConfig(s).then(update);
    },

    onModelChange: (agentId, modelId) => {
      updateAgentModel(s, agentId, modelId);
      update();
    },
    onModelFallbacksChange: (agentId, fallbacks) => {
      updateAgentModelFallbacks(s, agentId, fallbacks);
      update();
    },

    onProviderToggle: (key) => {
      toggleProviderExpanded(s, key);
      update();
    },
    onProviderAdd: () => {
      addProvider(s);
      update();
    },
    onProviderRemove: (key) => {
      removeProvider(s, key);
      update();
    },
    onProviderRename: (oldKey, newKey) => {
      renameProvider(s, oldKey, newKey);
      update();
    },
    onProviderUpdate: (key, field, value) => {
      updateProviderField(s, key, field, value);
      update();
    },
    onModelAdd: (providerKey) => {
      addModel(s, providerKey);
      update();
    },
    onModelRemove: (providerKey, modelIndex) => {
      removeModel(s, providerKey, modelIndex);
      update();
    },
    onModelUpdate: (providerKey, modelIndex, field, value) => {
      updateModelField(s, providerKey, modelIndex, field, value);
      update();
    },
    onProviderShowAddModal: (show) => {
      showAddProviderModal(s, show);
      update();
    },
    onProviderAddFormChange: (patch) => {
      updateAddProviderForm(s, patch);
      update();
    },
    onProviderAddConfirm: () => {
      confirmAddProvider(s);
      update();
    },

    onGatewayUpdate: (path, value) => {
      updateGatewayConfig(s, path, value);
      update();
    },
    onAgentDefaultsUpdate: (path, value) => {
      updateAgentDefaults(s, path, value);
      update();
    },
  };
}
