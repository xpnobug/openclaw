import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { withTempDownloadPath } from "openclaw/plugin-sdk";

/** 默认语音时长毫秒数（ffprobe 不可用时使用）。 */
export const DEFAULT_VOICE_DURATION_MS = 5000;

/**
 * 调用 ffprobe 获取音频时长（秒），ffprobe 不可用时返回 undefined。
 */
export async function extractAudioDuration(audioPath: string): Promise<number | undefined> {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          audioPath,
        ],
        { timeout: 15_000 },
        (err, stdout) => {
          if (err) {
            reject(err);
          } else {
            resolve(stdout);
          }
        },
      );
    });
    const parsed = Number.parseFloat(stdout.trim());
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 根据 MIME 类型判断语音编码类型。
 * - amr → 0
 * - 其他（mp3/wav 等，桥接服务负责 silk 编码）→ 4
 */
export function resolveVoiceType(mime: string): number {
  const lower = mime.toLowerCase();
  if (lower.includes("amr")) return 0;
  return 4;
}

/**
 * 调用 ffprobe 获取视频时长（秒），ffprobe 不可用时返回 undefined。
 */
export async function extractVideoDuration(videoPath: string): Promise<number | undefined> {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          videoPath,
        ],
        { timeout: 15_000 },
        (err, stdout) => {
          if (err) {
            reject(err);
          } else {
            resolve(stdout);
          }
        },
      );
    });
    const parsed = Number.parseFloat(stdout.trim());
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 调用 ffmpeg 截取视频第一帧为 JPEG（320px 宽），ffmpeg 不可用时返回 undefined。
 */
export async function extractVideoThumbnail(videoPath: string): Promise<Buffer | undefined> {
  try {
    return await withTempDownloadPath(
      { prefix: "wechat-ipad-thumb", fileName: "thumb.jpg" },
      async (thumbPath) => {
        await new Promise<void>((resolve, reject) => {
          execFile(
            "ffmpeg",
            [
              "-y",
              "-i",
              videoPath,
              "-vframes",
              "1",
              "-vf",
              "scale=320:-1",
              "-f",
              "image2",
              thumbPath,
            ],
            { timeout: 15_000 },
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            },
          );
        });
        const { readFile } = await import("node:fs/promises");
        const buf = await readFile(thumbPath);
        return buf.length > 0 ? buf : undefined;
      },
    );
  } catch {
    return undefined;
  }
}

// 硬编码最小黑色 1x1 JPEG，作为缩略图降级方案
const FALLBACK_THUMBNAIL_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=";

const DEFAULT_PLAY_LENGTH = 10;

/**
 * 将视频 buffer 写入临时文件，并行提取 duration + thumbnail，返回发送视频所需的 payload。
 *
 * 降级策略：
 * - ffprobe 不可用 → playLength 使用默认值 10 秒
 * - ffmpeg 不可用 → thumbnailBase64 使用硬编码最小黑色 JPEG
 */
export async function prepareVideoPayload(
  videoBuffer: Buffer,
  log?: (message: string) => void,
): Promise<{
  videoBase64: string;
  thumbnailBase64: string;
  playLength: number;
}> {
  const videoBase64 = `data:video/mp4;base64,${videoBuffer.toString("base64")}`;

  return await withTempDownloadPath(
    { prefix: "wechat-ipad-video", fileName: "video.mp4" },
    async (videoPath) => {
      await writeFile(videoPath, videoBuffer);

      const [duration, thumbnail] = await Promise.all([
        extractVideoDuration(videoPath),
        extractVideoThumbnail(videoPath),
      ]);

      if (!duration) {
        log?.("wechat-ipad: ffprobe 不可用或无法解析时长，使用默认值 10 秒");
      }
      if (!thumbnail) {
        log?.("wechat-ipad: ffmpeg 不可用或无法提取缩略图，使用降级黑色 JPEG");
      }

      const thumbnailBase64 = thumbnail
        ? `data:image/jpeg;base64,${thumbnail.toString("base64")}`
        : `data:image/jpeg;base64,${FALLBACK_THUMBNAIL_BASE64}`;

      return {
        videoBase64,
        thumbnailBase64,
        playLength: duration ?? DEFAULT_PLAY_LENGTH,
      };
    },
  );
}
