import { probeBackend, WechatIpadApiError } from "../api/api.js";
import type { WechatIpadProbeResult } from "../types.js";

/**
 * 探活后端服务与鉴权状态。
 */
export async function probeWechatIpad(
  baseUrl: string,
  apiToken: string,
  robotId: string,
  timeoutMs = 5000,
): Promise<WechatIpadProbeResult> {
  if (!baseUrl.trim()) {
    return { ok: false, elapsedMs: 0, message: "未提供 baseUrl" };
  }
  if (!apiToken.trim()) {
    return { ok: false, elapsedMs: 0, message: "未提供 apiToken" };
  }

  const start = Date.now();
  try {
    const data = await probeBackend({ baseUrl, apiToken, robotId, timeoutMs });
    return {
      ok: true,
      elapsedMs: Date.now() - start,
      message: "ok",
      details: data,
    };
  } catch (error) {
    const elapsedMs = Date.now() - start;
    if (error instanceof WechatIpadApiError) {
      return { ok: false, elapsedMs, message: error.message };
    }
    return {
      ok: false,
      elapsedMs,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
