# ui-zh-CN 功能路线图

> 最后更新: 2026-02-07

## 📋 目录

- [功能刚需](#功能刚需)
- [交互刚需](#交互刚需)
- [优化建议](#优化建议)
- [实施计划](#实施计划)

---

## 🔥 功能刚需

### 1. 配置错误提示 ⭐⭐⭐⭐⭐

**优先级**: 🔴 P0  
**工作量**: 4-6 小时  
**价值**: 减少 90% 的配置错误

**痛点**:

- 配置错误后，Gateway 启动失败，用户不知道哪里错了
- 需要查日志才能定位问题，门槛高

**解决方案**:

- 实时配置验证（输入时就提示）
- 错误提示清晰（"模型 ID 不存在，可用：xxx"）
- 配置健康度评分（0-100 分）
- 一键修复常见问题

**实现要点**:

```typescript
interface ConfigValidator {
  validate(config: Config): ValidationResult;
  fix(config: Config): Config;
  score(config: Config): number;
}

const rules = [
  { check: hasValidModel, message: "模型配置无效", fix: useDefaultModel },
  { check: hasValidChannel, message: "通道配置缺失", fix: addDefaultChannel },
  { check: hasValidPermissions, message: "权限配置过于宽松", fix: tightenPermissions },
];
```

---

### 2. 会话搜索与过滤 ⭐⭐⭐⭐⭐

**优先级**: 🔴 P0  
**工作量**: 3-4 小时  
**价值**: 节省 80% 的查找时间

**痛点**:

- 会话多了之后，找不到想要的会话
- 只能一个一个翻，效率低

**解决方案**:

- 搜索框（按名称、Agent、时间）
- 快速过滤（按 Agent、模型、状态）
- 排序（按时间、名称、活跃度）
- 搜索结果高亮

**实现要点**:

```typescript
interface SessionFilter {
  query?: string;
  agentId?: string;
  model?: string;
  dateRange?: [Date, Date];
}

function filterSessions(sessions: Session[], filter: SessionFilter): Session[] {
  return sessions.filter(
    (s) =>
      matchQuery(s, filter.query) &&
      matchAgent(s, filter.agentId) &&
      matchModel(s, filter.model) &&
      matchDateRange(s, filter.dateRange),
  );
}
```

---

### 3. 批量删除会话 ⭐⭐⭐⭐

**优先级**: 🟡 P1  
**工作量**: 2-3 小时  
**价值**: 节省 90% 的操作时间

**痛点**:

- 删除多个会话，要点多次删除按钮，每次还要确认
- 测试时创建大量临时会话，清理麻烦

**解决方案**:

- 勾选多个会话
- 批量删除按钮
- 一次确认即可

**实现要点**:

```typescript
const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());

function handleBatchDelete() {
  if (confirm(`确定删除 ${selectedSessions.size} 个会话？`)) {
    Promise.all([...selectedSessions].map((key) => deleteSession(key))).then(() => refresh());
  }
}
```

---

## 🎨 交互刚需

### 1. 自动保存 ⭐⭐⭐⭐⭐

**优先级**: 🔴 P0  
**工作量**: 4-6 小时  
**价值**: 避免数据丢失

**痛点**:

- 忘记保存，刷新页面后丢失所有修改
- 用户体验极差，容易崩溃

**解决方案**:

- 每次修改后自动保存到 localStorage
- 刷新页面后自动恢复
- 顶部显示"有未保存的修改"提示
- 保存成功后清除草稿

**实现要点**:

```typescript
// 监听配置变化
watch(configForm, (newVal) => {
  localStorage.setItem("draft-config", JSON.stringify(newVal));
  showDraftIndicator();
});

// 页面加载时恢复
onMounted(() => {
  const draft = localStorage.getItem("draft-config");
  if (draft && confirm("发现未保存的修改，是否恢复？")) {
    configForm.value = JSON.parse(draft);
  }
});
```

---

### 2. 快捷键支持 ⭐⭐⭐⭐⭐

**优先级**: 🔴 P0  
**工作量**: 4-6 小时  
**价值**: 效率提升 3-5 倍

**痛点**:

- 鼠标操作太慢，效率低
- 高频操作需要快捷方式

**解决方案**:

```
Cmd/Ctrl + S  → 保存配置
Cmd/Ctrl + K  → 快速搜索（全局）
Cmd/Ctrl + F  → 当前页搜索
Cmd/Ctrl + /  → 显示快捷键帮助
Esc           → 关闭弹窗
↑↓            → 列表导航
Enter         → 确认选择
```

**实现要点**:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      openQuickSearch();
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, []);
```

---

### 3. 拖拽排序 ⭐⭐⭐⭐⭐

**优先级**: 🔴 P0  
**工作量**: 6-8 小时  
**价值**: 灵活性大幅提升

**痛点**:

- 无法调整顺序，只能删了重建
- Agent、技能、任务顺序固定

**解决方案**:

- 鼠标拖拽，直接调整顺序
- 适用于：Agent 列表、技能列表、通道列表、定时任务

**实现要点**:

```typescript
// 使用 @dnd-kit 或 react-beautiful-dnd
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

function handleDragEnd(event) {
  const { active, over } = event;
  if (active.id !== over.id) {
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    setItems(arrayMove(items, oldIndex, newIndex));
  }
}
```

---

### 4. 右键菜单 ⭐⭐⭐⭐

**优先级**: 🟡 P1  
**工作量**: 5-7 小时  
**价值**: 操作效率提升 2-3 倍

**痛点**:

- 常用操作藏得太深
- 需要点进去找按钮

**解决方案**:

```
右键 Agent：
  - 编辑配置
  - 复制配置
  - 删除 Agent
  - 查看会话
  - 查看日志

右键会话：
  - 打开会话
  - 删除会话
  - 修改模型
  - 导出对话
  - 复制会话 Key
```

**实现要点**:

```typescript
function handleContextMenu(e: MouseEvent, item: Agent) {
  e.preventDefault();
  showContextMenu({
    x: e.clientX,
    y: e.clientY,
    items: [
      { label: "编辑配置", onClick: () => editAgent(item) },
      { label: "复制配置", onClick: () => copyAgent(item) },
      { label: "删除 Agent", onClick: () => deleteAgent(item), danger: true },
    ],
  });
}
```

---

### 5. 撤销/重做 ⭐⭐⭐⭐

**优先级**: 🟡 P1  
**工作量**: 8-10 小时  
**价值**: 避免误操作

**痛点**:

- 改错了配置，无法撤销
- 只能重新填，或者刷新页面（丢失所有修改）

**解决方案**:

- Cmd/Ctrl + Z 撤销
- Cmd/Ctrl + Shift + Z 重做
- 历史记录栈

**实现要点**:

```typescript
const [history, setHistory] = useState<Config[]>([]);
const [currentIndex, setCurrentIndex] = useState(0);

function undo() {
  if (currentIndex > 0) {
    setCurrentIndex(currentIndex - 1);
    setConfig(history[currentIndex - 1]);
  }
}

function redo() {
  if (currentIndex < history.length - 1) {
    setCurrentIndex(currentIndex + 1);
    setConfig(history[currentIndex + 1]);
  }
}
```

---

## 💡 优化建议

### 样式文件拆分 ⭐⭐⭐⭐

**优先级**: 🟡 P1  
**工作量**: 4-6 小时  
**价值**: 提升开发体验

**问题**:

- `model-config.css` 7,438 行，单文件过大
- 难以维护，查找困难

**方案**:

```
styles/
├── base.css           # 基础样式 (500行)
├── config-content.css # 配置内容区 (993行)
├── skills.css         # 技能管理 (2,500行)
├── sessions.css       # 会话列表 (235行)
├── channels.css       # 通道配置 (355行)
├── permissions.css    # 权限配置 (931行)
├── cron.css           # 定时任务 (698行)
├── workspace.css      # 工作区编辑器 (540行)
├── agent.css          # Agent 设置 (165行)
└── responsive.css     # 响应式 (236行)
```

---

### 大文件拆分 ⭐⭐⭐

**优先级**: 🟢 P2  
**工作量**: 6-8 小时  
**价值**: 提升可维护性

**待拆分文件**:

- `workspace-content.ts` (661行) → 按功能拆分为 5-6 个子组件
- `agent-overview.ts` (661行) → 会话管理、模型配置、身份信息独立
- `config-loader.ts` (587行) → 按职责拆分（加载/解析/验证）

---

## 📅 实施计划

### 第一阶段：核心刚需（本周，18-24 小时）

**功能**:

1. ✅ 配置错误提示（4-6h）
2. ✅ 会话搜索过滤（3-4h）
3. ✅ 批量删除会话（2-3h）

**交互**: 4. ✅ 自动保存（4-6h）5. ✅ 快捷键支持（4-6h）

**预期成果**:

- 配置不再出错
- 会话管理效率提升 10 倍
- 避免数据丢失
- 操作效率提升 3-5 倍

---

### 第二阶段：体验优化（下周，20-30 小时）

**交互**: 6. 拖拽排序（6-8h）7. 右键菜单（5-7h）8. 撤销/重做（8-10h）

**优化**: 9. 样式文件拆分（4-6h）

**预期成果**:

- 交互体验质的飞跃
- 代码可维护性提升

---

### 第三阶段：长期规划（40+ 小时）

**功能**:

- Token 使用统计
- 配置向导系统
- 数据可视化仪表板
- 协作功能

**优化**:

- 大文件拆分
- 性能优化
- 测试覆盖

---

## 📊 优先级矩阵

| 功能         | 刚需程度   | 工作量 | 立即价值          | 优先级 |
| ------------ | ---------- | ------ | ----------------- | ------ |
| 配置错误提示 | 🔥🔥🔥🔥🔥 | 4-6h   | 减少 90% 配置错误 | 🔴 P0  |
| 会话搜索     | 🔥🔥🔥🔥🔥 | 3-4h   | 节省 80% 查找时间 | 🔴 P0  |
| 自动保存     | 🔥🔥🔥🔥🔥 | 4-6h   | 避免数据丢失      | 🔴 P0  |
| 快捷键       | 🔥🔥🔥🔥🔥 | 4-6h   | 效率提升 3-5 倍   | 🔴 P0  |
| 拖拽排序     | 🔥🔥🔥🔥🔥 | 6-8h   | 灵活性大幅提升    | 🔴 P0  |
| 批量删除     | 🔥🔥🔥🔥   | 2-3h   | 节省 90% 操作时间 | 🟡 P1  |
| 右键菜单     | 🔥🔥🔥🔥   | 5-7h   | 效率提升 2-3 倍   | 🟡 P1  |
| 撤销/重做    | 🔥🔥🔥🔥   | 8-10h  | 避免误操作        | 🟡 P1  |
| 样式拆分     | 🔥🔥🔥🔥   | 4-6h   | 提升开发体验      | 🟡 P1  |

---

## 🎯 关键洞察

1. **不要追求大而全**，先做高 ROI 的小功能
2. **交互体验是核心**，直接影响用户满意度
3. **避免数据丢失**是底线，必须优先解决
4. **效率提升**是关键，快捷键、搜索、批量操作
5. **保持独立**，不要依赖主项目的修改

---

## 📝 更新日志

- 2026-02-07: 初始版本，定义核心刚需和实施计划
