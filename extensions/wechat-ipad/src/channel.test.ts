import { describe, expect, it } from "vitest";
import { resolveDefaultWechatIpadAccountId, resolveWechatIpadAccount } from "./accounts.js";
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

describe("wechat-ipad accounts", () => {
  it("keeps only shared top-level defaults for non-default accounts", () => {
    const cfg = {
      channels: {
        "wechat-ipad": {
          baseUrl: "http://bridge",
          robotId: "shared-robot",
          dmPolicy: "allowlist",
          allowFrom: ["wxid_shared"],
          apiToken: "top-level-token",
          wxid: "wxid_default_only",
          name: "默认号",
          inbound: {
            mode: "polling",
            polling: {
              intervalMs: 5000,
              pollAllContacts: true,
            },
          },
          accounts: {
            secondary: {
              apiToken: "secondary-token",
              wxid: "wxid_secondary",
              allowFrom: ["wxid_secondary_allow"],
              inbound: {
                polling: {
                  pollContactIds: ["wxid_a"],
                },
              },
            },
          },
        },
      },
    };

    const account = resolveWechatIpadAccount({ cfg, accountId: "secondary" });

    expect(account.baseUrl).toBe("http://bridge");
    expect(account.robotId).toBe("shared-robot");
    expect(account.apiToken).toBe("secondary-token");
    expect(account.config.wxid).toBe("wxid_secondary");
    expect(account.config.name).toBeUndefined();
    expect(account.config.allowFrom).toEqual(["wxid_secondary_allow"]);
    expect(account.inbound.polling.intervalMs).toBe(5000);
    expect(account.inbound.polling.pollAllContacts).toBe(true);
    expect(account.inbound.polling.pollContactIds).toEqual(["wxid_a"]);
  });

  it("keeps top-level secrets and identity for default account", () => {
    const cfg = {
      channels: {
        "wechat-ipad": {
          baseUrl: "http://bridge",
          apiToken: "default-token",
          wxid: "wxid_default",
          name: "默认号",
        },
      },
    };

    const account = resolveWechatIpadAccount({ cfg, accountId: "default" });

    expect(account.apiToken).toBe("default-token");
    expect(account.config.wxid).toBe("wxid_default");
    expect(account.name).toBe("默认号");
  });

  it("falls back when defaultAccount is missing from configured accounts", () => {
    const cfg = {
      channels: {
        "wechat-ipad": {
          defaultAccount: "ghost",
          accounts: {
            beta: {
              apiToken: "beta-token",
            },
            alpha: {
              apiToken: "alpha-token",
            },
          },
        },
      },
    };

    expect(resolveDefaultWechatIpadAccountId(cfg)).toBe("alpha");
  });
});
