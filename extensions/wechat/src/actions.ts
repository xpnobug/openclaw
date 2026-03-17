/**
 * WeChat message actions.
 * 微信消息动作处理
 *
 * 提供消息发送、撤回等操作的适配器
 */
import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  MoltbotConfig,
} from "openclaw/plugin-sdk/wechat";
import { jsonResult, readNumberParam, readStringParam } from "openclaw/plugin-sdk/wechat";
import { listEnabledWeChatAccounts } from "./accounts.js";
import { revokeMessageWeChat, sendMessageWeChat } from "./send.js";

const providerId = "wechat";

function listEnabledAccounts(cfg: MoltbotConfig) {
  return listEnabledWeChatAccounts(cfg).filter(
    (account) => account.enabled && account.tokenSource !== "none",
  );
}

/** 微信消息动作适配器 */
export const wechatMessageActions: ChannelMessageActionAdapter = {
  listActions: ({ cfg }) => {
    const accounts = listEnabledAccounts(cfg as MoltbotConfig);
    if (accounts.length === 0) return [];
    const actions = new Set<ChannelMessageActionName>(["send", "revoke"]);
    return Array.from(actions);
  },

  supportsButtons: () => false,

  extractToolSend: ({ args }) => {
    const action = typeof args.action === "string" ? args.action.trim() : "";
    if (action !== "sendMessage") return null;
    const to = typeof args.to === "string" ? args.to : undefined;
    if (!to) return null;
    const accountId = typeof args.accountId === "string" ? args.accountId.trim() : undefined;
    return { to, accountId };
  },

  handleAction: async ({ action, params, cfg, accountId }) => {
    if (action === "send") {
      const to = readStringParam(params, "to", { required: true });
      const content = readStringParam(params, "message", {
        required: true,
        allowEmpty: true,
      });
      const mediaUrl = readStringParam(params, "media", { trim: false });

      const result = await sendMessageWeChat(to ?? "", content ?? "", {
        accountId: accountId ?? undefined,
        mediaUrl: mediaUrl ?? undefined,
        cfg: cfg as MoltbotConfig,
      });

      if (!result.ok) {
        return jsonResult({
          ok: false,
          error: result.error ?? "Failed to send WeChat message",
        });
      }

      return jsonResult({ ok: true, to, messageId: result.messageId });
    }

    if (action === "revoke") {
      const messageId =
        readNumberParam(params, "messageId", { integer: true }) ??
        readNumberParam(params, "msgId", { integer: true, required: true });

      const result = await revokeMessageWeChat(messageId, {
        accountId: accountId ?? undefined,
        cfg: cfg as MoltbotConfig,
      });

      if (!result.ok) {
        return jsonResult({
          ok: false,
          error: result.error ?? "Failed to revoke WeChat message",
        });
      }

      return jsonResult({ ok: true, revoked: true, messageId: result.messageId });
    }

    throw new Error(`Action ${action} is not supported for provider ${providerId}.`);
  },
};
