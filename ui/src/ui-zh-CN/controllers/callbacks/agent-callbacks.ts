import type { GatewayAgentRow } from "../../../ui/types";
import type { AgentsConfigProps } from "../../views/agents/types";
/**
 * Agent 选择/侧边栏/向导 回调
 */
import type { CallbackContext } from "./types";
import {
  loadAgentSessions,
  loadWorkspaceFiles,
  saveModelConfig,
  setDefaultAgent,
  duplicateAgent,
  exportAgent,
  deleteAgent,
} from "../model-config";

type Pick_ = Pick<
  AgentsConfigProps,
  | "onAgentSelect"
  | "onPanelChange"
  | "onGlobalPanelChange"
  | "onRefresh"
  | "onSetDefault"
  | "onSidebarSearchChange"
  | "onSidebarToggleMenu"
  | "onAgentDuplicate"
  | "onAgentExport"
  | "onAgentDelete"
  | "onCreateAgent"
  | "onAgentWizardComplete"
  | "onAgentWizardCancel"
>;

export function createAgentCallbacks(
  ctx: CallbackContext,
  extra: {
    loadInitialData: () => void;
    loadAgentIdentity: (agentId: string) => void;
    loadSkillsStatus: () => Promise<void>;
    loadCron: () => void;
    loadPermissions: () => Promise<void>;
  },
): Pick_ {
  const { s, update } = ctx;

  return {
    onAgentSelect: (agentId) => {
      const previousAgentId = s.selectedAgentId;
      s.selectedAgentId = agentId;
      s.globalPanel = null;
      s.activePanel = "overview";

      if (previousAgentId !== agentId) {
        s.workspaceSelectedFile = null;
        s.workspaceEditorContent = "";
        s.workspaceOriginalContent = "";
        s.workspaceAgentId = agentId;
        s.workspaceFiles = undefined;
        s.workspaceDir = undefined;
        loadWorkspaceFiles(s).then(update);
      }

      extra.loadAgentIdentity(agentId);
      loadAgentSessions(s, agentId).then(update);
      update();
    },

    onPanelChange: (panel) => {
      s.activePanel = panel;
      if (panel === "overview" && s.selectedAgentId) {
        loadAgentSessions(s, s.selectedAgentId).then(update);
      } else if (panel === "files" && s.selectedAgentId) {
        s.workspaceAgentId = s.selectedAgentId;
        loadWorkspaceFiles(s).then(update);
      } else if (panel === "skills" && s.selectedAgentId) {
        extra.loadSkillsStatus().then(update);
      } else if (panel === "cron") {
        extra.loadCron();
      } else if (panel === "tools") {
        extra.loadPermissions().then(update);
      }
      update();
    },

    onGlobalPanelChange: (panel) => {
      s.globalPanel = panel;
      if (panel) {
        s.selectedAgentId = null;
      } else {
        const agents = s.agentsList?.agents ?? [];
        s.selectedAgentId = agents.length > 0 ? (s.agentsList?.defaultId ?? agents[0].id) : null;
      }
      update();
    },

    onRefresh: () => extra.loadInitialData(),

    onSetDefault: (agentId) => {
      setDefaultAgent(s, agentId);
      if (s.agentsList) {
        s.agentsList = { ...s.agentsList, defaultId: agentId };
      }
      update();
    },

    onSidebarSearchChange: (query) => {
      s.sidebarSearchQuery = query;
      update();
    },

    onSidebarToggleMenu: (agentId, top, right) => {
      s.sidebarOpenMenuId = agentId;
      s.sidebarMenuTop = top ?? null;
      s.sidebarMenuRight = right ?? null;
      update();
    },

    onAgentDuplicate: (agentId) => {
      const newId = duplicateAgent(s, agentId);
      s.sidebarOpenMenuId = null;
      if (newId) {
        s.selectedAgentId = newId;
        saveModelConfig(s).then(update);
      } else {
        update();
      }
    },

    onAgentExport: (agentId) => {
      exportAgent(s, agentId);
      s.sidebarOpenMenuId = null;
      update();
    },

    onAgentDelete: (agentId) => {
      if (!confirm(`确定要删除 Agent "${agentId}" 吗？`)) {
        return;
      }
      const deleted = deleteAgent(s, agentId);
      s.sidebarOpenMenuId = null;
      if (deleted) {
        if (s.selectedAgentId === agentId) {
          s.selectedAgentId = s.modelConfigAgentsList[0]?.id ?? null;
        }
        saveModelConfig(s).then(update);
      } else {
        update();
      }
    },

    onCreateAgent: () => {
      s.showAgentWizard = true;
      update();
    },

    onAgentWizardComplete: (data) => {
      if (data._refresh) {
        update();
        return;
      }

      const newAgent = {
        id: data.id,
        name: data.displayName || data.id,
        workspace: data.workspace || `agents/${data.id}`,
      };

      if (s.modelConfigFullSnapshot) {
        const config = JSON.parse(JSON.stringify(s.modelConfigFullSnapshot)) as Record<
          string,
          unknown
        >;
        const agents = (config.agents ?? {}) as Record<string, unknown>;
        const list = (agents.list ?? []) as Array<Record<string, unknown>>;
        list.push(newAgent);
        agents.list = list;
        config.agents = agents;
        s.modelConfigFullSnapshot = config;

        s.modelConfigAgentsList = list.map((a) => ({
          id: (a.id as string) ?? "",
          name: a.name as string | undefined,
          default: a.default as boolean | undefined,
          workspace: a.workspace as string | undefined,
        })) as GatewayAgentRow[];
      }

      s.selectedAgentId = data.id;

      saveModelConfig(s)
        .then(async () => {
          let fileErrors: string[] = [];
          if (s.client && s.connected) {
            const agentId = data.id;
            const displayName = data.displayName || data.id;
            const emoji = data.emoji || "🤖";
            const systemPrompt = data.systemPrompt || "";

            const files = [
              {
                name: "IDENTITY.md",
                content: `# IDENTITY.md - 身份标识\n\n- **Name:** ${displayName}\n- **Creature:** AI Agent\n- **Vibe:** 专业、友好\n- **Emoji:** ${emoji}\n- **Specialty:** 通用助手\n`,
              },
              {
                name: "SOUL.md",
                content: systemPrompt
                  ? `# SOUL.md - 灵魂\n\n${systemPrompt}\n`
                  : `# SOUL.md - 灵魂\n\n*我是 ${displayName}，一个 AI 助手。*\n\n## 核心身份\n\n友好、专业的 AI 助手。\n\n## 工作原则\n\n- 准确理解用户意图\n- 提供有价值的回答\n- 语言简洁清晰\n`,
              },
              {
                name: "AGENTS.md",
                content: `# AGENTS.md - ${displayName}\n\n## 身份\n\n我是 ${displayName}。\n\n## 工作流程\n\n1. 分析任务需求\n2. 制定实现方案\n3. 执行并验证\n\n## 工具使用\n\n- \`read\`: 阅读文件\n- \`exec\`: 运行命令\n- \`write\`: 创建文件\n- \`edit\`: 修改文件\n\n## 完成任务后\n\n- 汇报完成情况\n- 列出修改的文件\n- 说明如何验证\n`,
              },
              {
                name: "TOOLS.md",
                content: `# TOOLS.md - 工具配置\n\n## 常用命令\n\n\`\`\`bash\n# 示例命令\nls -la\n\`\`\`\n\n## 项目路径\n\n（待记录具体项目路径）\n`,
              },
              {
                name: "USER.md",
                content: `# USER.md - 关于用户\n\n- **Name:** 用户\n- **What to call them:** 你\n- **Timezone:** Asia/Shanghai\n- **Notes:**\n`,
              },
              {
                name: "MEMORY.md",
                content: `# MEMORY.md - 长期记忆\n\n## 项目经验\n\n（待记录）\n\n## 技术偏好\n\n（待记录）\n\n## 教训与经验\n\n（待记录）\n`,
              },
            ];

            for (const file of files) {
              try {
                await s.client.request("workspace.file.write", {
                  agentId,
                  fileName: file.name,
                  content: file.content,
                });
              } catch (err) {
                console.warn(`[createAgent] 创建 ${file.name} 失败:`, err);
                fileErrors.push(file.name);
              }
            }
          }

          s.showAgentWizard = false;
          if (fileErrors.length > 0) {
            s.lastError = `Agent 已创建，但以下文件创建失败: ${fileErrors.join(", ")}`;
          }
          update();
        })
        .catch((err) => {
          console.error("[createAgent] 保存配置失败:", err);
          s.lastError = `创建 Agent 失败: ${String(err)}`;
          s.showAgentWizard = false;
          update();
        });
    },

    onAgentWizardCancel: () => {
      s.showAgentWizard = false;
      update();
    },
  };
}
