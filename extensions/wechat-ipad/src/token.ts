import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { WechatIpadConfig, WechatIpadTokenSource } from "./types.js";

const TOKEN_ENV = "WECHAT_IPAD_API_TOKEN";

export function resolveWechatIpadToken(
  cfg: WechatIpadConfig | undefined,
  accountId: string,
): { token: string; source: WechatIpadTokenSource } {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    const envToken = process.env[TOKEN_ENV]?.trim();
    if (envToken) {
      return { token: envToken, source: "env" };
    }
  }

  const accountConfig = cfg?.accounts?.[accountId];
  const candidateConfig = accountConfig ?? cfg;

  const fromConfig = candidateConfig?.apiToken?.trim();
  if (fromConfig) {
    return { token: fromConfig, source: "config" };
  }

  const tokenFile = candidateConfig?.tokenFile?.trim();
  if (tokenFile) {
    try {
      const absolutePath = path.resolve(tokenFile);
      const fileToken = fs.readFileSync(absolutePath, "utf8").trim();
      if (fileToken) {
        return { token: fileToken, source: "configFile" };
      }
    } catch {
      // 忽略文件读取错误，返回 none
    }
  }

  return { token: "", source: "none" };
}
