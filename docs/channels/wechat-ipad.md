---
summary: "Connect OpenClaw to an external wechat-ipad bridge over HTTP"
read_when:
  - You want to use WeChat iPad as a channel through an external bridge service
  - You need multi-account WeChat iPad routing with polling or webhook inbound mode
title: "WeChat iPad"
---

# WeChat iPad

The WeChat iPad channel plugin connects OpenClaw to an external `wechat-ipad` bridge service over HTTP.

This plugin is implemented as a **channel extension** and does not embed native WeChat libraries into OpenClaw.

## What this plugin does

- Bridges outbound messages from OpenClaw to your external wechat-ipad HTTP API
- Receives inbound messages through polling or webhook mode
- Normalizes inbound events into OpenClaw routing/dispatch flow
- Uses account-only configuration under `channels.wechat-ipad.accounts`

## Install

Use the extension package:

```bash
pnpm add @openclaw/wechat-ipad
```

Or keep it in-repo at `extensions/wechat-ipad` for local development.

## Configuration

Top-level `channels.wechat-ipad` now only keeps channel-scoped fields:

- `enabled`
- `defaultAccount`
- `accounts`

All runtime account fields must live under `channels.wechat-ipad.accounts.<accountId>`.

```json
{
  "channels": {
    "wechat-ipad": {
      "enabled": true,
      "defaultAccount": "main",
      "accounts": {
        "main": {
          "enabled": true,
          "name": "主账号",
          "baseUrl": "http://127.0.0.1:9000",
          "apiToken": "token-main",
          "robotId": "main",
          "loginType": "ipad",
          "wxid": "wxid_main",
          "inbound": {
            "mode": "polling",
            "polling": {
              "intervalMs": 3000,
              "lookbackSeconds": 120,
              "maxPagesPerPoll": 10,
              "pollAllContacts": false,
              "pollContactIds": ["wxid_main", "123456@chatroom"]
            }
          },
          "dmPolicy": "pairing",
          "groupPolicy": "open",
          "allowFrom": ["wxid_admin"],
          "commandAllowFrom": ["wxid_admin"],
          "requireMention": true,
          "safetyPrefix": ""
        },
        "ops": {
          "enabled": true,
          "name": "运维账号",
          "baseUrl": "http://127.0.0.1:9001",
          "tokenFile": "/path/to/wechat-ipad-ops.token",
          "robotId": "ops",
          "loginType": "mac",
          "inbound": {
            "mode": "webhook",
            "webhook": {
              "path": "/plugins/wechat-ipad/webhook/ops",
              "secret": "ops-secret",
              "authMode": "header"
            }
          }
        }
      }
    }
  }
}
```

## Token resolution

Token resolution is account-only:

1. `channels.wechat-ipad.accounts.<accountId>.apiToken`
2. `channels.wechat-ipad.accounts.<accountId>.tokenFile`

`WECHAT_IPAD_API_TOKEN` is no longer used by this channel.

## Migration from legacy top-level config

Legacy top-level account fields are no longer supported. Move them into `accounts.<accountId>`.

Examples:

- `channels.wechat-ipad.baseUrl` → `channels.wechat-ipad.accounts.<accountId>.baseUrl`
- `channels.wechat-ipad.apiToken` → `channels.wechat-ipad.accounts.<accountId>.apiToken`
- `channels.wechat-ipad.tokenFile` → `channels.wechat-ipad.accounts.<accountId>.tokenFile`
- `channels.wechat-ipad.robotId` → `channels.wechat-ipad.accounts.<accountId>.robotId`
- `channels.wechat-ipad.wxid` → `channels.wechat-ipad.accounts.<accountId>.wxid`
- `channels.wechat-ipad.loginType` → `channels.wechat-ipad.accounts.<accountId>.loginType`
- `channels.wechat-ipad.inbound` → `channels.wechat-ipad.accounts.<accountId>.inbound`
- `channels.wechat-ipad.dmPolicy` → `channels.wechat-ipad.accounts.<accountId>.dmPolicy`
- `channels.wechat-ipad.groupPolicy` → `channels.wechat-ipad.accounts.<accountId>.groupPolicy`
- `channels.wechat-ipad.allowFrom` → `channels.wechat-ipad.accounts.<accountId>.allowFrom`
- `channels.wechat-ipad.commandAllowFrom` → `channels.wechat-ipad.accounts.<accountId>.commandAllowFrom`
- `channels.wechat-ipad.requireMention` → `channels.wechat-ipad.accounts.<accountId>.requireMention`
- `channels.wechat-ipad.safetyPrefix` → `channels.wechat-ipad.accounts.<accountId>.safetyPrefix`
- `channels.wechat-ipad.markdown` → `channels.wechat-ipad.accounts.<accountId>.markdown`
- `channels.wechat-ipad.longTextThreshold` → `channels.wechat-ipad.accounts.<accountId>.longTextThreshold`
- `channels.wechat-ipad.name` → `channels.wechat-ipad.accounts.<accountId>.name`

`defaultAccount` must point to a real key inside `accounts`.

## Login type

`loginType` controls which QR mode the bridge should request:

- `ipad` (default)
- `win`
- `mac`
- `car`

Set it per account under `accounts.<id>.loginType`.

## Inbound modes

- `polling` (default): polls messages from the bridge API
- `webhook`: receives callbacks from the bridge and supports per-account path/secret/authMode settings

## Security notes

- Keep `dmPolicy` at `pairing` or `allowlist` for production
- Use `commandAllowFrom` to restrict tool/command execution to trusted IDs
- Prefer private network access between OpenClaw and your bridge service

## Troubleshooting

- If status reports token/config errors, verify `accounts.<id>.baseUrl`, `accounts.<id>.apiToken` or `accounts.<id>.tokenFile`, and `accounts.<id>.robotId`
- If no inbound messages arrive in polling mode, confirm `accounts.<id>.inbound.polling.pollContactIds` includes the expected targets
- If no inbound messages arrive in webhook mode, confirm `accounts.<id>.inbound.webhook.path`, `secret`, and `authMode`
- If bridge is unreachable, channel status will report runtime/probe errors without crashing the gateway
