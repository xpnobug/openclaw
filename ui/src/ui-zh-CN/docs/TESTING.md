# ui-zh-CN 测试策略文档

> 最后更新: 2026-02-07  
> 分析版本: v3.0

## 📋 目录

- [测试现状](#测试现状)
- [测试策略](#测试策略)
- [测试金字塔](#测试金字塔)
- [单元测试](#单元测试)
- [集成测试](#集成测试)
- [E2E测试](#e2e测试)
- [测试工具](#测试工具)
- [实施计划](#实施计划)

---

## 📊 测试现状

### 当前状态

| 指标         | 状态      | 说明      |
| ------------ | --------- | --------- |
| **单元测试** | ❌ 无     | 0% 覆盖率 |
| **集成测试** | ❌ 无     | 0% 覆盖率 |
| **E2E 测试** | ❌ 无     | 0% 覆盖率 |
| **测试框架** | ❌ 未配置 | -         |
| **CI/CD**    | ❌ 未集成 | -         |

### 风险评估

| 风险         | 级别  | 影响                         |
| ------------ | ----- | ---------------------------- |
| **重构风险** | 🔴 高 | 无测试保护，重构容易引入 bug |
| **回归风险** | 🔴 高 | 修改代码可能破坏现有功能     |
| **质量风险** | 🟡 中 | 依赖手动测试，效率低         |
| **维护风险** | 🟡 中 | 新人上手难，不敢改代码       |

---

## 🎯 测试策略

### 测试目标

1. **保证质量** - 减少 bug，提升稳定性
2. **支持重构** - 安全重构，快速迭代
3. **文档化** - 测试即文档，展示用法
4. **自动化** - 减少手动测试，提升效率

### 测试原则

1. **测试金字塔** - 单元测试为主，E2E 为辅
2. **快速反馈** - 测试运行快，快速发现问题
3. **独立性** - 测试之间互不影响
4. **可维护** - 测试代码清晰，易于维护
5. **覆盖关键路径** - 优先测试核心功能

---

## 🏔️ 测试金字塔

```
        ┌─────────────┐
        │   E2E 测试   │  10%  - 关键用户流程
        │   (10 个)    │
        ├─────────────┤
        │  集成测试    │  30%  - 模块间交互
        │   (30 个)    │
        ├─────────────┤
        │  单元测试    │  60%  - 函数、组件
        │  (100 个)    │
        └─────────────┘
```

### 测试分布

| 类型         | 数量 | 占比 | 运行时间 | 说明               |
| ------------ | ---- | ---- | -------- | ------------------ |
| **单元测试** | 100  | 60%  | <5s      | 测试单个函数、组件 |
| **集成测试** | 30   | 30%  | <30s     | 测试模块间交互     |
| **E2E 测试** | 10   | 10%  | <2min    | 测试完整用户流程   |

---

## 🧪 单元测试

### 测试范围

#### 1. 工具函数 (utils/)

**优先级**: 🔴 P0

**测试文件**: `utils/__tests__/`

| 文件               | 测试数 | 覆盖率目标 |
| ------------------ | ------ | ---------- |
| `format.ts`        | 10     | 100%       |
| `sanitize.ts`      | 8      | 100%       |
| `deep-merge.ts`    | 12     | 100%       |
| `error-handler.ts` | 6      | 100%       |

**示例**:

```typescript
// utils/__tests__/deep-merge.test.ts
import { describe, it, expect } from "vitest";
import { deepMerge } from "../deep-merge";

describe("deepMerge", () => {
  it("should merge two objects", () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 3, c: 4 };
    const result = deepMerge(obj1, obj2);

    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("should deep merge nested objects", () => {
    const obj1 = { a: { x: 1, y: 2 } };
    const obj2 = { a: { y: 3, z: 4 } };
    const result = deepMerge(obj1, obj2);

    expect(result).toEqual({ a: { x: 1, y: 3, z: 4 } });
  });

  it("should handle arrays", () => {
    const obj1 = { arr: [1, 2] };
    const obj2 = { arr: [3, 4] };
    const result = deepMerge(obj1, obj2);

    expect(result).toEqual({ arr: [3, 4] });
  });
});
```

---

#### 2. 控制器 (controllers/)

**优先级**: 🔴 P0

**测试文件**: `controllers/__tests__/`

| 文件             | 测试数 | 覆盖率目标 |
| ---------------- | ------ | ---------- |
| `providers.ts`   | 15     | 80%        |
| `permissions.ts` | 12     | 80%        |
| `sessions.ts`    | 10     | 80%        |
| `cron.ts`        | 8      | 80%        |

**示例**:

```typescript
// controllers/__tests__/providers.test.ts
import { describe, it, expect, vi } from "vitest";
import { addProvider, deleteProvider } from "../providers";

describe("providers controller", () => {
  it("should add a new provider", () => {
    const state = {
      modelConfigProviders: {},
      modelConfigDirty: false,
    };

    addProvider(state, "openai", {
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-xxx",
    });

    expect(state.modelConfigProviders["openai"]).toBeDefined();
    expect(state.modelConfigDirty).toBe(true);
  });

  it("should delete a provider", () => {
    const state = {
      modelConfigProviders: {
        openai: { baseURL: "xxx", apiKey: "xxx" },
      },
      modelConfigDirty: false,
    };

    deleteProvider(state, "openai");

    expect(state.modelConfigProviders["openai"]).toBeUndefined();
    expect(state.modelConfigDirty).toBe(true);
  });
});
```

---

#### 3. 渲染函数 (components/)

**优先级**: 🟡 P1

**测试文件**: `components/__tests__/`

| 文件                   | 测试数 | 覆盖率目标 |
| ---------------------- | ------ | ---------- |
| `common/form-field.ts` | 20     | 80%        |
| `common/button.ts`     | 10     | 80%        |
| `common/modal.ts`      | 12     | 80%        |

**示例**:

```typescript
// components/__tests__/form-field.test.ts
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/lit";
import { renderFormField } from "../common/form-field";

describe("renderFormField", () => {
  it("should render text input", () => {
    const { container } = render(
      renderFormField({
        label: "Name",
        value: "John",
        onChange: () => {},
        type: "text",
      }),
    );

    const input = container.querySelector('input[type="text"]');
    expect(input).toBeTruthy();
    expect(input?.value).toBe("John");
  });

  it("should render select input", () => {
    const { container } = render(
      renderFormField({
        label: "Model",
        value: "gpt-4",
        onChange: () => {},
        type: "select",
        options: [
          { value: "gpt-4", label: "GPT-4" },
          { value: "claude-3", label: "Claude 3" },
        ],
      }),
    );

    const select = container.querySelector("select");
    expect(select).toBeTruthy();
    expect(select?.value).toBe("gpt-4");
  });
});
```

---

### 测试覆盖率目标

| 模块                   | 目标覆盖率 | 优先级 |
| ---------------------- | ---------- | ------ |
| **utils/**             | 100%       | 🔴 P0  |
| **controllers/**       | 80%        | 🔴 P0  |
| **types/**             | 100%       | 🟢 P2  |
| **components/common/** | 80%        | 🟡 P1  |
| **components/业务/**   | 60%        | 🟢 P2  |

---

## 🔗 集成测试

### 测试范围

#### 1. RPC 通信

**优先级**: 🔴 P0

**测试场景**:

- 配置加载和保存
- 会话管理
- 技能管理
- 定时任务管理

**示例**:

```typescript
// __tests__/integration/rpc.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GatewayBrowserClient } from "../../ui/gateway";

describe("RPC Integration", () => {
  let client: GatewayBrowserClient;

  beforeAll(async () => {
    client = new GatewayBrowserClient({ url: "ws://localhost:19000" });
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it("should load config", async () => {
    const config = await client.request("config.get");

    expect(config).toBeDefined();
    expect(config.models).toBeDefined();
    expect(config.agents).toBeDefined();
  });

  it("should list sessions", async () => {
    const result = await client.request("sessions.list");

    expect(result).toBeDefined();
    expect(Array.isArray(result.sessions)).toBe(true);
  });
});
```

---

#### 2. 状态管理

**优先级**: 🟡 P1

**测试场景**:

- 状态初始化
- 状态更新
- 状态持久化

**示例**:

```typescript
// __tests__/integration/state.test.ts
import { describe, it, expect } from "vitest";
import { createInitialState } from "../../controllers/state";
import { loadModelConfig, saveModelConfig } from "../../controllers/config-loader";

describe("State Management", () => {
  it("should initialize state", () => {
    const state = createInitialState();

    expect(state.connected).toBe(false);
    expect(state.modelConfigProviders).toEqual({});
  });

  it("should load and save config", async () => {
    const state = createInitialState();
    const mockClient = createMockClient();
    state.client = mockClient;

    await loadModelConfig(state);
    expect(state.modelConfigProviders).toBeDefined();

    state.modelConfigProviders["test"] = { baseURL: "xxx" };
    await saveModelConfig(state);
    expect(mockClient.request).toHaveBeenCalledWith("config.apply", expect.any(Object));
  });
});
```

---

#### 3. 组件交互

**优先级**: 🟡 P1

**测试场景**:

- 表单提交
- 列表操作
- 弹窗交互

**示例**:

```typescript
// __tests__/integration/components.test.ts
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/lit";
import { html } from "lit";

describe("Component Interaction", () => {
  it("should submit form", async () => {
    let submitted = false;

    const template = html`
      <form
        @submit=${() => {
          submitted = true;
        }}
      >
        <input type="text" name="name" value="test" />
        <button type="submit">Submit</button>
      </form>
    `;

    const { container } = render(template);
    const button = container.querySelector("button");

    await fireEvent.click(button!);
    expect(submitted).toBe(true);
  });
});
```

---

## 🌐 E2E 测试

### 测试范围

**优先级**: 🟡 P1

**测试场景**:

1. 用户登录
2. 配置供应商
3. 创建 Agent
4. 管理会话
5. 配置技能
6. 创建定时任务

**示例**:

```typescript
// __tests__/e2e/config-provider.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Configure Provider", () => {
  test("should add a new provider", async ({ page }) => {
    // 1. 打开页面
    await page.goto("http://localhost:19000");

    // 2. 点击"添加供应商"
    await page.click('button:has-text("添加供应商")');

    // 3. 填写表单
    await page.fill('input[name="id"]', "openai");
    await page.fill('input[name="baseURL"]', "https://api.openai.com/v1");
    await page.fill('input[name="apiKey"]', "sk-xxx");

    // 4. 提交
    await page.click('button:has-text("确认")');

    // 5. 验证
    await expect(page.locator('.provider-card:has-text("openai")')).toBeVisible();
  });

  test("should delete a provider", async ({ page }) => {
    await page.goto("http://localhost:19000");

    // 1. 点击删除按钮
    await page.click('.provider-card:has-text("openai") button:has-text("删除")');

    // 2. 确认删除
    await page.click('button:has-text("确认删除")');

    // 3. 验证
    await expect(page.locator('.provider-card:has-text("openai")')).not.toBeVisible();
  });
});
```

---

## 🛠️ 测试工具

### 推荐工具栈

| 工具                     | 用途         | 说明            |
| ------------------------ | ------------ | --------------- |
| **Vitest**               | 单元测试框架 | 快速、兼容 Vite |
| **@testing-library/lit** | Lit 组件测试 | 官方推荐        |
| **Playwright**           | E2E 测试     | 跨浏览器支持    |
| **MSW**                  | Mock API     | 拦截网络请求    |
| **@vitest/coverage-v8**  | 覆盖率报告   | 代码覆盖率统计  |

### 配置文件

#### vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "test/", "**/*.test.ts", "**/*.spec.ts"],
    },
  },
});
```

#### playwright.config.ts

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./__tests__/e2e",
  use: {
    baseURL: "http://localhost:19000",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    port: 19000,
    reuseExistingServer: true,
  },
});
```

---

## 📅 实施计划

### Phase 1: 基础设施（第 1 周，8-10 小时）

#### 任务 1.1: 配置测试框架

**工作量**: 3-4 小时

**步骤**:

1. 安装依赖

```bash
npm install -D vitest @vitest/coverage-v8 @testing-library/lit jsdom
npm install -D @playwright/test
```

2. 创建配置文件
3. 创建测试目录结构
4. 编写测试示例

---

#### 任务 1.2: 编写工具函数测试

**工作量**: 5-6 小时

**步骤**:

1. 测试 `utils/format.ts`
2. 测试 `utils/sanitize.ts`
3. 测试 `utils/deep-merge.ts`
4. 测试 `utils/error-handler.ts`

**目标**: 工具函数 100% 覆盖率

---

### Phase 2: 核心功能（第 2-3 周，20-25 小时）

#### 任务 2.1: 控制器测试

**工作量**: 12-15 小时

**步骤**:

1. 测试 `controllers/providers.ts`
2. 测试 `controllers/permissions.ts`
3. 测试 `controllers/sessions.ts`
4. 测试 `controllers/cron.ts`

**目标**: 控制器 80% 覆盖率

---

#### 任务 2.2: 组件测试

**工作量**: 8-10 小时

**步骤**:

1. 测试 `components/common/form-field.ts`
2. 测试 `components/common/button.ts`
3. 测试 `components/common/modal.ts`

**目标**: 通用组件 80% 覆盖率

---

### Phase 3: 集成测试（第 4 周，15-20 小时）

#### 任务 3.1: RPC 集成测试

**工作量**: 8-10 小时

**步骤**:

1. 配置 Mock Gateway
2. 测试配置加载和保存
3. 测试会话管理
4. 测试技能管理

---

#### 任务 3.2: E2E 测试

**工作量**: 7-10 小时

**步骤**:

1. 配置 Playwright
2. 编写关键用户流程测试
3. 配置 CI/CD 集成

---

### Phase 4: CI/CD 集成（第 5 周，5-8 小时）

#### 任务 4.1: GitHub Actions

**工作量**: 3-4 小时

**配置**:

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 22

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

#### 任务 4.2: 覆盖率报告

**工作量**: 2-4 小时

**步骤**:

1. 配置 Codecov
2. 添加覆盖率徽章
3. 设置覆盖率阈值

---

## 📊 测试指标

### 覆盖率目标

| 阶段        | 目标          | 时间      |
| ----------- | ------------- | --------- |
| **Phase 1** | 工具函数 100% | 第 1 周   |
| **Phase 2** | 控制器 80%    | 第 2-3 周 |
| **Phase 3** | 整体 60%      | 第 4 周   |
| **Phase 4** | 整体 70%      | 第 5 周   |

### 质量指标

| 指标             | 目标  | 说明                |
| ---------------- | ----- | ------------------- |
| **测试通过率**   | 100%  | 所有测试必须通过    |
| **测试运行时间** | <1min | 单元测试 + 集成测试 |
| **E2E 运行时间** | <5min | 完整 E2E 测试套件   |
| **覆盖率**       | >70%  | 代码覆盖率          |

---

## 📝 测试规范

### 命名规范

```typescript
// 文件命名
utils/format.ts → utils/__tests__/format.test.ts

// 测试套件命名
describe('deepMerge', () => { ... });

// 测试用例命名
it('should merge two objects', () => { ... });
it('should handle null values', () => { ... });
```

### 测试结构

```typescript
describe("Component/Function Name", () => {
  // 1. Setup
  beforeEach(() => {
    // 初始化
  });

  // 2. Happy Path
  it("should work in normal case", () => {
    // 正常情况
  });

  // 3. Edge Cases
  it("should handle empty input", () => {
    // 边界情况
  });

  it("should handle null values", () => {
    // 空值处理
  });

  // 4. Error Cases
  it("should throw error on invalid input", () => {
    // 错误情况
  });

  // 5. Cleanup
  afterEach(() => {
    // 清理
  });
});
```

---

## 🎯 总结

### 投入产出

| 投入                 | 产出               |
| -------------------- | ------------------ |
| **时间**: 48-63 小时 | **覆盖率**: 70%    |
| **人力**: 1 人       | **测试数**: 140 个 |
| **周期**: 5 周       | **质量**: 显著提升 |

### 预期收益

✅ **质量提升**: 减少 80% 的 bug  
✅ **重构安全**: 支持安全重构  
✅ **开发效率**: 减少 50% 的手动测试时间  
✅ **文档化**: 测试即文档  
✅ **信心**: 敢于修改代码

---

_文档生成时间: 2026-02-07_  
_下次更新: 完成 Phase 1 后_
