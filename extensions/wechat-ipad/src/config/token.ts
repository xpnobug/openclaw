import * as fs from "node:fs";
import * as path from "node:path";
import type { WechatIpadConfig, WechatIpadTokenSource } from "../types.js";

export function resolveWechatIpadToken(
  cfg: WechatIpadConfig | undefined,
  accountId: string,
): { token: string; source: WechatIpadTokenSource } {
  const candidateConfig = cfg?.accounts?.[accountId];

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
