import { describe, expect, it, vi } from "vitest";
import { resolveDefaultWechatIpadAccountId, resolveWechatIpadAccount } from "./accounts.js";
import * as apiModule from "./api.js";
import { submitWechatIpadVerificationGatewayMethod, wechatIpadPlugin } from "./channel.js";
import { WechatIpadConfigSchema } from "./config-schema.js";
import * as runtimeModule from "./runtime.js";
import * as webhookModule from "./webhook.js";

describe("wechatIpadPlugin", () => {
  it("exposes required adapters", () => {
    expect(wechatIpadPlugin.meta.id).toBe("wechat-ipad");
    expect(wechatIpadPlugin.capabilities.chatTypes).toContain("direct");
    expect(wechatIpadPlugin.config).toBeTruthy();
    expect(wechatIpadPlugin.setup).toBeTruthy();
    expect(wechatIpadPlugin.security).toBeTruthy();
    expect(wechatIpadPlugin.pairing).toBeTruthy();
    expect(wechatIpadPlugin.outbound).toBeTruthy();
    expect(wechatIpadPlugin.outbound?.chunker).toBeNull();
    expect(wechatIpadPlugin.status).toBeTruthy();
    expect(wechatIpadPlugin.gateway).toBeTruthy();
    expect(typeof submitWechatIpadVerificationGatewayMethod).toBe("function");
    expect(wechatIpadPlugin.messaging).toBeTruthy();
  });

  it("uses first reply threading mode", () => {
    expect(
      wechatIpadPlugin.threading?.resolveReplyToMode?.({
        cfg: {} as never,
        accountId: "default",
        chatType: "direct",
      }),
    ).toBe("first");
  });
});

