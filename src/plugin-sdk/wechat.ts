// Narrow plugin-sdk surface for the wechat plugin.
// Keep this list additive and scoped to symbols used under extensions/wechat.

export type {
  ChannelAccountSnapshot,
  ChannelGatewayContext,
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelStatusIssue,
} from "../channels/plugins/types.js";
export type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
export type { OpenClawConfig } from "../config/config.js";
/** @deprecated Use OpenClawConfig instead */
export type { OpenClawConfig as MoltbotConfig } from "../config/config.js";
export type { OpenClawPluginApi } from "../plugins/types.js";
/** @deprecated Use OpenClawPluginApi instead */
export type { OpenClawPluginApi as MoltbotPluginApi } from "../plugins/types.js";
export type { PluginRuntime } from "../plugins/runtime/types.js";

/**
 * ChannelDock: lightweight channel capability/config surface used by wechat
 * extensions. Only `id` and `capabilities` are required; all other fields
 * accept partial sub-adapter shapes without enforcing required sub-fields.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type ChannelDock = {
  id: string;
  capabilities: import("../channels/plugins/types.js").ChannelCapabilities;
  [key: string]: unknown;
};

export { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
export {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "../channels/plugins/setup-helpers.js";
export { buildChannelConfigSchema } from "../channels/plugins/config-schema.js";
export {
  deleteAccountFromConfigSection,
  setAccountEnabledInConfigSection,
} from "../channels/plugins/config-helpers.js";
export { formatPairingApproveHint } from "../channels/plugins/helpers.js";
export { PAIRING_APPROVED_MESSAGE } from "../channels/plugins/pairing-message.js";
export { emptyPluginConfigSchema } from "../plugins/config-schema.js";
export { jsonResult, readNumberParam, readStringParam } from "../agents/tools/common.js";
export { MarkdownConfigSchema } from "../config/zod-schema.core.js";
