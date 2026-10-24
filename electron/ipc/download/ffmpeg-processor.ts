import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import path from "node:path";

import { fixFfmpegPath } from "../../utils";

interface ConvertOptions {
  outputFileType: MediaDownloadOutputFileType;
  /** 有些视频可能没有音频 */
  audioTempPath?: string;
  videoTempPath?: string;
  outputPath: string;
  /**
   * 目标音频格式。不填 = `-c:a copy`（原始流直接封装，无损无耗时）。
   * 填了才真转码 —— 这是唯一会损失音质的路径，所以默认不走。
   */
  audioFormat?: "mp3" | "flac";
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

const getAvailableOutputPath = (outputPath: string) => {
  if (!fs.existsSync(outputPath)) return outputPath;

  const parsed = path.parse(outputPath);
  const name = parsed.ext ? parsed.name : parsed.base;
  const ext = parsed.ext;

  for (let i = 1; i < 10000; i += 1) {
    const next = path.join(parsed.dir, `${name} (${i})${ext}`);
    if (!fs.existsSync(next)) return next;
  }

  throw new Error("Cannot find available output path");
};

export const convert = async ({
  audioTempPath,
  videoTempPath,
  outputPath,
  outputFileType,
  audioFormat,
  onProgress,
  signal,
}: ConvertOptions): Promise<string> => {
  fixFfmpegPath();
  const finalOutputPath = getAvailableOutputPath(outputPath);
  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    if (signal?.aborted) {
      return reject(new Error("Aborted"));
    }

    signal?.addEventListener("abort", () => {
      command.kill("SIGKILL");
      reject(new Error("Aborted"));
    });

    if (outputFileType === "video") {
      if (!videoTempPath) {
        return reject(new Error("Video conversion requires video temp path"));
      }

      command.input(videoTempPath);

      if (audioTempPath) {
        // ffmpeg -i video -i audio -c:v copy -c:a copy -shortest output
        command.input(audioTempPath);
        command.outputOptions(["-c:v copy", "-c:a copy", "-shortest"]);
      } else {
        // ffmpeg -i video -c:v copy output
        command.outputOptions(["-c:v copy"]);
      }
    } else {
      if (!audioTempPath) {
        return reject(new Error("Audio conversion requires audio temp path"));
      }
      command.input(audioTempPath);
      if (audioFormat === "mp3") {
        // 320k 是 mp3 的实际上限，再高只会让文件更大
        command.outputOptions(["-c:a", "libmp3lame", "-b:a", "320k"]);
      } else if (audioFormat === "flac") {
        command.outputOptions(["-c:a", "flac"]);
      } else {
        // 默认：原始音频流直接复制，不重新编码
        command.outputOptions(["-c:a copy"]);
      }
    }

    command.on("progress", progress => {
      if (onProgress && progress.percent) {
        onProgress(Math.round(progress.percent));
      }
    });

    command.on("error", err => {
      reject(err);
    });

    command.on("end", () => {
      resolve(finalOutputPath);
    });

    // Save to output path
    command.save(finalOutputPath);
  });
};
