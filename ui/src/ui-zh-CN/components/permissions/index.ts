/**
 * 权限管理组件导出
 * Permissions components exports
 */

// 主组件
export { renderPermissionsContent } from "./permissions-content.js";

// 子组件
export { renderExecPermissionsContent, renderExecTargetSection } from "./exec-permissions.js";
export { renderToolsPermissionsSection } from "./tools-permissions.js";

// 类型
export type {
  PermissionsContentProps,
  ExecSecurity,
  ExecAsk,
  ExecApprovalsDefaults,
  ExecApprovalsAllowlistEntry,
  ExecApprovalsAgent,
  ExecApprovalsFile,
  ExecApprovalsSnapshot,
  AgentOption,
  ToolProfileId,
  ToolPolicyConfig,
  ToolsConfig,
  AgentWithTools,
  PermissionsTabId,
  ExecApprovalsTarget,
  ExecApprovalsTargetNode,
} from "./types.js";

// 常量
export {
  EXEC_APPROVALS_DEFAULT_SCOPE,
  TOOLS_DEFAULT_SCOPE,
  SECURITY_OPTIONS,
  ASK_OPTIONS,
  TOOL_DESCRIPTIONS,
  TOOL_GROUPS,
  STANDALONE_TOOLS,
  TOOL_PROFILES,
} from "./constants.js";

// 工具函数
export { normalizeSecurity, normalizeAsk, resolveDefaults, formatAgo } from "./utils.js";
