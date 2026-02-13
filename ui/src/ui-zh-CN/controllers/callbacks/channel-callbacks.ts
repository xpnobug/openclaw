import type { AgentsConfigProps } from "../../views/agents/types";
/**
 * 通道配置 回调
 */
import type { CallbackContext } from "./types";
import { loadModelConfig } from "../model-config";

type Pick_ = Pick<
  AgentsConfigProps,
  | "onChannelSelect"
  | "onChannelConfigUpdate"
  | "onNavigateToChannels"
  | "onAddChannel"
  | "onChannelsRefresh"
>;

export function createChannelCallbacks(
  ctx: CallbackContext,
  extra: { loadChannelsStatus: () => Promise<void> },
): Pick_ {
  const { s, update } = ctx;

  return {
    onChannelSelect: (channelId) => {
      s.modelConfigSelectedChannel = channelId;
      update();
    },
    onChannelConfigUpdate: (channelId, field, value) => {
      const current = s.modelConfigChannelsConfig ?? {};
      const channelConfig = JSON.parse(JSON.stringify(current[channelId] ?? {}));
      const parts = field.split(".");
      if (parts.length === 1) {
        channelConfig[field] = value;
      } else {
        let target = channelConfig;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) {
            target[parts[i]] = {};
          }
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;
      }
      s.modelConfigChannelsConfig = { ...current, [channelId]: channelConfig };
      update();
    },
    onNavigateToChannels: () => {
      // 通过 DOM 事件通知外部
      const el = document.querySelector("openclaw-config-zh");
      el?.dispatchEvent(new CustomEvent("navigate-channels", { bubbles: true, composed: true }));
    },
    onAddChannel: () => {
      s.showChannelWizard = true;
      update();
    },
    onChannelsRefresh: () => {
      Promise.all([loadModelConfig(s), extra.loadChannelsStatus()]).then(update);
    },
  };
}
