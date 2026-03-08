---
summary: "Connect OpenClaw to an external wechat-ipad bridge over HTTP"
read_when:
  - You want to use WeChat iPad as a channel through an external bridge service
  - You need multi-account WeChat iPad routing with polling inbound mode
title: "WeChat iPad"
---

# WeChat iPad

The WeChat iPad channel plugin connects OpenClaw to an external `wechat-ipad` bridge service over HTTP.

This plugin is implemented as a **channel extension** and does not embed native WeChat libraries into OpenClaw.

## What this plugin does

- Bridges outbound messages from OpenClaw to your external wechat-ipad HTTP API
- Polls inbound messages from the bridge API (MVP mode)
- Normalizes inbound events into OpenClaw routing/dispatch flow
- Supports multi-account configuration under `channels.wechat-ipad.accounts`

## Install

Use the extension package:

```bash
pnpm add @openclaw/wechat-ipad
```

Or keep it in-repo at `extensions/wechat-ipad` for local development.

## Configuration

```json
{
  "channels": {
    "wechat-ipad": {
      "enabled": true,
      "name": "default",
      "baseUrl": "http://localhost:9000",
      "apiToken": "<token>",
      "robotId": "default",
      "loginType": "ipad",
      "defaultAccount": "default",
      "inbound": {
        "mode": "polling",
        "polling": {
          "intervalMs": 3000,
          "lookbackSeconds": 120,
          "maxPagesPerPoll": 10,
          "pollAllContacts": false,
          "pollContactIds": ["wxid_example", "123456@chatroom"]
        }
      },
      "dmPolicy": "pairing",
      "groupPolicy": "open",
      "allowFrom": ["wxid_admin"],
      "commandAllowFrom": ["wxid_admin"],
      "requireMention": true,
      "safetyPrefix": ""
    }
  }
}
```

## Token priority

Token resolution order:

1. `WECHAT_IPAD_API_TOKEN` (default account only)
2. `channels.wechat-ipad.apiToken` or account-level `apiToken`
3. `channels.wechat-ipad.tokenFile` or account-level `tokenFile`

## Multi-account

Use account map mode:

```json
{
  "channels": {
    "wechat-ipad": {
      "defaultAccount": "main",
      "accounts": {
        "main": {
          "enabled": true,
          "baseUrl": "http://127.0.0.1:9000",
          "apiToken": "token-main",
          "robotId": "main",
          "inbound": {
            "mode": "polling",
            "polling": {
              "pollContactIds": ["wxid_main"]
            }
          }
        },
        "ops": {
          "enabled": true,
          "baseUrl": "http://127.0.0.1:9001",
          "apiToken": "token-ops",
          "robotId": "ops",
          "inbound": {
            "mode": "polling",
            "polling": {
              "pollContactIds": ["wxid_ops"]
            }
          }
        }
      }
    }
  }
}
```

## Login type

`loginType` controls which QR mode the bridge should request:

- `ipad` (default)
- `win`
- `mac`
- `car`

Set it at channel level or per-account under `accounts.<id>.loginType`.

## Inbound modes

- `polling` (default, MVP): enabled and production-ready for this plugin phase
- `webhook` (reserved): planned for later; current MVP keeps this as a future mode

## Security notes

- Keep `dmPolicy` at `pairing` or `allowlist` for production
- Use `commandAllowFrom` to restrict tool/command execution to trusted IDs
- Prefer private network access between OpenClaw and your bridge service

## Troubleshooting

- If status reports token/config errors, verify `baseUrl`, `apiToken`, and `robotId`
- If no inbound messages arrive, confirm `inbound.polling.pollContactIds` includes the expected targets
- If bridge is unreachable, channel status will report runtime/probe errors without crashing the gateway
