import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { withTempDownloadPath } from "openclaw/plugin-sdk/wechat-ipad";

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
        const buf = await readFile(thumbPath);
        return buf.length > 0 ? buf : undefined;
      },
    );
  } catch {
    return undefined;
  }
}

/**
 * 调用 ffmpeg 将非 mp4 视频转码为 mp4（h264+aac）。
 * ffmpeg 不可用或转码失败时返回 undefined（调用方应保留原 buffer）。
 */
export async function transcodeToMp4(
  inputPath: string,
  log?: (message: string) => void,
): Promise<Buffer | undefined> {
  try {
    return await withTempDownloadPath(
      { prefix: "wechat-ipad-transcode", fileName: "output.mp4" },
      async (outputPath) => {
        await new Promise<void>((resolve, reject) => {
          execFile(
            "ffmpeg",
            [
              "-y",
              "-i",
              inputPath,
              "-c:v",
              "libx264",
              "-preset",
              "fast",
              "-crf",
              "23",
              "-c:a",
              "aac",
              "-movflags",
              "+faststart",
              outputPath,
            ],
            { timeout: 120_000 },
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            },
          );
        });
        const buf = await readFile(outputPath);
        if (buf.length === 0) return undefined;
        log?.("wechat-ipad: 视频已转码为 mp4 (h264+aac)");
        return buf;
      },
    );
  } catch {
    log?.("wechat-ipad: ffmpeg 转码失败，将使用原始格式发送");
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
 * - 非 mp4 格式 → 先尝试 ffmpeg 转码为 mp4，失败则使用原始 buffer
 * - ffprobe 不可用 → playLength 使用默认值 10 秒
 * - ffmpeg 不可用 → thumbnailBase64 使用硬编码最小黑色 JPEG
 */
export async function prepareVideoPayload(
  videoBuffer: Buffer,
  log?: (message: string) => void,
  mime?: string,
): Promise<{
  videoBase64: string;
  thumbnailBase64: string;
  playLength: number;
}> {
  // 检测源格式，非 mp4 需要转码
  const isMp4 = !mime || mime.toLowerCase().includes("mp4");
  const sourceExt = isMp4 ? "video.mp4" : `video.${mime?.split("/")[1] ?? "bin"}`;

  return await withTempDownloadPath(
    { prefix: "wechat-ipad-video", fileName: sourceExt },
    async (inputPath) => {
      await writeFile(inputPath, videoBuffer);

      // 非 mp4 格式尝试转码
      let effectiveBuffer = videoBuffer;
      let effectivePath = inputPath;
      if (!isMp4) {
        log?.(`wechat-ipad: 检测到非 mp4 视频格式 (${mime})，尝试转码`);
        const transcoded = await transcodeToMp4(inputPath, log);
        if (transcoded) {
          effectiveBuffer = transcoded;
          // 写入转码后的文件供 ffprobe/ffmpeg 提取信息
          return await withTempDownloadPath(
            { prefix: "wechat-ipad-video-tc", fileName: "video.mp4" },
            async (transcodedPath) => {
              await writeFile(transcodedPath, transcoded);
              return await buildPayload(transcoded, transcodedPath, log);
            },
          );
        }
        // 转码失败，使用原始 buffer
        log?.("wechat-ipad: 转码失败，使用原始视频格式发送（可能不兼容）");
      }

      return await buildPayload(effectiveBuffer, effectivePath, log);
    },
  );
}

async function buildPayload(
  videoBuffer: Buffer,
  videoPath: string,
  log?: (message: string) => void,
): Promise<{
  videoBase64: string;
  thumbnailBase64: string;
  playLength: number;
}> {
  const videoBase64 = `data:video/mp4;base64,${videoBuffer.toString("base64")}`;

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
}
