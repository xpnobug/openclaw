/**
 * Agent 通道配置面板组件
 * Agent channels configuration panel component
 *
 * 复用通道配置布局：侧边栏通道列表 + 详情配置面板
 * Reuses channels config layout: sidebar channel list + detail config panel
 */
import { html, nothing } from "lit";
import { renderChannelsContent, type ChannelsContentProps } from "../channels-content";
import type { ChannelsConfigData } from "../../types/channel-config";

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义 / Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

// Re-export ChannelStatus for backward compatibility
export type ChannelStatus = {
  id: string;
  type: string;
  name: string;
  status: "connected" | "disconnected" | "error" | "pending";
  lastActivity?: string;
  error?: string;
};

export type AgentChannelsProps = {
  // Agent 基本信息 / Agent basic info
  agentId: string;
  agentName?: string;

  // 通道配置数据 / Channels config data
  channelsConfig: ChannelsConfigData;
  selectedChannel: string | null;

  // 加载状态 / Loading state
  loading?: boolean;
  saving?: boolean;
  error?: string | null;

  // 回调函数 / Callbacks
  onChannelSelect: (channelId: string) => void;
  onChannelConfigUpdate: (channelId: string, field: string, value: unknown) => void;
  onNavigateToChannels: () => void;
  onRefresh?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// 渲染函数 / Render Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 渲染 Agent 通道配置面板
 * Render agent channels configuration panel
 *
 * 直接复用 channels-content 布局，提供完整的通道配置体验
 * Directly reuses channels-content layout for full channels config experience
 */
export function renderAgentChannels(props: AgentChannelsProps) {
  const {
    agentId,
    agentName,
    channelsConfig,
    selectedChannel,
    loading,
    saving,
    error,
    onChannelSelect,
    onChannelConfigUpdate,
    onNavigateToChannels,
    onRefresh,
  } = props;

  // 构建 ChannelsContentProps
  // Build ChannelsContentProps
  const channelsContentProps: ChannelsContentProps = {
    channelsConfig: channelsConfig ?? {},
    selectedChannel,
    onChannelSelect,
    onChannelConfigUpdate,
    onNavigateToChannels,
  };

  // 使用 channels-content 布局渲染
  // Render using channels-content layout
  return renderChannelsContent(channelsContentProps);
}