describe("wechat-ipad accounts", () => {
  it("only resolves values from accounts.<id>", () => {
    const cfg = {
      channels: {
        "wechat-ipad": {
          enabled: true,
          accounts: {
            secondary: {
              name: "次要账号",
              baseUrl: "http://bridge-secondary",
              apiToken: "secondary-token",
              robotId: "secondary-robot",
              wxid: "wxid_secondary",
              allowFrom: ["wxid_secondary_allow"],
              longTextThreshold: 2400,
              inbound: {
                mode: "polling",
                polling: {
                  intervalMs: 5000,
                  pollAllContacts: true,
                  pollContactIds: ["wxid_a"],
                },
              },
            },
          },
        },
      },
    };

    const account = resolveWechatIpadAccount({ cfg, accountId: "secondary" });

    expect(account.name).toBe("次要账号");
    expect(account.baseUrl).toBe("http://bridge-secondary");
    expect(account.robotId).toBe("secondary-robot");
    expect(account.apiToken).toBe("secondary-token");
    expect(account.config.wxid).toBe("wxid_secondary");
    expect(account.config.allowFrom).toEqual(["wxid_secondary_allow"]);
    expect(account.config.longTextThreshold).toBe(2400);
    expect(account.inbound.polling.intervalMs).toBe(5000);
    expect(account.inbound.polling.pollAllContacts).toBe(true);
    expect(account.inbound.polling.pollContactIds).toEqual(["wxid_a"]);
  });

  it("uses account-level webhook config without top-level fallback", () => {
    const cfg = {
      channels: {
        "wechat-ipad": {
          accounts: {
            secondary: {
              apiToken: "secondary-token",
              inbound: {
                mode: "webhook",
                webhook: {
                  path: "/plugins/wechat-ipad/secondary",
                  secret: "secondary-secret",
                  authMode: "query",
                  rateLimitPerMinute: 99,
                },
              },
            },
          },
        },
      },
    };

    const account = resolveWechatIpadAccount({ cfg, accountId: "secondary" });

    expect(account.inbound.mode).toBe("webhook");
    expect(account.inbound.webhook).toEqual({
      path: "/plugins/wechat-ipad/secondary",
      secret: "secondary-secret",
      authMode: "query",
      maxBodyBytes: 1024 * 1024,
      dedupeWindowMs: 5 * 60_000,
      rateLimitPerMinute: 99,
    });
  });

  it("rejects legacy top-level account fields in schema", () => {
    const parsed = WechatIpadConfigSchema.safeParse({
      enabled: true,
      baseUrl: "http://legacy-bridge",
      accounts: {
        main: {
          apiToken: "token-main",
        },
      },
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("expected schema validation to fail");
    }
    expect(parsed.error.issues[0]?.message).toContain(
      "channels.wechat-ipad.baseUrl has moved to channels.wechat-ipad.accounts.<accountId>.baseUrl",
    );
  });

  it("selects defaultAccount only when it points to a real account", () => {
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

  it("writes setup config only to account-level paths", () => {
    const next = wechatIpadPlugin.setup?.applyAccountConfig({
      cfg: {
        channels: {
          "wechat-ipad": {
            enabled: true,
          },
        },
      } as never,
      accountId: "main",
      input: {
        name: "主账号",
        token: "main-token",
        baseUrl: "http://bridge-main",
        robotId: "main-robot",
      } as never,
    });

    expect(next?.channels?.["wechat-ipad"]).toEqual({
      enabled: true,
      accounts: {
        main: {
          name: "主账号",
          enabled: true,
          apiToken: "main-token",
          baseUrl: "http://bridge-main",
          robotId: "main-robot",
        },
      },
    });
  });

  it("uses account-level dmPolicy paths in security hints", () => {
    const resolved = wechatIpadPlugin.security?.resolveDmPolicy?.({
      cfg: {} as never,
      accountId: "main",
      account: {
        accountId: "main",
        config: {
          dmPolicy: "allowlist",
          allowFrom: ["wxid_admin"],
        },
      } as never,
    });

    expect(resolved).toMatchObject({
      policy: "allowlist",
      allowFrom: ["wxid_admin"],
      policyPath: "channels.wechat-ipad.accounts.main.dmPolicy",
      allowFromPath: "channels.wechat-ipad.accounts.main.allowFrom",
    });
  });
});

describe("wechat-ipad gateway webhook mode", () => {
  it("starts webhook mode without secret when authMode is none", async () => {
    const startAccount = wechatIpadPlugin.gateway?.startAccount;
    expect(startAccount).toBeTruthy();

    const enableHeartbeatSpy = vi.spyOn(apiModule, "enableAutoHeartbeat").mockResolvedValue();
    const registerSpy = vi
      .spyOn(webhookModule, "registerWechatIpadWebhookTarget")
      .mockReturnValue(vi.fn());
    const runtimeSpy = vi.spyOn(runtimeModule, "getWechatIpadRuntime").mockReturnValue({} as never);
    const wxidSpy = vi
      .spyOn(runtimeModule, "resolveWechatIpadRuntimeWxid")
      .mockReturnValue("wxid_bot");
    const setRegistrationSpy = vi.spyOn(runtimeModule, "setWechatIpadWebhookRegistration");
    const clearRegistrationSpy = vi.spyOn(runtimeModule, "clearWechatIpadWebhookRegistration");
    const clearPollerSpy = vi.spyOn(runtimeModule, "clearWechatIpadPoller");

    const controller = new AbortController();
    const statuses: Array<Record<string, unknown>> = [];
    const baseStatus = { running: false, lastError: "old-error" };
    const ctx = {
      cfg: { channels: {} },
      accountId: "default",
      account: {
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        inbound: {
          mode: "webhook",
          polling: {
            intervalMs: 3000,
            lookbackSeconds: 120,
            maxPagesPerPoll: 10,
            pollAllContacts: false,
            pollContactIds: [],
          },
          webhook: {
            path: "/plugins/wechat-ipad/webhook/default",
            secret: "",
            authMode: "none",
            maxBodyBytes: 1024 * 1024,
            dedupeWindowMs: 5 * 60_000,
            rateLimitPerMinute: 120,
          },
        },
        config: {
          wxid: "wxid_bot",
        },
      },
      abortSignal: controller.signal,
      setStatus: (status: Record<string, unknown>) => {
        statuses.push(status);
      },
      getStatus: () => (statuses.at(-1) ?? baseStatus) as never,
      log: {
        info: vi.fn(),
      },
    } as never;

    const pending = startAccount?.(ctx);
    controller.abort();
    await pending;

    expect(enableHeartbeatSpy).toHaveBeenCalled();
    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "default",
        path: "/plugins/wechat-ipad/webhook/default",
        secret: "",
        authMode: "none",
        wxid: "wxid_bot",
      }),
    );
    expect(setRegistrationSpy).toHaveBeenCalled();
    expect(clearRegistrationSpy).toHaveBeenCalled();
    expect(clearPollerSpy).toHaveBeenCalledWith("default");
    expect(statuses.at(0)).toMatchObject({
      running: true,
      lastError: null,
    });

    enableHeartbeatSpy.mockRestore();
    registerSpy.mockRestore();
    runtimeSpy.mockRestore();
    wxidSpy.mockRestore();
    setRegistrationSpy.mockRestore();
    clearRegistrationSpy.mockRestore();
    clearPollerSpy.mockRestore();
  });

  it("starts webhook mode without reserved-mode error and unregisters on abort", async () => {
    const startAccount = wechatIpadPlugin.gateway?.startAccount;
    expect(startAccount).toBeTruthy();

    const enableHeartbeatSpy = vi.spyOn(apiModule, "enableAutoHeartbeat").mockResolvedValue();
    const registerSpy = vi
      .spyOn(webhookModule, "registerWechatIpadWebhookTarget")
      .mockReturnValue(vi.fn());
    const runtimeSpy = vi.spyOn(runtimeModule, "getWechatIpadRuntime").mockReturnValue({} as never);
    const wxidSpy = vi
      .spyOn(runtimeModule, "resolveWechatIpadRuntimeWxid")
      .mockReturnValue("wxid_bot");
    const setRegistrationSpy = vi.spyOn(runtimeModule, "setWechatIpadWebhookRegistration");
    const clearRegistrationSpy = vi.spyOn(runtimeModule, "clearWechatIpadWebhookRegistration");
    const clearPollerSpy = vi.spyOn(runtimeModule, "clearWechatIpadPoller");

    const controller = new AbortController();
    const statuses: Array<Record<string, unknown>> = [];
    const baseStatus = { running: false, lastError: "old-error" };
    const ctx = {
      cfg: { channels: {} },
      accountId: "default",
      account: {
        accountId: "default",
        baseUrl: "http://localhost:9000",
        apiToken: "token",
        robotId: "default",
        inbound: {
          mode: "webhook",
          polling: {
            intervalMs: 3000,
            lookbackSeconds: 120,
            maxPagesPerPoll: 10,
            pollAllContacts: false,
            pollContactIds: [],
          },
          webhook: {
            path: "/plugins/wechat-ipad/webhook/default",
            secret: "secret-token",
            authMode: "header",
            maxBodyBytes: 1024 * 1024,
            dedupeWindowMs: 5 * 60_000,
            rateLimitPerMinute: 120,
          },
        },
        config: {
          wxid: "wxid_bot",
        },
      },
      abortSignal: controller.signal,
      setStatus: (status: Record<string, unknown>) => {
        statuses.push(status);
      },
      getStatus: () => (statuses.at(-1) ?? baseStatus) as never,
      log: {
        info: vi.fn(),
      },
    } as never;

    const pending = startAccount?.(ctx);
    controller.abort();
    await pending;

    expect(enableHeartbeatSpy).toHaveBeenCalled();
    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "default",
        path: "/plugins/wechat-ipad/webhook/default",
        secret: "secret-token",
        wxid: "wxid_bot",
      }),
    );
    expect(setRegistrationSpy).toHaveBeenCalled();
    expect(clearRegistrationSpy).toHaveBeenCalled();
    expect(clearPollerSpy).toHaveBeenCalledWith("default");
    expect(statuses.at(0)).toMatchObject({
      running: true,
      lastError: null,
    });

    enableHeartbeatSpy.mockRestore();
    registerSpy.mockRestore();
    runtimeSpy.mockRestore();
    wxidSpy.mockRestore();
    setRegistrationSpy.mockRestore();
    clearRegistrationSpy.mockRestore();
    clearPollerSpy.mockRestore();
  });
});
