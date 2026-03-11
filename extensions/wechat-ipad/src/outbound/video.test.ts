import { describe, expect, it, vi } from "vitest";

// mock child_process 和 fs/promises，避免测试依赖真实 ffmpeg/ffprobe
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("openclaw/plugin-sdk", () => ({
  withTempDownloadPath: vi.fn(async <T>(_params: unknown, fn: (tmpPath: string) => Promise<T>) =>
    fn("/tmp/mock-video.mp4"),
  ),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(async () => undefined),
  readFile: vi.fn(async () => Buffer.from("fake-jpeg-data")),
}));

import { execFile } from "node:child_process";
import { extractVideoDuration, extractVideoThumbnail } from "./video.js";

describe("extractVideoDuration", () => {
  it("解析 ffprobe 正常输出", async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
        (callback as (err: Error | null, stdout: string) => void)(null, "42.5\n");
        return undefined as never;
      },
    );

    const duration = await extractVideoDuration("/tmp/test.mp4");
    expect(duration).toBe(43); // Math.round(42.5)
  });

  it("ffprobe 不可用时返回 undefined", async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
        (callback as (err: Error | null, stdout: string) => void)(
          new Error("ffprobe not found"),
          "",
        );
        return undefined as never;
      },
    );

    const duration = await extractVideoDuration("/tmp/test.mp4");
    expect(duration).toBeUndefined();
  });

  it("ffprobe 输出非数字时返回 undefined", async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
        (callback as (err: Error | null, stdout: string) => void)(null, "N/A\n");
        return undefined as never;
      },
    );

    const duration = await extractVideoDuration("/tmp/test.mp4");
    expect(duration).toBeUndefined();
  });
});

describe("extractVideoThumbnail", () => {
  it("ffmpeg 正常时返回缩略图 buffer", async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
        (callback as (err: Error | null) => void)(null);
        return undefined as never;
      },
    );

    const thumbnail = await extractVideoThumbnail("/tmp/test.mp4");
    expect(thumbnail).toBeInstanceOf(Buffer);
    expect(thumbnail!.length).toBeGreaterThan(0);
  });

  it("ffmpeg 不可用时返回 undefined", async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
        (callback as (err: Error | null) => void)(new Error("ffmpeg not found"));
        return undefined as never;
      },
    );

    const thumbnail = await extractVideoThumbnail("/tmp/test.mp4");
    expect(thumbnail).toBeUndefined();
  });
});
