/**
 * 通道配置组件导出入口
 */

// 元数据
export { CHANNEL_METADATA } from "./channel-metadata.js";

// 图标工具
export { icons, getChannelIcon } from "./channel-icons.js";

// 字段渲染
export { renderConfigField, resolveNestedValue } from "./channel-field-renderer.js";

// 列表组件
export { renderChannelList, type ChannelListProps } from "./channel-list.js";

// 详情组件
export { renderChannelDetail, type ChannelDetailProps } from "./channel-detail.js";
