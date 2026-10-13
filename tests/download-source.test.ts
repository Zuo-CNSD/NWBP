import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { planDownloadSource, toNeteaseLevel } from "@/common/utils/download";

/**
 * 「下载音频」的来源判定。
 *
 * 这条链路踩过的坑：两个入口都把播放列表**内部 id** 当 sid 传给主进程
 * （`sid: item.id` / `sid: playItem?.type === "audio" ? playItem?.sid : undefined`
 * 里网易云那边连 sid 都是空的），结果任务建出来必然失败，
 * 错误信息只有一句 `can't get audio url`，很难从界面上看出原因。
 */

const readSource = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("planDownloadSource", () => {
  test("网易云走 netease 分支，用 neteaseId 而不是内部 id", () => {
    expect(
      planDownloadSource({
        type: "audio",
        source: "netease",
        id: "17916288851841",
        neteaseId: 3388614499,
      } as Parameters<typeof planDownloadSource>[0]),
    ).toEqual({ kind: "netease", neteaseId: 3388614499 });
  });

  test("网易云即使带了 sid 也优先判成 netease（它的 type 也是 audio）", () => {
    expect(planDownloadSource({ type: "audio", source: "netease", sid: 123, neteaseId: 456 })).toEqual({
      kind: "netease",
      neteaseId: 456,
    });
  });

  test("B 站音频站走 sid 分支", () => {
    expect(planDownloadSource({ type: "audio", source: "bilibili", sid: 287398 })).toEqual({
      kind: "bili-audio",
      sid: 287398,
    });
  });

  test("B 站视频走 bvid + cid", () => {
    expect(planDownloadSource({ type: "mv", bvid: "BV1xx411c7mD", cid: "12345" })).toEqual({
      kind: "bili-video",
      bvid: "BV1xx411c7mD",
      cid: "12345",
    });
  });

  test("本地音乐 / 什么都没带 → 明确拒绝，而不是造一个必然失败的任务", () => {
    expect(planDownloadSource({ type: "audio", source: "local" }).kind).toBe("none");
    expect(planDownloadSource({ source: "netease" }).kind).toBe("none");
    expect(planDownloadSource({ type: "audio", source: "netease", neteaseId: 0 }).kind).toBe("none");
  });
});

describe("toNeteaseLevel", () => {
  test("低 / 中 各降一档，其余（含自动、无损）都按最高档请求，拿不到由服务端降级", () => {
    expect(toNeteaseLevel("low")).toBe("standard");
    expect(toNeteaseLevel("medium")).toBe("exhigh");
    expect(toNeteaseLevel("high")).toBe("lossless");
    expect(toNeteaseLevel("lossless")).toBe("lossless");
    expect(toNeteaseLevel("auto")).toBe("lossless");
  });
});

describe("下载入口都走统一解析（防回归）", () => {
  const entries = ["src/components/music-download-button/index.tsx", "src/components/music-playlist-drawer/index.tsx"];

  test.each(entries)("%s 用 resolveDownloadSource 而不是自己拼 sid", relative => {
    const source = readSource(relative);
    expect(source).toContain("resolveDownloadSource(");
    // 曾经的写法：把播放列表内部 id 当 sid 传下去
    expect(source).not.toMatch(/sid:\s*item\.id/);
    expect(source).not.toMatch(/sid:\s*playItem\?\.id/);
  });

  test("主进程下载队列把 audioUrl 透传给任务（网易云直链靠它）", () => {
    const source = readSource("electron/ipc/download/download-queue.ts");
    expect(source).toContain("audioUrl: mediaInfo.audioUrl");
  });

  test("下载任务类型里声明了 audioUrl", () => {
    const source = readSource("shared/types/download.d.ts");
    expect(source).toMatch(/audioUrl\?:\s*string/);
  });
});
