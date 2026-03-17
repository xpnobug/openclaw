// Narrow plugin-sdk surface for the wechat-ipad plugin.
// Keep this list additive and scoped to symbols used under extensions/wechat-ipad.

export type {
  ChannelAccountSnapshot,
  ChannelGatewayContext,
  ChannelStatusIssue,
} from "../channels/plugins/types.js";
export type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
export type { OpenClawConfig } from "../config/config.js";
export type { MarkdownConfig } from "../config/types.base.js";
export type { OpenClawPluginApi } from "../plugins/types.js";
export type { PluginRuntime } from "../plugins/runtime/types.js";
export type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "../gateway/server-methods/types.js";
export type { AgentMediaPayload } from "./agent-media-payload.js";

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
export { applyAccountNameToChannelSection } from "../channels/plugins/setup-helpers.js";
export { buildChannelConfigSchema } from "../channels/plugins/config-schema.js";
export {
  deleteAccountFromConfigSection,
  setAccountEnabledInConfigSection,
} from "../channels/plugins/config-helpers.js";
export { formatPairingApproveHint } from "../channels/plugins/helpers.js";
export { PAIRING_APPROVED_MESSAGE } from "../channels/plugins/pairing-message.js";
export { emptyPluginConfigSchema } from "../plugins/config-schema.js";
export { MarkdownConfigSchema } from "../config/zod-schema.core.js";
export { requireNodeSqlite } from "../memory/sqlite.js";
export { buildAgentMediaPayload } from "./agent-media-payload.js";
export { detectMime, extensionForMime } from "../media/mime.js";
export { loadOutboundMediaFromUrl } from "./outbound-media.js";
export { withTempDownloadPath } from "./temp-path.js";
export { createDedupeCache } from "../infra/dedupe.js";
export { createFixedWindowRateLimiter } from "./webhook-memory-guards.js";
export {
  beginWebhookRequestPipelineOrReject,
  readJsonWebhookBodyOrReject,
  readWebhookBodyOrReject,
} from "./webhook-request-guards.js";
export {
  registerWebhookTargetWithPluginRoute,
  resolveWebhookTargetWithAuthOrRejectSync,
  withResolvedWebhookRequestPipeline,
} from "./webhook-targets.js";
