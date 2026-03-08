import { describe, expect, it } from "vitest";
import { submitWechatIpadVerificationGatewayMethod, wechatIpadPlugin } from "./channel.js";

describe("wechatIpadPlugin", () => {
  it("exposes required adapters", () => {
    expect(wechatIpadPlugin.meta.id).toBe("wechat-ipad");
    expect(wechatIpadPlugin.capabilities.chatTypes).toContain("direct");
    expect(wechatIpadPlugin.config).toBeTruthy();
    expect(wechatIpadPlugin.setup).toBeTruthy();
    expect(wechatIpadPlugin.security).toBeTruthy();
    expect(wechatIpadPlugin.pairing).toBeTruthy();
    expect(wechatIpadPlugin.outbound).toBeTruthy();
    expect(wechatIpadPlugin.status).toBeTruthy();
    expect(wechatIpadPlugin.gateway).toBeTruthy();
    expect(typeof submitWechatIpadVerificationGatewayMethod).toBe("function");
    expect(wechatIpadPlugin.messaging).toBeTruthy();
  });
});
