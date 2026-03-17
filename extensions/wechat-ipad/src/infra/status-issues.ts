import type { ChannelAccountSnapshot, ChannelStatusIssue } from "openclaw/plugin-sdk/wechat-ipad";

/**
 * 收集 wechat-ipad 状态页问题项。
 */
export function collectWechatIpadStatusIssues(
  accounts: ChannelAccountSnapshot[],
): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];

  for (const account of accounts) {
    const accountId = String(account.accountId ?? "default");
    if (account.enabled === false) {
      continue;
    }

    if (account.configured !== true) {
      issues.push({
        channel: "wechat-ipad",
        accountId,
        kind: "config",
        message: "WeChat iPad 账号配置不完整。",
        fix: `请设置 channels.wechat-ipad.accounts.${accountId}.baseUrl 和 channels.wechat-ipad.accounts.${accountId}.apiToken。wxid 可在扫码登录后获取。`,
      });
    }

    if (account.dmPolicy === "open") {
      issues.push({
        channel: "wechat-ipad",
        accountId,
        kind: "config",
        message: 'wechat-ipad dmPolicy 为 "open"，可能允许不受信任的用户聊天。',
        fix: '生产环境建议使用 dmPolicy="pairing" 或 "allowlist"。',
      });
    }
  }

  return issues;
}
