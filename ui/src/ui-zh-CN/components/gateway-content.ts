/**
 * Gateway 设置配置内容组件
 * 右侧面板 - 网关模式、网络、Control UI、认证与 Tailscale
 */
import { html } from "lit";
import type { GatewayConfig } from "../views/model-config.js";

const icons = {
  gateway: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path
        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
      ></path>
    </svg>
  `,
};

const LABELS = {
  gatewayTitle: "Gateway 设置",
  gatewayDesc: "配置 Gateway 运行模式、监听方式、Control UI 安全策略与认证参数",
  basicTitle: "基础设置",
  basicDesc: "这些配置决定 Gateway 是否本地运行、监听端口以及绑定范围。",
  gatewayMode: "Gateway 模式",
  gatewayModeLocal: "本地运行 (local)",
  gatewayModeRemote: "远程连接 (remote)",
  port: "端口",
  bindMode: "绑定模式",
  bindLoopback: "仅本机 (loopback)",
  bindLan: "局域网 (lan)",
  bindAuto: "自动 (auto)",
  bindTailnet: "Tailscale 网络 (tailnet)",
  bindCustom: "自定义地址 (custom)",
  customBindHost: "自定义绑定地址",
  customBindHint: "仅在绑定模式为 custom 时使用，例如 0.0.0.0 或 192.168.1.10",
  authTitle: "认证设置",
  authDesc: "控制 Gateway 的访问认证方式；非本机暴露时建议保留认证。",
  authMode: "认证模式",
  authModeToken: "Token 认证",
  authModePassword: "密码认证",
  authModeNone: "无认证",
  authModeTrustedProxy: "可信反向代理",
  authSecretToken: "认证令牌",
  authSecretPassword: "认证密码",
  authTokenHint: "Token 模式下，Control UI 和客户端将使用该令牌连接 Gateway。",
  authPasswordHint: "Password 模式下，客户端将使用该密码连接 Gateway。",
  controlUiTitle: "Control UI 设置",
  controlUiDesc: "配置浏览器访问 Control UI 时的来源校验与安全策略。",
  controlUiEnabled: "启用 Control UI",
  controlUiEnabledHint: "关闭后 Gateway 将不再提供内置的 Web 管理页面。",
  controlUiBasePath: "Control UI 基础路径",
  controlUiBasePathHint: "可选。用于子路径部署，例如 /openclaw。留空表示挂载在根路径。",
  allowedOrigins: "允许的来源",
  allowedOriginsHint: "每行一个来源，例如 http://localhost:19000。支持 *，但仅建议本地调试使用。",
  allowHostHeaderFallback: "允许 Host 头来源回退（危险）",
  allowHostHeaderFallbackHint:
    "仅在明确依赖 Host 头做来源校验的部署场景中启用，优先使用 allowedOrigins。",
  allowInsecureAuth: "允许不安全认证",
  allowInsecureAuthHint: "允许在不安全上下文中尝试认证，但不会自动关闭设备身份校验。",
  disableDeviceAuth: "禁用设备身份校验（危险）",
  disableDeviceAuthHint: "仅用于受控环境调试。启用后 Control UI 将不再校验设备身份。",
  tailscaleTitle: "Tailscale 设置",
  tailscaleDesc: "配置 Gateway 是否通过 Tailscale Serve/Funnel 暴露。",
  tailscaleMode: "Tailscale 模式",
  tailscaleOff: "关闭 (off)",
  tailscaleServe: "Tailnet 内部访问 (serve)",
  tailscaleFunnel: "公网暴露 (funnel)",
  resetOnExit: "退出时重置 Tailscale 配置",
  resetOnExitHint: "启用后 Gateway 停止时会清理已设置的 Serve/Funnel 路由。",
};

export type GatewayContentProps = {
  gatewayConfig: GatewayConfig;
  onGatewayUpdate: (path: string[], value: unknown) => void;
};

function updateNumber(props: GatewayContentProps, path: string[], rawValue: string): void {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    props.onGatewayUpdate(path, undefined);
    return;
  }
  const numeric = Number(trimmed);
  props.onGatewayUpdate(path, Number.isFinite(numeric) ? numeric : undefined);
}

function updateString(
  props: GatewayContentProps,
  path: string[],
  rawValue: string,
  trim = true,
): void {
  const next = trim ? rawValue.trim() : rawValue;
  props.onGatewayUpdate(path, next ? next : undefined);
}

function parseOrigins(rawValue: string): string[] | undefined {
  const origins = rawValue
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : undefined;
}

function renderToggleField(params: {
  label: string;
  checked: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  return html`
    <label class="mc-toggle-field">
      <span class="mc-toggle-field__label">${params.label}</span>
      <div class="mc-toggle">
        <input
          type="checkbox"
          .checked=${params.checked}
          @change=${(e: Event) => params.onChange((e.target as HTMLInputElement).checked)}
        />
        <span class="mc-toggle__track"></span>
      </div>
      ${params.hint ? html`<span class="mc-field__desc">${params.hint}</span>` : nothing}
    </label>
  `;
}

function renderSectionCard(params: { title: string; desc: string; content: unknown }) {
  return html`
    <div class="mc-card">
      <div class="mc-card__header">
        <div>
          <h3 class="mc-card__title">${params.title}</h3>
          <p class="mc-card__desc">${params.desc}</p>
        </div>
      </div>
      <div class="mc-card__content">${params.content}</div>
    </div>
  `;
}

export function renderGatewayContent(props: GatewayContentProps) {
  const gateway = props.gatewayConfig;
  const authMode = gateway.auth?.mode ?? "token";
  const authSecretLabel =
    authMode === "password" ? LABELS.authSecretPassword : LABELS.authSecretToken;
  const authSecretValue =
    authMode === "password" ? (gateway.auth?.password ?? "") : (gateway.auth?.token ?? "");
  const authSecretHint = authMode === "password" ? LABELS.authPasswordHint : LABELS.authTokenHint;
  const allowedOrigins = Array.isArray(gateway.controlUi?.allowedOrigins)
    ? gateway.controlUi?.allowedOrigins.join("\n")
    : "";

  return html`
    <div class="config-content">
      <div class="config-content__header">
        <div class="config-content__icon">${icons.gateway}</div>
        <div class="config-content__titles">
          <h2 class="config-content__title">${LABELS.gatewayTitle}</h2>
          <p class="config-content__desc">${LABELS.gatewayDesc}</p>
        </div>
      </div>

      <div class="config-content__body" style="display: grid; gap: 16px;">
        ${renderSectionCard({
          title: LABELS.basicTitle,
          desc: LABELS.basicDesc,
          content: html`
            <div class="mc-form-row mc-form-row--2col">
              <label class="mc-field">
                <span class="mc-field__label">${LABELS.gatewayMode}</span>
                <select
                  class="mc-select"
                  @change=${(e: Event) =>
                    props.onGatewayUpdate(
                      ["mode"],
                      (e.target as HTMLSelectElement).value || undefined,
                    )}
                >
                  <option value="local" ?selected=${(gateway.mode ?? "local") === "local"}>${LABELS.gatewayModeLocal}</option>
                  <option value="remote" ?selected=${gateway.mode === "remote"}>${LABELS.gatewayModeRemote}</option>
                </select>
              </label>
              <label class="mc-field">
                <span class="mc-field__label">${LABELS.port}</span>
                <input
                  type="number"
                  class="mc-input"
                  .value=${String(gateway.port ?? 18789)}
                  min="1"
                  max="65535"
                  @input=${(e: Event) => updateNumber(props, ["port"], (e.target as HTMLInputElement).value)}
                />
              </label>
            </div>

            <div class="mc-form-row mc-form-row--2col">
              <label class="mc-field">
                <span class="mc-field__label">${LABELS.bindMode}</span>
                <select
                  class="mc-select"
                  @change=${(e: Event) =>
                    props.onGatewayUpdate(
                      ["bind"],
                      (e.target as HTMLSelectElement).value || undefined,
                    )}
                >
                  <option value="loopback" ?selected=${(gateway.bind ?? "loopback") === "loopback"}>${LABELS.bindLoopback}</option>
                  <option value="lan" ?selected=${gateway.bind === "lan"}>${LABELS.bindLan}</option>
                  <option value="auto" ?selected=${gateway.bind === "auto"}>${LABELS.bindAuto}</option>
                  <option value="tailnet" ?selected=${gateway.bind === "tailnet"}>${LABELS.bindTailnet}</option>
                  <option value="custom" ?selected=${gateway.bind === "custom"}>${LABELS.bindCustom}</option>
                </select>
              </label>
              ${
                gateway.bind === "custom"
                  ? html`
                    <label class="mc-field">
                      <span class="mc-field__label">${LABELS.customBindHost}</span>
                      <input
                        type="text"
                        class="mc-input"
                        .value=${gateway.customBindHost ?? ""}
                        placeholder="0.0.0.0"
                        @input=${(e: Event) =>
                          updateString(
                            props,
                            ["customBindHost"],
                            (e.target as HTMLInputElement).value,
                          )}
                      />
                      <span class="mc-field__desc">${LABELS.customBindHint}</span>
                    </label>
                  `
                  : html`
                      <div></div>
                    `
              }
            </div>
          `,
        })}

        ${renderSectionCard({
          title: LABELS.authTitle,
          desc: LABELS.authDesc,
          content: html`
            <div class="mc-form-row mc-form-row--2col">
              <label class="mc-field">
                <span class="mc-field__label">${LABELS.authMode}</span>
                <select
                  class="mc-select"
                  @change=${(e: Event) => {
                    const value = (e.target as HTMLSelectElement).value || undefined;
                    props.onGatewayUpdate(["auth", "mode"], value);
                  }}
                >
                  <option value="token" ?selected=${authMode === "token"}>${LABELS.authModeToken}</option>
                  <option value="password" ?selected=${authMode === "password"}>${LABELS.authModePassword}</option>
                  <option value="none" ?selected=${authMode === "none"}>${LABELS.authModeNone}</option>
                  <option value="trusted-proxy" ?selected=${authMode === "trusted-proxy"}>${LABELS.authModeTrustedProxy}</option>
                </select>
              </label>
              ${
                authMode === "none" || authMode === "trusted-proxy"
                  ? html`
                      <div class="mc-field">
                        <span class="mc-field__label">认证凭据</span
                        ><span class="mc-field__desc">当前认证模式无需在此填写共享密钥。</span>
                      </div>
                    `
                  : html`
                    <label class="mc-field">
                      <span class="mc-field__label">${authSecretLabel}</span>
                      <input
                        type="password"
                        class="mc-input"
                        .value=${authSecretValue}
                        placeholder="••••••••"
                        @input=${(e: Event) =>
                          updateString(
                            props,
                            ["auth", authMode === "password" ? "password" : "token"],
                            (e.target as HTMLInputElement).value,
                            false,
                          )}
                      />
                      <span class="mc-field__desc">${authSecretHint}</span>
                    </label>
                  `
              }
            </div>
          `,
        })}

        ${renderSectionCard({
          title: LABELS.controlUiTitle,
          desc: LABELS.controlUiDesc,
          content: html`
            <div class="mc-form-row mc-form-row--2col">
              ${renderToggleField({
                label: LABELS.controlUiEnabled,
                checked: gateway.controlUi?.enabled !== false,
                hint: LABELS.controlUiEnabledHint,
                onChange: (checked) => props.onGatewayUpdate(["controlUi", "enabled"], checked),
              })}
              <label class="mc-field">
                <span class="mc-field__label">${LABELS.controlUiBasePath}</span>
                <input
                  type="text"
                  class="mc-input"
                  .value=${gateway.controlUi?.basePath ?? ""}
                  placeholder="/openclaw"
                  @input=${(e: Event) =>
                    updateString(
                      props,
                      ["controlUi", "basePath"],
                      (e.target as HTMLInputElement).value,
                    )}
                />
                <span class="mc-field__desc">${LABELS.controlUiBasePathHint}</span>
              </label>
            </div>

            <label class="mc-field">
              <span class="mc-field__label">${LABELS.allowedOrigins}</span>
              <textarea
                class="mc-textarea"
                rows="5"
                .value=${allowedOrigins}
                placeholder="http://localhost:19000\nhttp://127.0.0.1:19000\n*"
                @input=${(e: Event) =>
                  props.onGatewayUpdate(
                    ["controlUi", "allowedOrigins"],
                    parseOrigins((e.target as HTMLTextAreaElement).value),
                  )}
              ></textarea>
              <span class="mc-field__desc">${LABELS.allowedOriginsHint}</span>
            </label>

            <div style="display: grid; gap: 12px; margin-top: 16px;">
              ${renderToggleField({
                label: LABELS.allowHostHeaderFallback,
                checked: gateway.controlUi?.dangerouslyAllowHostHeaderOriginFallback === true,
                hint: LABELS.allowHostHeaderFallbackHint,
                onChange: (checked) =>
                  props.onGatewayUpdate(
                    ["controlUi", "dangerouslyAllowHostHeaderOriginFallback"],
                    checked,
                  ),
              })}
              ${renderToggleField({
                label: LABELS.allowInsecureAuth,
                checked: gateway.controlUi?.allowInsecureAuth === true,
                hint: LABELS.allowInsecureAuthHint,
                onChange: (checked) =>
                  props.onGatewayUpdate(["controlUi", "allowInsecureAuth"], checked),
              })}
              ${renderToggleField({
                label: LABELS.disableDeviceAuth,
                checked: gateway.controlUi?.dangerouslyDisableDeviceAuth === true,
                hint: LABELS.disableDeviceAuthHint,
                onChange: (checked) =>
                  props.onGatewayUpdate(["controlUi", "dangerouslyDisableDeviceAuth"], checked),
              })}
            </div>
          `,
        })}

        ${renderSectionCard({
          title: LABELS.tailscaleTitle,
          desc: LABELS.tailscaleDesc,
          content: html`
            <div class="mc-form-row mc-form-row--2col">
              <label class="mc-field">
                <span class="mc-field__label">${LABELS.tailscaleMode}</span>
                <select
                  class="mc-select"
                  @change=${(e: Event) =>
                    props.onGatewayUpdate(
                      ["tailscale", "mode"],
                      (e.target as HTMLSelectElement).value || undefined,
                    )}
                >
                  <option value="off" ?selected=${(gateway.tailscale?.mode ?? "off") === "off"}>${LABELS.tailscaleOff}</option>
                  <option value="serve" ?selected=${gateway.tailscale?.mode === "serve"}>${LABELS.tailscaleServe}</option>
                  <option value="funnel" ?selected=${gateway.tailscale?.mode === "funnel"}>${LABELS.tailscaleFunnel}</option>
                </select>
              </label>
              <div></div>
            </div>

            ${renderToggleField({
              label: LABELS.resetOnExit,
              checked: gateway.tailscale?.resetOnExit === true,
              hint: LABELS.resetOnExitHint,
              onChange: (checked) => props.onGatewayUpdate(["tailscale", "resetOnExit"], checked),
            })}
          `,
        })}
      </div>
    </div>
  `;
}
