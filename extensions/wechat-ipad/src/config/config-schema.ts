import { normalizeAccountId } from "openclaw/plugin-sdk/wechat-ipad";
import { MarkdownConfigSchema } from "openclaw/plugin-sdk/wechat-ipad";
import { z } from "zod";

const pollingConfigSchema = z.object({
  intervalMs: z.number().int().positive().optional(),
  lookbackSeconds: z.number().int().nonnegative().optional(),
  maxPagesPerPoll: z.number().int().positive().optional(),
  pollAllContacts: z.boolean().optional(),
  pollContactIds: z.array(z.string()).optional(),
});

const webhookConfigSchema = z.object({
  path: z.string().optional(),
  secret: z.string().optional(),
  authMode: z.enum(["header", "query", "none"]).optional(),
  maxBodyBytes: z.number().int().positive().optional(),
  dedupeWindowMs: z.number().int().positive().optional(),
  rateLimitPerMinute: z.number().int().positive().optional(),
});

const inboundConfigSchema = z.object({
  mode: z.enum(["polling", "webhook"]).optional(),
  polling: pollingConfigSchema.optional(),
  webhook: webhookConfigSchema.optional(),
});

const accountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  markdown: MarkdownConfigSchema,
  longTextThreshold: z.number().int().positive().optional(),
  longTextTitle: z.string().optional(),
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

const forbiddenTopLevelAccountFields = [
  "name",
  "markdown",
  "longTextThreshold",
  "longTextTitle",
  "baseUrl",
  "apiToken",
  "tokenFile",
  "robotId",
  "wxid",
  "loginType",
  "inbound",
  "dmPolicy",
  "groupPolicy",
  "allowFrom",
  "commandAllowFrom",
  "requireMention",
  "safetyPrefix",
] as const;

export const WechatIpadConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultAccount: z.string().optional(),
    accounts: z.object({}).catchall(accountSchema).optional(),
  })
  .superRefine((value, ctx) => {
    const accounts = value.accounts ?? {};
    const defaultAccount = value.defaultAccount?.trim();
    if (defaultAccount) {
      const normalizedDefaultAccount = normalizeAccountId(defaultAccount);
      if (!Object.prototype.hasOwnProperty.call(accounts, normalizedDefaultAccount)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["defaultAccount"],
          message: `channels.wechat-ipad.defaultAccount="${defaultAccount}" 未匹配到已配置的账号`,
        });
      }
    }
  })
  .catchall(z.unknown())
  .superRefine((value, ctx) => {
    for (const field of forbiddenTopLevelAccountFields) {
      if (Object.prototype.hasOwnProperty.call(value, field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `channels.wechat-ipad.${field} 已迁移至 channels.wechat-ipad.accounts.<accountId>.${field}，请使用账号配置模式`,
        });
      }
    }
  });
