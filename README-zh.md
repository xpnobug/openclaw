# OpenClaw (with Chinese Visual Config)

OpenClaw 的 Fork 版本，添加了中文可视化配置界面。

## 与官方版本的区别

- ✅ 添加了中文可视化配置界面 (`ui-zh-CN`)
- ✅ 可通过 Web 界面直观配置 Agent、通道、模型等
- ✅ 其他功能与官方版本完全相同
- ✅ 定期同步官方更新

## 安装

```bash
npm install -g @xpnobug/openclaw
```

## 使用

启动 Gateway：

```bash
openclaw gateway start
```

访问配置界面：

```
http://localhost:你设置的端口
```

点击左侧菜单的 **"可视化配置"** 即可使用中文配置界面。

## 功能特性

### 中文可视化配置界面

- 📊 **Agent 管理**：创建、编辑、删除 Agent
- 🔧 **模型配置**：配置 AI 模型和供应商
- 📱 **通道配置**：管理消息通道（Telegram、Discord 等）
- 🛠️ **工具权限**：配置 Agent 工具权限
- 🎯 **技能管理**：启用/禁用技能
- ⏰ **定时任务**：配置 Cron 任务

## 上游同步

本项目定期同步官方 OpenClaw 仓库的更新：

- 官方仓库：https://github.com/openclaw/openclaw
- Fork 仓库：https://github.com/xpnobug/openclaw
- 分支：`ui-zh-CN`

## 开发

```bash
# 克隆仓库
git clone https://github.com/xpnobug/openclaw.git -b ui-zh-CN
cd openclaw

# 安装依赖
pnpm install

# 构建
pnpm prepack

# 运行
pnpm openclaw gateway
```

## 许可证

MIT License (与官方 OpenClaw 相同)

## 相关链接

- 官方文档：https://docs.openclaw.ai
- 官方仓库：https://github.com/openclaw/openclaw
- 本项目仓库：https://github.com/xpnobug/openclaw
