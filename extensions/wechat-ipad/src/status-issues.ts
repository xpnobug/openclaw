import type { ChannelAccountSnapshot, ChannelStatusIssue } from "openclaw/plugin-sdk";

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
        message: "WeChat iPad account is not fully configured.",
        fix: "Set channels.wechat-ipad.baseUrl (or account-level fields). wxid can be obtained after QR login.",
      });
    }

    if (account.dmPolicy === "open") {
      issues.push({
        channel: "wechat-ipad",
        accountId,
        kind: "config",
        message: 'wechat-ipad dmPolicy is "open" and may allow untrusted users to chat.',
        fix: 'Prefer dmPolicy="pairing" or "allowlist" in production.',
      });
    }
  }

  return issues;
}
