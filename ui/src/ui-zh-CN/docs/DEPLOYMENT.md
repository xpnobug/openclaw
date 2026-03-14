# ui-zh-CN 部署指南

> 最后更新: 2026-02-07  
> 分析版本: v3.0

## 📋 目录

- [部署架构](#部署架构)
- [环境要求](#环境要求)
- [本地部署](#本地部署)
- [生产部署](#生产部署)
- [Docker 部署](#docker-部署)
- [反向代理配置](#反向代理配置)
- [监控告警](#监控告警)
- [故障排查](#故障排查)

---

## 🏗️ 部署架构

### 单机部署

```
┌─────────────────────────────────────────┐
│  服务器 (Ubuntu 22.04)                   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  OpenClaw Gateway               │   │
│  │  - Port: 19000                  │   │
│  │  - Bind: 127.0.0.1              │   │
│  └─────────────────────────────────┘   │
│              ↑                          │
│  ┌─────────────────────────────────┐   │
│  │  Nginx (反向代理)                │   │
│  │  - Port: 443 (HTTPS)            │   │
│  │  - SSL: Let's Encrypt           │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
              ↑
         Internet
```

### 分布式部署

```
┌─────────────────────────────────────────┐
│  负载均衡器 (Nginx)                      │
│  - Port: 443 (HTTPS)                    │
└─────────────────────────────────────────┘
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
┌─────────┐       ┌─────────┐
│ Node 1  │       │ Node 2  │
│ Gateway │       │ Gateway │
│ :19000  │       │ :19000  │
└─────────┘       └─────────┘
```

---

## 💻 环境要求

### 硬件要求

| 环境       | CPU  | 内存 | 磁盘  | 网络    |
| ---------- | ---- | ---- | ----- | ------- |
| **开发**   | 2 核 | 4GB  | 20GB  | 10Mbps  |
| **生产**   | 4 核 | 8GB  | 50GB  | 100Mbps |
| **高负载** | 8 核 | 16GB | 100GB | 1Gbps   |

### 软件要求

| 软件        | 版本     | 说明             |
| ----------- | -------- | ---------------- |
| **Node.js** | 22.20.0+ | 必需             |
| **pnpm**    | 9.0.0+   | 包管理器         |
| **Git**     | 2.0+     | 版本控制         |
| **Nginx**   | 1.18+    | 反向代理（可选） |
| **Docker**  | 20.10+   | 容器化（可选）   |

### 操作系统

| 系统        | 版本      | 支持状态    |
| ----------- | --------- | ----------- |
| **Ubuntu**  | 22.04 LTS | ✅ 推荐     |
| **Debian**  | 11+       | ✅ 支持     |
| **CentOS**  | 8+        | ✅ 支持     |
| **macOS**   | 12+       | ✅ 支持     |
| **Windows** | 10/11     | ⚠️ 部分支持 |

---

## 🏠 本地部署

### 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/xpnobug/openclaw.git
cd openclaw

# 2. 安装依赖
pnpm install

# 3. 构建项目
pnpm build

# 4. 启动 Gateway
pnpm start
```

### 配置文件

创建 `config.json`:

```json
{
  "gateway": {
    "bind": "loopback",
    "port": 19000,
    "auth": {
      "enabled": false
    }
  },
  "models": {
    "providers": {
      "openai": {
        "baseURL": "https://api.openai.com/v1",
        "apiKey": "sk-your-api-key"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "openai/gpt-4",
      "exec": {
        "security": "allowlist",
        "ask": "on-miss"
      }
    }
  }
}
```

### 访问界面

打开浏览器访问: `http://localhost:19000`

---

## 🚀 生产部署

### 1. 服务器准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要软件
sudo apt install -y git curl build-essential

# 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pnpm
npm install -g pnpm

# 创建用户
sudo useradd -m -s /bin/bash openclaw
sudo su - openclaw
```

### 2. 部署应用

```bash
# 克隆仓库
git clone https://github.com/xpnobug/openclaw.git
cd openclaw

# 安装依赖
pnpm install --prod

# 构建项目
pnpm build

# 创建配置文件
cp config.example.json config.json
nano config.json
```

### 3. 生产配置

```json
{
  "gateway": {
    "bind": "loopback",
    "port": 19000,
    "auth": {
      "enabled": true,
      "token": "your-secure-token-here"
    }
  },
  "models": {
    "providers": {
      "openai": {
        "baseURL": "https://api.openai.com/v1",
        "apiKey": "${OPENAI_API_KEY}"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "openai/gpt-4",
      "exec": {
        "security": "allowlist",
        "ask": "on-miss",
        "allowlist": ["ls", "cat", "grep", "find", "git status", "git diff"]
      }
    }
  }
}
```

### 4. 环境变量

创建 `.env`:

```bash
# API Keys
OPENAI_API_KEY=sk-your-api-key
ANTHROPIC_API_KEY=sk-ant-your-key

# Gateway
GATEWAY_TOKEN=your-secure-token
GATEWAY_BIND=loopback
GATEWAY_PORT=19000

# 日志
LOG_LEVEL=info
LOG_FILE=/var/log/openclaw/gateway.log
```

### 5. Systemd 服务

创建 `/etc/systemd/system/openclaw.service`:

```ini
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=/home/openclaw/openclaw
EnvironmentFile=/home/openclaw/openclaw/.env
ExecStart=/usr/bin/node dist/gateway/index.js
Restart=always
RestartSec=10

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/home/openclaw/openclaw

[Install]
WantedBy=multi-user.target
```

启动服务:

```bash
# 重载配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start openclaw

# 开机自启
sudo systemctl enable openclaw

# 查看状态
sudo systemctl status openclaw

# 查看日志
sudo journalctl -u openclaw -f
```

---

## 🐳 Docker 部署

### Dockerfile

```dockerfile
FROM node:22-alpine

# 安装 pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --prod

# 复制源码
COPY . .

# 构建项目
RUN pnpm build

# 暴露端口
EXPOSE 19000

# 启动命令
CMD ["node", "dist/gateway/index.js"]
```

### docker-compose.yml

```yaml
version: "3.8"

services:
  openclaw:
    build: .
    container_name: openclaw-gateway
    restart: unless-stopped
    ports:
      - "127.0.0.1:19000:19000"
    volumes:
      - ./config.json:/app/config.json:ro
      - ./workspace:/app/workspace
      - ./extensions:/app/extensions
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - GATEWAY_TOKEN=${GATEWAY_TOKEN}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:19000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 部署命令

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

---

## 🔒 反向代理配置

### Nginx 配置

创建 `/etc/nginx/sites-available/openclaw`:

```nginx
# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name openclaw.example.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS 配置
server {
    listen 443 ssl http2;
    server_name openclaw.example.com;

    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/openclaw.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/openclaw.example.com/privkey.pem;

    # SSL 配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 安全头
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 日志
    access_log /var/log/nginx/openclaw-access.log;
    error_log /var/log/nginx/openclaw-error.log;

    # 代理配置
    location / {
        proxy_pass http://127.0.0.1:19000;
        proxy_http_version 1.1;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 代理头
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

启用配置:

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/openclaw /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载配置
sudo systemctl reload nginx
```

### SSL 证书 (Let's Encrypt)

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d openclaw.example.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 📊 监控告警

### 健康检查

```bash
# 检查服务状态
curl http://localhost:19000/health

# 检查 WebSocket
wscat -c ws://localhost:19000
```

### 日志监控

```bash
# 实时查看日志
tail -f /var/log/openclaw/gateway.log

# 查看错误日志
grep ERROR /var/log/openclaw/gateway.log

# 统计请求数
grep "RPC request" /var/log/openclaw/gateway.log | wc -l
```

### 性能监控

```bash
# CPU 使用率
top -p $(pgrep -f "node.*gateway")

# 内存使用
ps aux | grep "node.*gateway"

# 网络连接
netstat -an | grep 19000
```

### Prometheus 监控

创建 `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "openclaw"
    static_configs:
      - targets: ["localhost:19000"]
```

### Grafana 仪表板

导入仪表板模板: `openclaw-dashboard.json`

---

## 🔧 故障排查

### 常见问题

#### 1. 服务无法启动

**症状**: `systemctl start openclaw` 失败

**排查**:

```bash
# 查看详细日志
sudo journalctl -u openclaw -n 50

# 检查配置文件
node -e "console.log(JSON.parse(require('fs').readFileSync('config.json')))"

# 检查端口占用
sudo lsof -i :19000
```

**解决**:

- 检查配置文件语法
- 检查端口是否被占用
- 检查文件权限

---

#### 2. WebSocket 连接失败

**症状**: 浏览器无法连接 Gateway

**排查**:

```bash
# 测试 WebSocket
wscat -c ws://localhost:19000

# 检查防火墙
sudo ufw status

# 检查 Nginx 配置
sudo nginx -t
```

**解决**:

- 检查 Gateway 是否运行
- 检查防火墙规则
- 检查 Nginx WebSocket 配置

---

#### 3. 性能问题

**症状**: 响应慢、卡顿

**排查**:

```bash
# CPU 使用率
top -p $(pgrep -f "node.*gateway")

# 内存使用
free -h

# 磁盘 I/O
iostat -x 1

# 网络延迟
ping -c 10 api.openai.com
```

**解决**:

- 增加服务器资源
- 优化配置（减少并发）
- 启用缓存
- 使用 CDN

---

#### 4. 认证失败

**症状**: 401 Unauthorized

**排查**:

```bash
# 检查配置
grep -A 5 "auth" config.json

# 检查环境变量
echo $GATEWAY_TOKEN
```

**解决**:

- 检查 token 是否正确
- 检查认证是否启用
- 清除浏览器缓存

---

### 日志分析

#### 错误日志

```bash
# 查看最近的错误
grep ERROR /var/log/openclaw/gateway.log | tail -20

# 统计错误类型
grep ERROR /var/log/openclaw/gateway.log | awk '{print $5}' | sort | uniq -c
```

#### 性能日志

```bash
# 查看慢请求
grep "duration" /var/log/openclaw/gateway.log | awk '$NF > 1000'

# 统计平均响应时间
grep "duration" /var/log/openclaw/gateway.log | awk '{sum+=$NF; count++} END {print sum/count}'
```

---

## 📋 部署检查清单

### 部署前

- [ ] 服务器资源充足
- [ ] 软件版本符合要求
- [ ] 配置文件准备完毕
- [ ] SSL 证书已获取
- [ ] 防火墙规则已配置
- [ ] 备份策略已制定

### 部署中

- [ ] 代码已构建
- [ ] 服务已启动
- [ ] 健康检查通过
- [ ] 日志正常输出
- [ ] WebSocket 连接正常
- [ ] 反向代理配置正确

### 部署后

- [ ] 功能测试通过
- [ ] 性能测试通过
- [ ] 安全扫描通过
- [ ] 监控告警配置完成
- [ ] 文档已更新
- [ ] 团队已培训

---

## 🔄 更新升级

### 滚动更新

```bash
# 1. 备份配置
cp config.json config.json.bak

# 2. 拉取最新代码
git pull origin main

# 3. 安装依赖
pnpm install

# 4. 构建项目
pnpm build

# 5. 重启服务
sudo systemctl restart openclaw

# 6. 验证
curl http://localhost:19000/health
```

### 回滚

```bash
# 1. 切换到旧版本
git checkout <old-commit>

# 2. 恢复配置
cp config.json.bak config.json

# 3. 重新构建
pnpm build

# 4. 重启服务
sudo systemctl restart openclaw
```

---

## 📞 技术支持

### 获取帮助

- **文档**: https://docs.openclaw.ai
- **GitHub**: https://github.com/openclaw/openclaw
- **Discord**: https://discord.com/invite/clawd
- **邮件**: support@openclaw.ai

### 报告问题

提交 Issue 时请包含:

- 系统信息 (`uname -a`)
- Node.js 版本 (`node -v`)
- 错误日志
- 复现步骤

---

_文档生成时间: 2026-02-07_  
_下次更新: 根据用户反馈_
