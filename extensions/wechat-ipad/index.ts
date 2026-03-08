import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import {
  submitWechatIpadVerificationGatewayMethod,
  wechatIpadDock,
  wechatIpadPlugin,
} from "./src/channel.js";
import { setWechatIpadRuntime } from "./src/runtime.js";

const plugin = {
  id: "wechat-ipad",
  name: "WeChat iPad",
  description: "WeChat iPad channel plugin (HTTP bridge)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setWechatIpadRuntime(api.runtime);
    api.registerChannel({ plugin: wechatIpadPlugin, dock: wechatIpadDock });

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

    api.registerGatewayMethod(
      "wechat-ipad.login.submitVerificationCode",
      submitVerificationHandler,
    );
  },
};

export default plugin;
