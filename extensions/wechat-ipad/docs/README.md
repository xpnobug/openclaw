# WeChat iPad 扩展模块

WeChat iPad 扩展通过外部 HTTP 桥接服务（Go 实现）为 OpenClaw 提供微信消息通道能力，支持多账号独立配置、双路消息接入（轮询 / Webhook）、多种消息类型发送，以及完整的登录与安全策略管理。

---

## 目录

- [架构概览](#架构概览)
- [多账号体系](#多账号体系)
- [消息接收（Inbound）](#消息接收inbound)
  - [轮询模式](#轮询模式)
  - [Webhook 模式](#webhook-模式)
- [消息发送（Outbound）](#消息发送outbound)
- [消息持久化](#消息持久化)
- [登录流程](#登录流程)
- [机器人资料缓存](#机器人资料缓存)
- [安全策略](#安全策略)
- [状态监控](#状态监控)
- [桥接服务 API](#桥接服务-api)
- [配置参考](#配置参考)
- [类型参考](#类型参考)
- [文件结构](#文件结构)

---

## 架构概览

```
┌──────────────┐     HTTP      ┌──────────────────┐    微信协议    ┌──────────┐
│  OpenClaw    │◄────────────►│  桥接服务 (Go)    │◄────────────►│ 微信服务器 │
│  Gateway     │  REST API    │  wechat-robot-*   │              │          │
└──────────────┘              └──────────────────┘              └──────────┘
       │
       ├── 轮询模式: 定时 GET /api/Msg/Sync
       └── Webhook 模式: 桥接服务 POST → Gateway HTTP 端点
```

模块不直接与微信服务器通信，所有操作通过桥接服务的 REST API 完成。

---

## 多账号体系

支持在同一 Gateway 内运行多个微信机器人，每个账号拥有独立的：

- 桥接服务地址 (`baseUrl`)
- API 认证令牌 (`apiToken`)
- 登录方式 (`loginType`)
- 消息接收模式 (`inbound.mode`)
- 安全策略 (`dmPolicy` / `groupPolicy` / `allowFrom`)
- 消息处理配置（长文本阈值、@提及等）

### 账号解析优先级

1. `accounts.<accountId>` 中的账号级配置
2. 通道顶层配置作为默认值回退
3. 内置硬编码默认值（`DEFAULT_BASE_URL`、`DEFAULT_ROBOT_ID` 等）

---

## 消息接收（Inbound）

两种互斥的消息接收模式，通过 `inbound.mode` 配置选择。

### 轮询模式

**模式**: `polling`（默认）

定时调用桥接服务 `POST /api/Msg/Sync` 拉取新消息。

| 配置项            | 类型       | 默认值  | 说明                    |
| ----------------- | ---------- | ------- | ----------------------- |
| `intervalMs`      | `number`   | `3000`  | 轮询间隔（毫秒）        |
| `lookbackSeconds` | `number`   | `120`   | 回溯时间窗口（秒）      |
| `maxPagesPerPoll` | `number`   | `10`    | 单次轮询最大翻页数      |
| `pollAllContacts` | `boolean`  | `false` | 是否拉取全部联系人消息  |
| `pollContactIds`  | `string[]` | `[]`    | 联系人白名单（空=全部） |

**去重机制**: 内存 `Set<string>` 存储已处理的 `msgId`（上限 `MAX_GLOBAL_SEEN = 10000`，裁剪到 `TRIM_GLOBAL_SEEN_TO = 8000`）。

**自发消息过滤**: 通过 `<msgsource>` XML 中的 `SELF_MSG_SOURCE_MARKER` 识别并丢弃自身发出的消息。

### Webhook 模式

**模式**: `webhook`

桥接服务主动将新消息 POST 到 Gateway 注册的 HTTP 端点。

| 配置项               | 类型                            | 默认值                                     | 说明                 |
| -------------------- | ------------------------------- | ------------------------------------------ | -------------------- |
| `path`               | `string`                        | `/plugins/wechat-ipad/webhook/<accountId>` | 接收路径             |
| `secret`             | `string`                        | `""`                                       | 认证密钥             |
| `authMode`           | `"header" \| "query" \| "none"` | `"header"`                                 | 认证方式             |
| `maxBodyBytes`       | `number`                        | `1048576` (1MB)                            | 请求体大小上限       |
| `dedupeWindowMs`     | `number`                        | `300000` (5分钟)                           | 消息去重窗口         |
| `rateLimitPerMinute` | `number`                        | `2`                                        | 每 IP 每分钟请求限制 |

**安全机制**:

- 认证：`header`（`X-Wechat-iPad-Secret` 头）、`query`（URL 参数）、`none`（无认证）
- 时序安全比较（`timingSafeEquals`）防止时序攻击
- 请求体大小限制（`maxBodyBytes`）
- 基于 IP 的频率限制
- 消息去重（基于 `accountId:wxid:msgId`，TTL 窗口）
- 历史重放过滤（丢弃早于最近登录时间的消息）

**联系人过滤**: Webhook 模式同样支持 `pollContactIds` 白名单过滤，空列表表示接收所有消息。

---

## 消息发送（Outbound）

### 支持的发送类型

| 类型     | 函数                     | 桥接 API                             | 说明                  |
| -------- | ------------------------ | ------------------------------------ | --------------------- |
| 文本     | `sendWechatIpadText`     | `POST /api/Msg/SendTxt`              | 自动分片 + 长文本转换 |
| 长文本   | `sendLongTextViaApi`     | `POST /api/Msg/SendAppMsg (Type=19)` | 聊天记录卡片格式      |
| 媒体     | `sendWechatIpadMedia`    | `POST /api/Msg/UploadImg`            | 图片/文件             |
| 链接卡片 | `sendWechatIpadLinkCard` | `POST /api/Msg/SendAppMsg (Type=5)`  | 带缩略图的 URL 卡片   |
| 引用回复 | via `sendTextViaApi`     | `POST /api/Msg/SendTxt`              | 带引用 XML 的文本     |

### 长文本处理

当文本长度超过阈值（默认 `DEFAULT_LONG_TEXT_THRESHOLD`）时，自动转换为 Type=19 聊天记录卡片：

- **标题 `<title>`**: 可通过 `longTextTitle` 配置自定义，默认 `"群聊的聊天记录"`
- **昵称 `<sourcename>`**: 优先使用 bot profile 缓存的 `nickname`，降级到 `loginSession.nickname`
- **头像 `<sourceheadurl>`**: 使用 bot profile 缓存的 `headImgUrl`，降级到空串

### 文本分片

超长文本按 `DEFAULT_TEXT_CHUNK_LIMIT` 字符分片发送，每片之间按顺序依次发出。

---

## 消息持久化

模块使用 `node:sqlite`（Node 22+ 内置）将收发消息存入本地 SQLite 数据库，用于引用回复时还原原始消息类型和内容。

### 存储路径

```
~/.openclaw/workspace/wechat-ipad-data/<accountId>/messages.db
```

图片等媒体文件同样存储在该目录下：

```
~/.openclaw/workspace/wechat-ipad-data/<accountId>/images/<contactId>/<timestamp>_<msgId>.<ext>
```

### 存储范围

| 方向 | 触发时机                                              | 存储字段                                                        |
| ---- | ----------------------------------------------------- | --------------------------------------------------------------- |
| 入站 | `handleWechatIpadInboundMessage` 入口（策略检查之前） | msgId、senderId、chatId、chatType、msgType、body、rawContent 等 |
| 出站 | `sendWechatIpadText` 发送成功后                       | msgId（API 返回）、wxid、target、body                           |

入站消息在策略检查之前存储，确保即使被过滤的消息也能被后续引用回复查询到。

### 保留策略

通过 `messageRetentionDays` 配置控制：

| 值          | 行为                                        |
| ----------- | ------------------------------------------- |
| `0`（默认） | 永久保留，不自动清理                        |
| `> 0`       | 保留指定天数，每 100 次写入自动清理过期消息 |

### 引用回复增强

发送引用回复时，从 SQLite 中查找被引用消息的 `msgType` 和 `rawContent`：

- **`msgType`**: 填入 `<refermsg><type>` 字段（文本=1、图片=3、链接=49 等），替代之前硬编码的 `1`
- **`rawContent`**: 填入 `<refermsg><content>` 字段，保留原始 XML 内容（图片/小程序/链接等）

查询未命中时（消息已清理或 store 不可用）回退到原有行为。

### 降级策略

| 场景                              | 行为                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `node:sqlite` 不可用（Node < 22） | `createWechatIpadMessageStore` 返回 `null`，所有调用方跳过 |
| 数据库打开/写入失败               | 记日志，消息处理正常继续                                   |
| `store.lookup` 未命中             | 回退到现有行为：`type=1`，`content` 来自 msgIdFull         |

### 日志

| 事件         | 日志示例                                                                           |
| ------------ | ---------------------------------------------------------------------------------- |
| 数据库初始化 | `wechat-ipad message-store: 数据库已初始化 /path/to/messages.db（保留策略：永久）` |
| 入站消息入库 | `wechat-ipad[default]: 入站消息已入库：msgId=501，发送者=wxid_a`                   |
| 出站消息入库 | `wechat-ipad[default]: 出站消息已入库：msgId=msg_001，目标=wxid_a`                 |
| 过期消息清理 | `wechat-ipad message-store: 清理过期消息 42 条`                                    |

---

## 登录流程

```
请求二维码 → 用户扫码 → 轮询检查 → [可选] 验证码 → 连接成功 → 心跳保活 → 资料预热
```

### 登录类型

| 类型   | 说明              |
| ------ | ----------------- |
| `ipad` | iPad 协议（默认） |
| `win`  | Windows 协议      |
| `mac`  | macOS 协议        |
| `car`  | 车载协议          |

### 登录阶段

1. **请求二维码**: `POST /api/Login/GetQR` → 返回 UUID、二维码 DataURL
2. **扫码轮询**: `POST /api/Login/CheckLogin` → 状态检查
3. **验证码**（可选）: `POST /api/Login/SendSMSCode` + `POST /api/Login/SubmitSMSVerify`
4. **连接成功**: 获取 `wxid`、`nickname`，启动心跳
5. **心跳保活**: `POST /api/Login/Heartbeat`，周期性发送

### 登录会话

登录状态以 `WechatIpadLoginSession` 存储在内存中，包含 UUID、设备信息、wxid、连接时间等。

---

## 机器人资料缓存

用于获取机器人自身的昵称和头像，服务于长文本消息卡片的显示。

### 策略

- **登录后预热**: 登录成功后异步调用 `fetchBotProfileViaApi` 填充缓存
- **发送时读缓存**: 长文本发送从缓存读取 nickname 和 headImgUrl
- **过期后台刷新**: 缓存过期（TTL 30 分钟）后，后台 fire-and-forget 刷新，不阻塞发送
- **并发防护**: `pendingProfileFetches` Set 防止重复请求

### 降级策略

| 场景             | nickname                | headImgUrl           |
| ---------------- | ----------------------- | -------------------- |
| 缓存命中且未过期 | `profile.nickname`      | `profile.headImgUrl` |
| 缓存命中但过期   | 旧值 + 后台刷新         | 旧值                 |
| 缓存不存在       | `loginSession.nickname` | `""`                 |
| fetch 失败       | 不影响当前值            | 不影响当前值         |

---

## 安全策略

### 消息回复策略

通过 `dmPolicy`（私聊）和 `groupPolicy`（群聊）独立控制：

| 策略值      | 说明                          |
| ----------- | ----------------------------- |
| `pairing`   | 需要配对后才能对话            |
| `allowlist` | 仅 `allowFrom` 列表中的联系人 |
| `open`      | 对所有消息开放回复（默认）    |
| `disabled`  | 完全禁用该类型消息            |

### 联系人白名单

- `allowFrom`: 允许交互的联系人/群 ID 列表
- `commandAllowFrom`: 允许执行命令的联系人 ID 列表
- `pollContactIds`: 消息接收过滤白名单（同时适用于轮询和 Webhook 模式）

### @提及过滤

`requireMention` 开关控制群聊中是否必须 @机器人才回复。关闭时群聊所有消息都会触发回复。

### 安全前缀

`safetyPrefix`: 在回复内容前添加固定前缀文本。

---

## 状态监控

`collectWechatIpadStatusIssues` 函数收集当前运行状态的健康问题，供 Gateway 状态面板展示。

`probeWechatIpad` 函数探测桥接服务的连通性，返回延迟和状态信息。

---

## 桥接服务 API

模块调用的桥接服务端点汇总：

| 端点                           | 方法 | 用途                            |
| ------------------------------ | ---- | ------------------------------- |
| `/api/Login/GetQR`             | POST | 获取登录二维码                  |
| `/api/Login/GetQRiPad`         | POST | 获取 iPad 登录二维码            |
| `/api/Login/CheckLogin`        | POST | 检查登录状态                    |
| `/api/Login/Heartbeat`         | POST | 心跳保活                        |
| `/api/Login/SendSMSCode`       | POST | 发送短信验证码                  |
| `/api/Login/SubmitSMSVerify`   | POST | 提交短信验证码                  |
| `/api/Msg/Sync`                | POST | 同步消息（轮询模式）            |
| `/api/Msg/SendTxt`             | POST | 发送文本消息                    |
| `/api/Msg/SendAppMsg`          | POST | 发送应用消息（长文本/链接卡片） |
| `/api/Msg/UploadImg`           | POST | 上传图片/媒体                   |
| `/api/User/GetContractProfile` | POST | 获取用户资料（昵称/头像）       |
| `/api/Contact/GetContactList`  | POST | 获取联系人列表                  |

---

## 配置参考

### 完整配置示例

```yaml
channels:
  wechat-ipad:
    enabled: true
    defaultAccount: main
    accounts:
      main:
        name: 主账号
        enabled: true
        baseUrl: http://localhost:9000
        apiToken: your-api-token
        robotId: default
        wxid: wxid_xxx
        loginType: ipad

        # 消息处理
        longTextThreshold: 500
        longTextTitle: 聊天记录
        messageRetentionDays: 0 # 0=永久保留，>0=保留天数
        markdown:
          enabled: true

        # 消息接收
        inbound:
          mode: polling
          polling:
            intervalMs: 3000
            lookbackSeconds: 120
            maxPagesPerPoll: 10
            pollAllContacts: false
            pollContactIds:
              - wxid_friend1
              - group@chatroom
          webhook:
            path: /plugins/wechat-ipad/webhook/main
            secret: your-webhook-secret
            authMode: header
            maxBodyBytes: 1048576
            dedupeWindowMs: 300000
            rateLimitPerMinute: 60

        # 安全策略
        dmPolicy: open
        groupPolicy: open
        allowFrom: []
        commandAllowFrom: []
        requireMention: true
        safetyPrefix: ""
```

### 账号级配置字段

| 字段                   | 类型                       | 默认值                  | 说明                      |
| ---------------------- | -------------------------- | ----------------------- | ------------------------- |
| `name`                 | `string?`                  | -                       | 账号显示名称              |
| `enabled`              | `boolean?`                 | `true`                  | 是否启用                  |
| `baseUrl`              | `string?`                  | `http://127.0.0.1:9000` | 桥接服务地址              |
| `apiToken`             | `string?`                  | -                       | API 认证令牌              |
| `tokenFile`            | `string?`                  | -                       | 令牌文件路径              |
| `robotId`              | `string?`                  | `default`               | 机器人 ID                 |
| `wxid`                 | `string?`                  | -                       | 微信 ID（登录后自动获取） |
| `loginType`            | `WechatIpadLoginType?`     | `ipad`                  | 登录协议类型              |
| `longTextThreshold`    | `number?`                  | 内置默认值              | 长文本转换阈值（字符数）  |
| `longTextTitle`        | `string?`                  | `群聊的聊天记录`        | 长文本卡片标题            |
| `messageRetentionDays` | `number?`                  | `0`                     | 消息保留天数，0=永久保留  |
| `markdown`             | `MarkdownConfig?`          | -                       | Markdown 渲染配置         |
| `inbound`              | `WechatIpadInboundConfig?` | -                       | 消息接收配置              |
| `dmPolicy`             | `WechatIpadPolicy?`        | `open`                  | 私聊策略                  |
| `groupPolicy`          | `WechatIpadPolicy?`        | `open`                  | 群聊策略                  |
| `allowFrom`            | `string[]?`                | `[]`                    | 允许交互的联系人          |
| `commandAllowFrom`     | `string[]?`                | `[]`                    | 允许执行命令的联系人      |
| `requireMention`       | `boolean?`                 | `false`                 | 群聊是否需要 @提及        |
| `safetyPrefix`         | `string?`                  | `""`                    | 回复前缀                  |

---

## 类型参考

### 核心类型

```typescript
// 消息接收模式
type WechatIpadInboundMode = "polling" | "webhook";

// 安全策略
type WechatIpadPolicy = "pairing" | "allowlist" | "open" | "disabled";

// 登录协议
type WechatIpadLoginType = "ipad" | "win" | "mac" | "car";

// Webhook 认证模式
type WechatIpadWebhookAuthMode = "header" | "query" | "none";

// API 令牌来源
type WechatIpadTokenSource = "env" | "config" | "configFile" | "none";

// 消息内容类型
type WechatIpadInboundContentType =
  | "text"
  | "image"
  | "voice"
  | "video"
  | "file"
  | "link"
  | "quote"
  | "card"
  | "system"
  | "status"
  | "unknown";
```

### 消息类型

```typescript
// 接收到的微信消息（标准化后）
type WechatIpadInboundMessage = {
  id: string;
  msgId?: string;
  msgIdFull?: string;
  msgSeq?: string;
  rawMsgSource?: string;
  from: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  chatType: "direct" | "group";
  body: string;
  rawContent?: string; // record.Content.string 原始值（XML 等）
  timestamp: number;
  isAtMe: boolean;
  isFromSelf?: boolean;
  messageType?: number;
  appMessageType?: number;
  contentType?: WechatIpadInboundContentType;
  quotedMessage?: WechatIpadQuotedMessage | null;
};

// 引用消息
type WechatIpadQuotedMessage = {
  currentBody: string;
  quotedBody?: string;
  quotedSender?: string;
  quotedSenderWxid?: string;
  quotedChatId?: string;
  quotedMessageId?: string;
  quotedMessageIdFull?: string;
  quotedMessageType?: number;
  quotedMessageSequenceId?: string;
  quotedMessageMsgSource?: string;
  rawXml: string;
};

// 链接卡片
type WechatIpadLinkCard = {
  title: string;
  url: string;
  desc?: string;
  thumbUrl?: string;
};
```

### 运行时类型

```typescript
// 登录会话
type WechatIpadLoginSession = {
  uuid: string;
  accountId: string;
  startedAt: number;
  expiresAt?: number;
  deviceId?: string;
  data62?: string;
  ticket?: string;
  loginType: WechatIpadLoginType;
  wxid?: string;
  nickname?: string;
  connectedAt?: number;
};

// 机器人资料缓存
type WechatIpadBotProfile = {
  nickname: string;
  headImgUrl: string;
  fetchedAt: number;
};

// 探测结果
type WechatIpadProbeResult = {
  ok: boolean;
  elapsedMs: number;
  message?: string;
  details?: Record<string, unknown>;
};
```

---

## 文件结构

```
extensions/wechat-ipad/
├── index.ts                          # npm 包入口
├── src/
│   ├── channel.ts                    # 插件入口 & 登录流程
│   ├── channel.test.ts               # 插件入口单元测试
│   ├── types.ts                      # 所有类型定义
│   │
│   ├── api/                          # API 通信层
│   │   ├── api.ts                    # 桥接服务 API 封装（登录、消息同步、发送、资料获取）
│   │   ├── api.test.ts               # API 层单元测试
│   │   └── api.polling-send.test.ts  # 轮询+发送集成测试
│   │
│   ├── outbound/                     # 出站消息
│   │   ├── send.ts                   # 出站消息发送（文本/长文本/媒体/链接卡片/引用回复）
│   │   ├── send.test.ts              # 发送层单元测试
│   │   ├── video.ts                  # 视频元数据提取（ffprobe/缩略图）
│   │   └── video.test.ts             # 视频处理单元测试
│   │
│   ├── inbound/                      # 入站消息
│   │   ├── inbound.ts                # 入站消息处理（标准化 → 安全策略 → 路由到 Gateway）
│   │   ├── inbound.test.ts           # 入站处理单元测试
│   │   ├── polling.ts                # 轮询模式实现
│   │   ├── polling.test.ts           # 轮询模式单元测试
│   │   ├── webhook.ts                # Webhook 模式实现（HTTP 端点、安全、去重、限流）
│   │   └── webhook.test.ts           # Webhook 模式单元测试
│   │
│   ├── config/                       # 配置、认证、账户
│   │   ├── accounts.ts               # 多账号解析与配置合并
│   │   ├── token.ts                  # API 令牌解析（env/config/file）
│   │   └── config-schema.ts          # Zod 配置校验 schema
│   │
│   └── infra/                        # 基础设施
│       ├── runtime.ts                # 运行时状态管理（登录会话、轮询器、Webhook 注册、Bot Profile 缓存）
│       ├── message-store.ts          # SQLite 消息持久化（入站+出站消息存储与查询）
│       ├── message-store.test.ts     # 消息持久化单元测试
│       ├── probe.ts                  # 桥接服务连通性探测
│       └── status-issues.ts          # 状态健康检查
│
└── docs/
    └── README.md                     # 本文档
```

### 分组说明

| 文件夹      | 职责                                             |
| ----------- | ------------------------------------------------ |
| `api/`      | 所有与桥接服务 HTTP 通信相关的代码               |
| `outbound/` | 出站消息编排：文本分片、媒体类型分发、视频元数据 |
| `inbound/`  | 入站消息：处理器、轮询器、Webhook 接收           |
| `config/`   | 配置校验、账户解析、Token 读取                   |
| `infra/`    | 运行时全局状态、SQLite 消息存储、探活、状态检查  |
| （根目录）  | 插件入口 (`channel.ts`) + 共享类型 (`types.ts`)  |

### 模块间依赖关系

```
channel.ts ──► api/api.ts ──► 桥接服务
    │              │
    ├──► inbound/polling.ts ──► api/api.ts (pollInboundMessages)
    │        │
    │        └──► inbound/inbound.ts ──► Gateway 路由
    │                 │
    │                 └──► infra/message-store.ts (入站消息入库)
    │
    ├──► inbound/webhook.ts ──► inbound/inbound.ts ──► Gateway 路由
    │
    ├──► outbound/send.ts ──► api/api.ts (sendTextViaApi / sendLongTextViaApi / ...)
    │       │
    │       ├──► infra/runtime.ts (bot profile 缓存)
    │       └──► infra/message-store.ts (出站消息入库 + 引用回复查询)
    │
    ├──► infra/message-store.ts (生命周期管理：创建/关闭)
    │
    ├──► infra/runtime.ts (登录会话、轮询器注册、消息存储注册)
    │
    └──► config/accounts.ts (配置解析)
             │
             └──► config/config-schema.ts (校验)
                      │
                      └──► config/token.ts (令牌解析)
```
