# ui-zh-CN 组件库设计规范

> 最后更新: 2026-02-07  
> 分析版本: v3.0 (32f99dd5e)

## 📋 目录

- [设计系统概览](#设计系统概览)
- [现有组件分析](#现有组件分析)
- [设计原则](#设计原则)
- [组件分类](#组件分类)
- [基础组件](#基础组件)
- [业务组件](#业务组件)
- [样式规范](#样式规范)
- [命名规范](#命名规范)
- [组件开发指南](#组件开发指南)
- [待开发组件](#待开发组件)

---

## 🎨 设计系统概览

### 设计理念

**ui-zh-CN 设计系统**基于以下核心理念：

1. **一致性** - 统一的视觉语言和交互模式
2. **简洁性** - 去除不必要的装饰，专注功能
3. **可访问性** - 支持键盘导航和屏幕阅读器
4. **响应式** - 适配桌面、平板、手机
5. **可组合** - 小组件组合成大组件

### 设计语言

| 元素     | 规范     | 说明                                              |
| -------- | -------- | ------------------------------------------------- |
| **颜色** | CSS 变量 | `--accent`, `--text`, `--bg-elevated` 等          |
| **字体** | 系统字体 | `-apple-system, BlinkMacSystemFont, "Segoe UI"`   |
| **圆角** | 4 级     | `--radius-sm/md/lg/xl` (4px/8px/12px/16px)        |
| **阴影** | 3 级     | `--shadow-sm/md/lg`                               |
| **间距** | 8px 基准 | 4px, 8px, 12px, 16px, 20px, 24px                  |
| **动画** | 统一时长 | `--duration-fast/normal/slow` (150ms/250ms/400ms) |

---

## 📊 现有组件分析

### 组件统计

| 类型         | 数量 | 完成度 | 说明                                          |
| ------------ | ---- | ------ | --------------------------------------------- |
| **通用组件** | 6    | 🟢 80% | button, form-field, modal, list, state, icons |
| **业务组件** | 68   | 🟡 60% | agent, channels, skills, cron, permissions 等 |
| **总计**     | 74   | 🟡 65% | 基础组件完善，业务组件待优化                  |

### 通用组件库 (`components/common/`)

| 组件              | 文件大小 | 功能                               | 状态    |
| ----------------- | -------- | ---------------------------------- | ------- |
| **button.ts**     | 3.1K     | 按钮、图标按钮、按钮组             | ✅ 完成 |
| **form-field.ts** | 11K      | 表单字段（输入框、下拉框、开关等） | ✅ 完成 |
| **modal.ts**      | 5.4K     | 弹窗、确认弹窗、表单弹窗           | ✅ 完成 |
| **list.ts**       | 5.1K     | 列表、列表项、分组列表             | ✅ 完成 |
| **state.ts**      | 7.4K     | 加载、错误、空状态、连接状态       | ✅ 完成 |
| **icons.ts**      | -        | 图标组件                           | ✅ 完成 |

**总代码量**: ~32K (6个文件)

### 业务组件分布

| 模块             | 组件数 | 代码量   | 复用度 |
| ---------------- | ------ | -------- | ------ |
| **agent/**       | 2      | ~1,000行 | 🟡 中  |
| **channels/**    | 8      | ~2,500行 | 🟢 高  |
| **skills/**      | 12     | ~3,000行 | 🟡 中  |
| **cron/**        | 8      | ~2,000行 | 🟢 高  |
| **permissions/** | 7      | ~2,500行 | 🟢 高  |
| **providers/**   | 8      | ~2,500行 | 🟢 高  |
| **tools/**       | 5      | ~1,500行 | 🟡 中  |
| **其他**         | 18     | ~5,000行 | 🟢 高  |

---

## 🎯 设计原则

### 1. 组件化原则

**单一职责**:

- 每个组件只做一件事
- 复杂组件由简单组件组合

**可组合**:

- 小组件可以组合成大组件
- 避免巨型组件

**可复用**:

- 通用逻辑提取到通用组件
- 业务逻辑保留在业务组件

### 2. API 设计原则

**简单优先**:

```typescript
// ✅ 好：简单直接
renderButton({ label: "保存", onClick: handleSave });

// ❌ 差：过度设计
renderButton({
  config: { text: { value: "保存" } },
  handlers: { click: { fn: handleSave } },
});
```

**合理默认值**:

```typescript
// ✅ 好：有默认值
renderButton({ label: "保存", onClick: handleSave });
// variant 默认 "primary", size 默认 "medium"

// ❌ 差：必须传所有参数
renderButton({
  label: "保存",
  onClick: handleSave,
  variant: "primary",
  size: "medium",
});
```

**类型安全**:

```typescript
// ✅ 好：严格类型
type ButtonVariant = "primary" | "secondary" | "danger";

// ❌ 差：字符串类型
type ButtonVariant = string;
```

### 3. 样式设计原则

**CSS 变量优先**:

```css
/* ✅ 好：使用 CSS 变量 */
.btn {
  background: var(--accent);
  border-radius: var(--radius-md);
}

/* ❌ 差：硬编码 */
.btn {
  background: #ff4d4d;
  border-radius: 8px;
}
```

**BEM 命名**:

```css
/* ✅ 好：BEM 命名 */
.btn {
}
.btn--primary {
}
.btn__icon {
}

/* ❌ 差：随意命名 */
.button {
}
.buttonPrimary {
}
.icon {
}
```

---

## 📦 组件分类

### 基础组件（Foundation）

**定义**: 最底层的原子组件，不依赖其他组件

| 组件     | 用途   | 状态      |
| -------- | ------ | --------- |
| Button   | 按钮   | ✅ 完成   |
| Input    | 输入框 | ⏳ 待提取 |
| Select   | 下拉框 | ⏳ 待提取 |
| Checkbox | 复选框 | ⏳ 待提取 |
| Radio    | 单选框 | ⏳ 待提取 |
| Toggle   | 开关   | ✅ 完成   |
| Textarea | 文本域 | ✅ 完成   |
| Icon     | 图标   | ✅ 完成   |

### 组合组件（Composite）

**定义**: 由基础组件组合而成，提供更高级的功能

| 组件      | 用途                       | 状态      |
| --------- | -------------------------- | --------- |
| FormField | 表单字段（标签+输入+提示） | ✅ 完成   |
| Modal     | 弹窗                       | ✅ 完成   |
| List      | 列表                       | ✅ 完成   |
| Card      | 卡片                       | ⏳ 待提取 |
| Tabs      | 标签页                     | ⏳ 待提取 |
| Dropdown  | 下拉菜单                   | ⏳ 待开发 |
| Toast     | 提示消息                   | ⏳ 待开发 |
| Tooltip   | 工具提示                   | ⏳ 待开发 |

### 状态组件（State）

**定义**: 表示不同状态的组件

| 组件            | 用途     | 状态      |
| --------------- | -------- | --------- |
| LoadingState    | 加载状态 | ✅ 完成   |
| ErrorState      | 错误状态 | ✅ 完成   |
| EmptyState      | 空状态   | ✅ 完成   |
| ConnectionState | 连接状态 | ✅ 完成   |
| Skeleton        | 骨架屏   | ⏳ 待开发 |
| Progress        | 进度条   | ⏳ 待开发 |

### 业务组件（Business）

**定义**: 特定业务场景的组件，依赖业务逻辑

| 组件        | 用途         | 状态    |
| ----------- | ------------ | ------- |
| AgentCard   | Agent 卡片   | ✅ 完成 |
| SessionList | 会话列表     | ✅ 完成 |
| SkillCard   | 技能卡片     | ✅ 完成 |
| CronJobCard | 定时任务卡片 | ✅ 完成 |
| ChannelCard | 通道卡片     | ✅ 完成 |

---

## 🧩 基础组件

### Button 按钮

**用途**: 触发操作

**变体**:

- `primary` - 主要按钮（强调）
- `secondary` - 次要按钮（默认）
- `danger` - 危险按钮（删除）
- `ghost` - 幽灵按钮（透明）
- `link` - 链接按钮（无边框）

**尺寸**:

- `small` - 小按钮（28px）
- `medium` - 中按钮（36px，默认）
- `large` - 大按钮（44px）

**API**:

```typescript
type ButtonProps = {
  label: string; // 按钮文字
  onClick: () => void; // 点击事件
  variant?: ButtonVariant; // 变体（默认 primary）
  size?: ButtonSize; // 尺寸（默认 medium）
  icon?: TemplateResult; // 图标
  iconPosition?: "left" | "right"; // 图标位置（默认 left）
  loading?: boolean; // 加载状态
  disabled?: boolean; // 禁用状态
  className?: string; // 自定义类名
};
```

**示例**:

```typescript
// 基础按钮
renderButton({ label: "保存", onClick: handleSave });

// 危险按钮
renderButton({
  label: "删除",
  onClick: handleDelete,
  variant: "danger",
});

// 加载状态
renderButton({
  label: "保存",
  onClick: handleSave,
  loading: true,
});

// 带图标
renderButton({
  label: "刷新",
  onClick: handleRefresh,
  icon: icons.refresh,
});
```

---

### FormField 表单字段

**用途**: 统一的表单字段组件（标签+输入+提示）

**类型**:

- `text` - 文本输入框
- `password` - 密码输入框
- `number` - 数字输入框
- `select` - 下拉框
- `toggle` - 开关
- `textarea` - 文本域
- `array` - 数组输入（多行）

**API**:

```typescript
type FormFieldProps = {
  label: string; // 字段标签
  value: unknown; // 字段值
  onChange: (value: unknown) => void; // 变更事件
  type?: FormFieldType; // 字段类型（默认 text）
  placeholder?: string; // 占位符
  description?: string; // 字段说明
  error?: string; // 错误提示
  required?: boolean; // 必填标记
  disabled?: boolean; // 禁用状态
  options?: SelectOption[]; // 下拉框选项
};
```

**示例**:

```typescript
// 文本输入框
renderFormField({
  label: "Agent 名称",
  value: agentName,
  onChange: setAgentName,
  placeholder: "输入 Agent 名称",
  required: true,
});

// 下拉框
renderFormField({
  label: "模型",
  value: model,
  onChange: setModel,
  type: "select",
  options: [
    { value: "gpt-4", label: "GPT-4" },
    { value: "claude-3", label: "Claude 3" },
  ],
});

// 开关
renderFormField({
  label: "启用技能",
  value: enabled,
  onChange: setEnabled,
  type: "toggle",
});
```

---

### Modal 弹窗

**用途**: 显示模态对话框

**尺寸**:

- `small` - 小弹窗（400px）
- `medium` - 中弹窗（600px，默认）
- `large` - 大弹窗（800px）
- `full` - 全屏弹窗

**API**:

```typescript
type ModalProps = {
  title: string; // 弹窗标题
  content: TemplateResult; // 弹窗内容
  onClose: () => void; // 关闭事件
  size?: ModalSize; // 尺寸（默认 medium）
  footer?: TemplateResult; // 底部按钮
  closeOnOverlay?: boolean; // 点击遮罩关闭（默认 true）
};
```

**示例**:

```typescript
// 基础弹窗
renderModal({
  title: "新建会话",
  content: html`<div>弹窗内容</div>`,
  onClose: handleClose,
  footer: html`
    <button @click=${handleClose}>取消</button>
    <button @click=${handleConfirm}>确认</button>
  `,
});

// 确认弹窗
renderConfirmModal({
  title: "删除确认",
  message: "确定要删除这个会话吗？",
  onConfirm: handleDelete,
  onCancel: handleClose,
  danger: true,
});
```

---

### List 列表

**用途**: 显示列表数据

**API**:

```typescript
type ListProps<T> = {
  items: T[]; // 列表数据
  renderItem: (item: T) => TemplateResult; // 渲染函数
  emptyText?: string; // 空状态文字
  loading?: boolean; // 加载状态
  selectable?: boolean; // 可选择
  selectedItems?: Set<T>; // 已选项
  onSelect?: (item: T) => void; // 选择事件
};
```

**示例**:

```typescript
// 基础列表
renderList({
  items: sessions,
  renderItem: (session) => html`
    <div class="session-item">
      <span>${session.name}</span>
      <button @click=${() => handleDelete(session)}>删除</button>
    </div>
  `,
  emptyText: "暂无会话",
});

// 可选择列表
renderList({
  items: sessions,
  renderItem: (session) =>
    renderSelectableListItem({
      label: session.name,
      value: session.key,
      selected: selectedSessions.has(session.key),
      onSelect: () => handleSelect(session),
    }),
  selectable: true,
});
```

---

## 🏢 业务组件

### AgentCard Agent 卡片

**用途**: 显示 Agent 信息

**API**:

```typescript
type AgentCardProps = {
  agent: Agent; // Agent 数据
  selected?: boolean; // 选中状态
  onClick?: () => void; // 点击事件
  onEdit?: () => void; // 编辑事件
  onDelete?: () => void; // 删除事件
};
```

---

### SessionList 会话列表

**用途**: 显示会话列表

**API**:

```typescript
type SessionListProps = {
  sessions: Session[]; // 会话数据
  loading?: boolean; // 加载状态
  error?: string; // 错误信息
  onRefresh?: () => void; // 刷新事件
  onSelect?: (session: Session) => void; // 选择事件
  onDelete?: (session: Session) => void; // 删除事件
};
```

---

## 🎨 样式规范

### CSS 类命名规范

**前缀**: `mc-` (Model Config)

**结构**:

```
mc-{component}
mc-{component}--{modifier}
mc-{component}__{element}
mc-{component}__{element}--{modifier}
```

**示例**:

```css
/* 组件 */
.mc-btn {
}

/* 修饰符 */
.mc-btn--primary {
}
.mc-btn--small {
}

/* 元素 */
.mc-btn__icon {
}
.mc-btn__label {
}

/* 元素修饰符 */
.mc-btn__icon--left {
}
```

### CSS 变量

**颜色**:

```css
--accent: #ff4d4d; /* 主题色 */
--accent-hover: #e63946; /* 主题色悬停 */
--accent-subtle: rgba(255, 77, 77, 0.1); /* 主题色淡化 */

--text: #e0e0e0; /* 文字颜色 */
--muted: #888; /* 次要文字 */

--bg: #1a1a1a; /* 背景色 */
--bg-elevated: #242424; /* 提升背景 */
--bg-hover: #2a2a2a; /* 悬停背景 */
--bg-accent: #1e1e1e; /* 强调背景 */

--border: #333; /* 边框颜色 */
--border-strong: #444; /* 强边框 */

--ok: #22c55e; /* 成功色 */
--ok-subtle: rgba(34, 197, 94, 0.1);

--danger: #ef4444; /* 危险色 */
--danger-subtle: rgba(239, 68, 68, 0.1);
```

**尺寸**:

```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-full: 9999px;

--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 400ms;

--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
```

---

## 📝 命名规范

### 组件命名

**文件名**: `kebab-case.ts`

```
button.ts
form-field.ts
agent-card.ts
```

**函数名**: `renderXxx`

```typescript
renderButton();
renderFormField();
renderAgentCard();
```

**类型名**: `PascalCase`

```typescript
ButtonProps;
FormFieldType;
AgentCardProps;
```

### 变量命名

**Props**: `camelCase`

```typescript
onClick;
onChange;
isDisabled;
hasError;
```

**CSS 类**: `kebab-case`

```css
.mc-btn
.mc-btn--primary
.mc-btn__icon
```

---

## 🛠️ 组件开发指南

### 1. 创建新组件

**步骤**:

1. 在 `components/common/` 创建文件
2. 定义类型
3. 实现渲染函数
4. 导出到 `index.ts`
5. 添加样式到 `styles/`
6. 编写文档

**模板**:

```typescript
/**
 * 组件名称
 */
import { html, type TemplateResult } from "lit";

// ============================================
// 类型定义
// ============================================

export type XxxProps = {
  // props 定义
};

// ============================================
// 渲染函数
// ============================================

/**
 * 渲染 Xxx
 */
export function renderXxx(props: XxxProps): TemplateResult {
  return html`
    <div class="mc-xxx">
      <!-- 组件内容 -->
    </div>
  `;
}
```

### 2. 组件测试

**手动测试**:

1. 在页面中使用组件
2. 测试各种状态（正常、加载、错误、禁用）
3. 测试交互（点击、输入、选择）
4. 测试响应式（桌面、平板、手机）

**自动测试**（待实现）:

```typescript
describe("renderButton", () => {
  it("should render button with label", () => {
    const result = renderButton({ label: "保存", onClick: () => {} });
    expect(result).toContain("保存");
  });

  it("should call onClick when clicked", () => {
    const onClick = jest.fn();
    const result = renderButton({ label: "保存", onClick });
    // simulate click
    expect(onClick).toHaveBeenCalled();
  });
});
```

---

## 🚧 待开发组件

### 高优先级 🔴

#### 1. Toast 提示消息

**用途**: 显示操作反馈（成功、失败、警告）

**API**:

```typescript
type ToastProps = {
  message: string;
  type?: "success" | "error" | "warning" | "info";
  duration?: number; // 默认 3000ms
  onClose?: () => void;
};

// 使用
showToast({ message: "保存成功", type: "success" });
```

**工作量**: 3-4 小时

---

#### 2. SearchBox 搜索框

**用途**: 搜索和过滤

**API**:

```typescript
type SearchBoxProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSearch?: (value: string) => void;
  debounce?: number; // 防抖延迟（默认 300ms）
};
```

**工作量**: 2-3 小时

---

#### 3. Checkbox 复选框

**用途**: 多选、批量操作

**API**:

```typescript
type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  indeterminate?: boolean; // 半选状态
};
```

**工作量**: 2-3 小时

---

### 中优先级 🟡

#### 4. Dropdown 下拉菜单

**用途**: 右键菜单、操作菜单

**API**:

```typescript
type DropdownProps = {
  trigger: TemplateResult;
  items: Array<{
    label: string;
    onClick: () => void;
    icon?: TemplateResult;
    danger?: boolean;
    disabled?: boolean;
  }>;
  placement?: "bottom" | "top" | "left" | "right";
};
```

**工作量**: 4-5 小时

---

#### 5. Tabs 标签页

**用途**: 切换不同内容

**API**:

```typescript
type TabsProps = {
  tabs: Array<{
    key: string;
    label: string;
    content: TemplateResult;
  }>;
  activeKey: string;
  onChange: (key: string) => void;
};
```

**工作量**: 3-4 小时

---

#### 6. Tooltip 工具提示

**用途**: 显示提示信息

**API**:

```typescript
type TooltipProps = {
  content: string | TemplateResult;
  children: TemplateResult;
  placement?: "top" | "bottom" | "left" | "right";
  delay?: number; // 默认 200ms
};
```

**工作量**: 3-4 小时

---

### 低优先级 🟢

#### 7. Skeleton 骨架屏

**用途**: 加载占位

**工作量**: 2-3 小时

---

#### 8. Progress 进度条

**用途**: 显示进度

**工作量**: 2-3 小时

---

#### 9. Badge 徽章

**用途**: 显示数量、状态

**工作量**: 1-2 小时

---

## 📊 组件库评分

| 维度         | 评分       | 说明                           |
| ------------ | ---------- | ------------------------------ |
| **完整性**   | ⭐⭐⭐⭐   | 基础组件完善，缺少部分高级组件 |
| **一致性**   | ⭐⭐⭐⭐⭐ | 统一的设计语言和 API 风格      |
| **可复用性** | ⭐⭐⭐⭐   | 通用组件复用度高               |
| **文档**     | ⭐⭐       | 缺少组件文档和示例             |
| **测试**     | ⭐         | 无单元测试                     |

**总体评价**: ⭐⭐⭐⭐ (4/5)

**优势**:

- ✅ 基础组件完善
- ✅ API 设计合理
- ✅ 样式统一

**不足**:

- ❌ 缺少部分高级组件（Toast、Dropdown、Tooltip）
- ❌ 缺少组件文档
- ❌ 无单元测试

---

## 🎯 下一步行动

### 立即行动（本周）

1. ✅ 开发 Toast 组件（3-4h）
2. ✅ 开发 SearchBox 组件（2-3h）
3. ✅ 开发 Checkbox 组件（2-3h）

### 短期计划（下周）

4. 开发 Dropdown 组件（4-5h）
5. 开发 Tabs 组件（3-4h）
6. 开发 Tooltip 组件（3-4h）

### 长期规划（1-2月）

7. 完善组件文档
8. 添加单元测试
9. 开发 Storybook

---

## 📝 更新日志

- 2026-02-07: 初始版本，完成组件库设计规范
