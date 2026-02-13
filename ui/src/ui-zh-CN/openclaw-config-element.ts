/**
 * OpenClaw 配置页面 Web Component
 * 自包含组件，只需传入 client 和 connected
 *
 * 使用方式：
 * <openclaw-config-zh
 *   .client=${gatewayClient}
 *   .connected=${isConnected}
 * ></openclaw-config-zh>
 */

import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { GatewayBrowserClient } from "../ui/gateway";
import type { AgentsListResult, AgentIdentityResult, GatewayAgentRow } from "../ui/types";
import type { AgentPanel, GlobalPanel } from "./types/agents-config";
// 回调工厂
import {
  createAgentCallbacks,
  createConfigCallbacks,
  createFileCallbacks,
  createToolsCallbacks,
  createSkillsCallbacks,
  createCronCallbacks,
  createChannelCallbacks,
  createSessionCallbacks,
} from "./controllers/callbacks";
import {
  loadCronJobs,
  createInitialCronState,
  type CronConfigState,
} from "./controllers/cron-config";
// 控制器
import {
  loadModelConfig,
  loadAgentSessions,
  loadPermissions,
  createInitialModelConfigState,
  type ModelConfigState,
} from "./controllers/model-config";
// Props 构建器
import { buildPropsData } from "./controllers/props-builder";
import {
  loadSkillsStatus as _loadSkillsStatus,
  createInitialSkillsConfigState,
  type SkillsConfigState,
} from "./controllers/skills-config";
// 渲染
import { renderAgentsConfig, type AgentsConfigProps } from "./views/agents-config";

// 内部状态类型
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
type InternalState = ModelConfigState &
  SkillsConfigState &
  CronConfigState & {
    agentsList: AgentsListResult | null;
    agentsLoading: boolean;
    agentsError: string | null;
    selectedAgentId: string | null;
    activePanel: AgentPanel;
    globalPanel: GlobalPanel | null;
    sidebarSearchQuery: string;
    sidebarOpenMenuId: string | null;
    sidebarMenuTop: number | null;
    sidebarMenuRight: number | null;
    agentIdentityLoading: boolean;
    agentIdentityError: string | null;
    agentIdentityById: Record<string, AgentIdentityResult>;
    filesEditorMode: "edit" | "preview" | "split";
    filesExpandedFolders: Set<string>;
    filesMobileView: "list" | "editor";
    sessionCreateShow: boolean;
    sessionCreateName: string;
    sessionCreateModel: string | null;
    sessionCreating: boolean;
    showAgentWizard: boolean;
  };
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

@customElement("openclaw-config-zh")
export class OpenClawConfigElement extends LitElement {
  override createRenderRoot() {
    return this;
  }

  // ============================================
  // 外部属性
  // ============================================

  @property({ attribute: false })
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  client: GatewayBrowserClient | null = null;

  @property({ type: Boolean })
  connected = false;

  // ============================================
  // 内部状态
  // ============================================

  @state()
  private _state: InternalState = this._createInitialState();

  /** 暴露给回调工厂（避免循环依赖） */
  _getState() {
    return this._state;
  }

  private _createInitialState(): InternalState {
    return {
      ...createInitialModelConfigState(),
      ...createInitialSkillsConfigState(),
      ...createInitialCronState(),
      agentsList: null,
      agentsLoading: false,
      agentsError: null,
      selectedAgentId: null,
      activePanel: "overview",
      globalPanel: null,
      sidebarSearchQuery: "",
      sidebarOpenMenuId: null,
      sidebarMenuTop: null,
      sidebarMenuRight: null,
      agentIdentityLoading: false,
      agentIdentityError: null,
      agentIdentityById: {},
      filesEditorMode: "edit",
      filesExpandedFolders: new Set(),
      filesMobileView: "list",
      sessionCreateShow: false,
      sessionCreateName: "",
      sessionCreateModel: null,
      sessionCreating: false,
      showAgentWizard: false,
    } as InternalState;
  }

  // ============================================
  // 生命周期
  // ============================================

  private _isLoadingInitialData = false;

  override connectedCallback() {
    super.connectedCallback();
    this._syncClientState();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
  }

