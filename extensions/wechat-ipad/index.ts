import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk/wechat-ipad";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/wechat-ipad";
import {
  startWechatIpadLoginGatewayMethod,
  submitWechatIpadVerificationGatewayMethod,
  waitWechatIpadLoginGatewayMethod,
  wechatIpadDock,
  wechatIpadPlugin,
} from "./src/channel.js";
import { setWechatIpadRuntime, setWechatIpadPluginRegistry } from "./src/infra/runtime.js";

const REGISTRY_STATE_KEY = Symbol.for("openclaw.pluginRegistryState");

const plugin = {
  id: "wechat-ipad",
  name: "WeChat iPad",
  description: "WeChat iPad channel plugin (HTTP bridge)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setWechatIpadRuntime(api.runtime);

    // 捕获当前 active plugin registry（此时与网关使用的是同一个实例）
    const globalState = (globalThis as Record<symbol, { registry?: unknown }>)[REGISTRY_STATE_KEY];
    if (globalState?.registry) {
      setWechatIpadPluginRegistry(globalState.registry);
    }

    api.registerChannel({ plugin: wechatIpadPlugin, dock: wechatIpadDock });

    const loginStartHandler: GatewayRequestHandler = async ({
      params,
      respond,
    }: GatewayRequestHandlerOptions) => {
      try {
        const result = await startWechatIpadLoginGatewayMethod({
          accountId: typeof params.accountId === "string" ? params.accountId : undefined,
          force: params.force === true,
          timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
          verbose: params.verbose === true,
          loginType: typeof params.loginType === "string" ? params.loginType : undefined,
        });
        respond(true, result);
      } catch (error) {
        respond(false, undefined, {
          code: "UNAVAILABLE",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const loginWaitHandler: GatewayRequestHandler = async ({
      params,
      respond,
    }: GatewayRequestHandlerOptions) => {
      try {
        const result = await waitWechatIpadLoginGatewayMethod({
          accountId: typeof params.accountId === "string" ? params.accountId : undefined,
          timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
        });
        respond(true, result);
      } catch (error) {
        respond(false, undefined, {
          code: "UNAVAILABLE",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const submitVerificationHandler: GatewayRequestHandler = async ({
      params,
      respond,
    }: GatewayRequestHandlerOptions) => {
      const accountId = typeof params.accountId === "string" ? params.accountId : undefined;
      const code = typeof params.code === "string" ? params.code : "";
      const ticket = typeof params.ticket === "string" ? params.ticket : undefined;

      try {
        const result = await submitWechatIpadVerificationGatewayMethod({
          accountId,
          params: {
            code,
            ...(ticket ? { ticket } : {}),
          },
        });
        respond(true, result);
      } catch (error) {
        respond(false, undefined, {
          code: "UNAVAILABLE",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    api.registerGatewayMethod("wechat-ipad.login.start", loginStartHandler);
    api.registerGatewayMethod("wechat-ipad.login.wait", loginWaitHandler);
    api.registerGatewayMethod(
      "wechat-ipad.login.submitVerificationCode",
      submitVerificationHandler,
    );
  },
};

export default plugin;
