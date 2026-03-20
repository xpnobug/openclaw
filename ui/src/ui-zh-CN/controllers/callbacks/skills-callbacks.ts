import type { AgentsConfigProps } from "../../views/agents/types.js";
import {
  loadSkillsStatus,
  saveSkillsConfig,
  updateSkillEnabled,
  saveSkillApiKey,
  installSkillDependency,
  toggleSkillsGroup,
  setAllowlistMode,
  toggleAllowlistEntry,
  updateGlobalSetting,
  updateSkillEnv,
  removeSkillEnv,
  updateSkillConfig,
  updateExtraDirs,
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
  openSkillPreview,
  closeSkillPreview,
  updateSkillApiKeyEdit,
} from "../skills-config.js";
/**
 * 技能面板 回调
 */
import type { CallbackContext } from "./types.js";

type Pick_ = Pick<
  AgentsConfigProps,
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
>;

export function createSkillsCallbacks(ctx: CallbackContext): Pick_ {
  const { s, update } = ctx;

  return {
    onSkillsRefresh: () => {
      void loadSkillsStatus(s).then(update);
    },
    onSkillsSave: () => {
      void saveSkillsConfig(s).then(update);
    },
    onSkillsFilterChange: (filter) => {
      s.skillsConfigFilter = filter;
      update();
    },
    onSkillsSourceFilterChange: (source) => {
      s.skillsConfigSourceFilter = source;
      update();
    },
    onSkillsStatusFilterChange: (status) => {
      s.skillsConfigStatusFilter = status;
      update();
    },
    onSkillsGroupToggle: (group) => {
      toggleSkillsGroup(s, group);
      update();
    },
    onSkillsSkillSelect: (skillKey) => {
      s.skillsConfigSelectedSkill = skillKey;
      update();
    },
    onSkillsSkillToggle: (skillKey, enabled) => {
      void updateSkillEnabled(s, skillKey, enabled);
      update();
    },
    onSkillsApiKeyChange: (skillKey, apiKey) => {
      updateSkillApiKeyEdit(s, skillKey, apiKey);
      update();
    },
    onSkillsApiKeySave: (skillKey) => {
      void saveSkillApiKey(s, skillKey).then(update);
    },
    onSkillsAllowlistModeChange: (mode) => {
      setAllowlistMode(s, mode);
      update();
    },
    onSkillsAllowlistToggle: (skillKey, inList) => {
      toggleAllowlistEntry(s, skillKey, inList);
      update();
    },
    onSkillsInstall: (skillKey, name, installId) => {
      void installSkillDependency(s, skillKey, name, installId).then(update);
    },
    onSkillsGlobalSettingChange: (field, value) => {
      void updateGlobalSetting(s, field, value);
      update();
    },
    onSkillsEnvChange: (skillKey, envKey, value) => {
      updateSkillEnv(s, skillKey, envKey, value);
      update();
    },
    onSkillsEnvRemove: (skillKey, envKey) => {
      removeSkillEnv(s, skillKey, envKey);
      update();
    },
    onSkillsConfigChange: (skillKey, config) => {
      updateSkillConfig(s, skillKey, config);
      update();
    },
    onSkillsExtraDirsChange: (dirs) => {
      void updateExtraDirs(s, dirs);
      update();
    },
    onSkillsEditorOpen: (skillKey, skillName, source) => {
      void openSkillEditor(s, skillKey, skillName, source).then(update);
    },
    onSkillsEditorClose: () => {
      closeSkillEditor(s);
      update();
    },
    onSkillsEditorContentChange: (content) => {
      updateEditorContent(s, content);
      update();
    },
    onSkillsEditorModeChange: (mode) => {
      updateEditorMode(s, mode);
      update();
    },
    onSkillsEditorSave: () => {
      void saveSkillFile(s).then(update);
    },
    onSkillsCreateOpen: (source) => {
      openCreateSkill(s, source);
      update();
    },
    onSkillsCreateClose: () => {
      closeCreateSkill(s);
      update();
    },
    onSkillsCreateNameChange: (name) => {
      updateCreateSkillName(s, name);
      update();
    },
    onSkillsCreateSourceChange: (source) => {
      updateCreateSkillSource(s, source);
      update();
    },
    onSkillsCreateConfirm: () => {
      void confirmCreateSkill(s).then(update);
    },
    onSkillsDeleteOpen: (skillKey, skillName, source) => {
      openDeleteSkill(s, skillKey, skillName, source);
      update();
    },
    onSkillsDeleteClose: () => {
      closeDeleteSkill(s);
      update();
    },
    onSkillsDeleteConfirm: () => {
      void confirmDeleteSkill(s).then(update);
    },
    onSkillsPreviewOpen: (skillKey, skillName) => {
      void openSkillPreview(s, skillKey, skillName).then(update);
    },
    onSkillsPreviewClose: () => {
      closeSkillPreview(s);
      update();
    },
  };
}