  override updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has("client") || changedProperties.has("connected")) {
      this._syncClientState();
    }
  }

  private _syncClientState() {
    const wasConnected = this._state.connected;
    this._state.client = this.client;
    this._state.connected = this.connected;

    if (this.connected && this.client && !this._state.agentsList) {
      void this._loadInitialData();
    }
    if (this.connected && this.client && !wasConnected && this._state.agentsList) {
      void this._loadInitialData();
    }
    this.requestUpdate();
  }

  // ============================================
  // 数据加载
  // ============================================

  private async _loadInitialData() {
    if (!this.client || !this.connected) {
      return;
    }
    if (this._isLoadingInitialData) {
      return;
    }

    this._isLoadingInitialData = true;
    this._state.agentsLoading = true;
    this._state.agentsError = null;
    this.requestUpdate();

    try {
      const agentsRes = await this.client.request<AgentsListResult>("agents.list", {});
      this._state.agentsList = agentsRes;

      const defaultAgentId = agentsRes?.defaultId ?? agentsRes?.agents?.[0]?.id;
      if (!this._state.selectedAgentId && defaultAgentId) {
        this._state.selectedAgentId = defaultAgentId;
      }

      const agentIds = (agentsRes?.agents ?? []).map((a: GatewayAgentRow) => a.id);
      await Promise.all([
        loadModelConfig(this._state),
        this._loadAgentIdentities(agentIds),
        this._loadChannelsStatus(),
      ]);

      if (this._state.selectedAgentId) {
        await loadAgentSessions(this._state, this._state.selectedAgentId);
      }
    } catch (err) {
      this._state.agentsError = `加载失败: ${String(err)}`;
    } finally {
      this._isLoadingInitialData = false;
      this._state.agentsLoading = false;
      this.requestUpdate();
    }
  }

  private async _loadAgentIdentity(agentId: string) {
    if (!this.client || !this.connected) {
      return;
    }
    if (this._state.agentIdentityById[agentId]) {
      return;
    }

    this._state.agentIdentityLoading = true;
    this._state.agentIdentityError = null;

    try {
      const res = await this.client.request<AgentIdentityResult>("agent.identity.get", { agentId });
      if (res) {
        this._state.agentIdentityById = { ...this._state.agentIdentityById, [agentId]: res };
      }
    } catch (err) {
      this._state.agentIdentityError = String(err);
    } finally {
      this._state.agentIdentityLoading = false;
      this.requestUpdate();
    }
  }

  private async _loadAgentIdentities(agentIds: string[]) {
    if (!this.client || !this.connected) {
      return;
    }

    const missing = agentIds.filter((id) => !this._state.agentIdentityById[id]);
    if (missing.length === 0) {
      return;
    }

    this._state.agentIdentityLoading = true;
    this._state.agentIdentityError = null;

    try {
      for (const agentId of missing) {
        const res = await this.client.request<AgentIdentityResult>("agent.identity.get", {
          agentId,
        });
        if (res) {
          this._state.agentIdentityById = { ...this._state.agentIdentityById, [agentId]: res };
        }
      }
    } catch (err) {
      this._state.agentIdentityError = String(err);
    } finally {
      this._state.agentIdentityLoading = false;
      this.requestUpdate();
    }
  }

  private async _loadChannelsStatus() {
    if (!this.client || !this.connected) {
      return;
    }

    try {
      const res = await this.client.request<{
        channelOrder?: string[];
        channelLabels?: Record<string, string>;
        channelMeta?: Array<{
          id: string;
          label: string;
          detailLabel: string;
          systemImage?: string;
        }>;
      }>("channels.status", { probe: false, timeoutMs: 8000 });

      if (res) {
        this._state.cronChannelMeta = res.channelMeta ?? [];
        if (!this._state.modelConfigChannelsConfig && res.channelOrder) {
          this._state.cronChannels = res.channelOrder;
          this._state.cronChannelLabels = res.channelLabels ?? {};
        }
      }
    } catch (err) {
      console.warn("加载 channels 状态失败:", err);
    }
  }

  private async _loadCron() {
    await loadCronJobs(this._state);
    this.requestUpdate();
  }

  // ============================================
  // 渲染
  // ============================================

  override render() {
    const { agentsLoading, agentsError, agentsList } = this._state;

    if (!this.connected) {
      return html`
        <div class="agents-layout agents-layout--disconnected">
          <div class="mc-status-card">
            <div class="mc-status-card__icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3 class="mc-status-card__title">等待连接</h3>
            <p class="mc-status-card__desc">正在连接到 Gateway，请稍候...</p>
            <div class="mc-status-card__spinner"></div>
          </div>
        </div>
      `;
    }

    if (agentsError && !agentsList) {
      return html`
        <div class="agents-layout agents-layout--error">
          <div class="mc-status-card mc-status-card--error">
            <div class="mc-status-card__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h3 class="mc-status-card__title">连接失败</h3>
            <p class="mc-status-card__desc">${agentsError}</p>
            <button class="mc-btn mc-btn--primary" @click=${() => this._loadInitialData()}>重试</button>
          </div>
        </div>
      `;
    }

    if (agentsLoading && !agentsList) {
      return html`
        <div class="agents-layout agents-layout--loading">
          <div class="mc-status-card">
            <div class="mc-status-card__icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
            </div>
            <h3 class="mc-status-card__title">加载中</h3>
            <p class="mc-status-card__desc">正在加载配置数据...</p>
            <div class="mc-status-card__spinner"></div>
          </div>
        </div>
      `;
    }

    return renderAgentsConfig(this._buildProps());
  }

  // ============================================
  // Props 构建（组合调用）
  // ============================================

  private _buildProps(): AgentsConfigProps {
    const s = this._state;
    const update = () => this.requestUpdate();
    const ctx = { s, update };

    const extra = {
      loadInitialData: () => this._loadInitialData(),
      loadAgentIdentity: (id: string) => this._loadAgentIdentity(id),
      loadSkillsStatus: () => _loadSkillsStatus(s),
      loadCron: () => this._loadCron(),
      loadPermissions: () => loadPermissions(s, { kind: "gateway" }),
      loadChannelsStatus: () => this._loadChannelsStatus(),
    };

    return {
      // 数据部分
      ...buildPropsData(s),
      showAgentWizard: s.showAgentWizard,
      // 回调部分
      ...createAgentCallbacks(ctx, extra),
      ...createConfigCallbacks(ctx),
      ...createFileCallbacks(ctx),
      ...createToolsCallbacks(ctx),
      ...createSkillsCallbacks(ctx),
      ...createCronCallbacks(ctx, extra),
      ...createChannelCallbacks(ctx, extra),
      ...createSessionCallbacks(ctx),
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "openclaw-config-zh": OpenClawConfigElement;
  }
}
