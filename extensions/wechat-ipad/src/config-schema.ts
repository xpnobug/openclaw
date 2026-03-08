import { normalizeAccountId } from "openclaw/plugin-sdk";
import { MarkdownConfigSchema } from "openclaw/plugin-sdk";
import { z } from "zod";

const pollingConfigSchema = z.object({
  intervalMs: z.number().int().positive().optional(),
  lookbackSeconds: z.number().int().nonnegative().optional(),
  maxPagesPerPoll: z.number().int().positive().optional(),
  pollAllContacts: z.boolean().optional(),
  pollContactIds: z.array(z.string()).optional(),
});

const inboundConfigSchema = z.object({
  mode: z.enum(["polling", "webhook"]).optional(),
  polling: pollingConfigSchema.optional(),
});

const accountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  markdown: MarkdownConfigSchema,
  baseUrl: z.string().optional(),
  apiToken: z.string().optional(),
  tokenFile: z.string().optional(),
  robotId: z.string().optional(),
  wxid: z.string().optional(),
  loginType: z.enum(["ipad", "win", "mac", "car"]).optional(),
  inbound: inboundConfigSchema.optional(),
  dmPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(),
  groupPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(),
  allowFrom: z.array(z.string()).optional(),
  commandAllowFrom: z.array(z.string()).optional(),
  requireMention: z.boolean().optional(),
  safetyPrefix: z.string().optional(),
});

export const WechatIpadConfigSchema = accountSchema
  .extend({
    accounts: z.object({}).catchall(accountSchema).optional(),
    defaultAccount: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const accounts = value.accounts ?? {};
    const defaultAccount = value.defaultAccount?.trim();
    if (defaultAccount && Object.keys(accounts).length > 0) {
      const normalizedDefaultAccount = normalizeAccountId(defaultAccount);
      if (!Object.prototype.hasOwnProperty.call(accounts, normalizedDefaultAccount)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["defaultAccount"],
          message: `channels.wechat-ipad.defaultAccount="${defaultAccount}" does not match a configured account key`,
        });
      }
    }
  });
