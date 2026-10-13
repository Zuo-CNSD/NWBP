import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * 被测模块内部有**模块级的 Map 缓存**，用例之间必须拿到全新的模块实例，
 * 所以每个用例都走 `vi.resetModules()` + 动态 import。
 */
const loadModule = async () => {
  vi.resetModules();
  return import("@/common/utils/netease-audio-url");
};

const songUrl = vi.fn();

const mockSongUrl = (impl: (id: number, level: string) => Promise<{ url: string; level: string }>) => {
  songUrl.mockImplementation(impl);
  (window as any).electron = { netease: { songUrl } };
};

beforeEach(() => {
  songUrl.mockReset();
  mockSongUrl(async id => ({ url: `https://cdn.example.com/${id}.mp3`, level: "exhigh" }));
});

describe("网易云播放地址缓存", () => {
  test("第一次要请求，第二次直接命中缓存", async () => {
    const { fetchNeteaseUrl } = await loadModule();

    const first = await fetchNeteaseUrl(1, "exhigh");
    const second = await fetchNeteaseUrl(1, "exhigh");

    expect(first.url).toBe("https://cdn.example.com/1.mp3");
    expect(second.url).toBe(first.url);
    expect(songUrl).toHaveBeenCalledTimes(1);
  });

  test("不同音质档位各自缓存，不会互相顶掉", async () => {
    const { fetchNeteaseUrl } = await loadModule();

    await fetchNeteaseUrl(1, "exhigh");
    await fetchNeteaseUrl(1, "lossless");
    await fetchNeteaseUrl(1, "exhigh");

    expect(songUrl).toHaveBeenCalledTimes(2);
  });

  test("并发取同一首会合并成一次请求（预取和点播放撞上时）", async () => {
    let resolvePending: (v: { url: string; level: string }) => void = () => {};
    mockSongUrl(
      () =>
        new Promise(resolve => {
          resolvePending = resolve;
        }),
    );

    const { fetchNeteaseUrl } = await loadModule();
    const a = fetchNeteaseUrl(7, "exhigh");
    const b = fetchNeteaseUrl(7, "exhigh");

    resolvePending({ url: "https://cdn.example.com/7.mp3", level: "exhigh" });
    const [ra, rb] = await Promise.all([a, b]);

    expect(songUrl).toHaveBeenCalledTimes(1);
    expect(ra.url).toBe(rb.url);
  });

  test("超过 TTL 之后会重新取一次", async () => {
    const { fetchNeteaseUrl, NETEASE_URL_TTL } = await loadModule();
    const base = Date.now();

    await fetchNeteaseUrl(9, "exhigh");
    expect(songUrl).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, "now").mockReturnValue(base + NETEASE_URL_TTL + 1);
    await fetchNeteaseUrl(9, "exhigh");

    expect(songUrl).toHaveBeenCalledTimes(2);
  });

  test("接口没给 url 时不写缓存 —— 否则会把「取不到」也缓存住", async () => {
    mockSongUrl(async () => ({ url: "", level: "standard" }));

    const { fetchNeteaseUrl } = await loadModule();
    await fetchNeteaseUrl(3, "exhigh");
    await fetchNeteaseUrl(3, "exhigh");

    expect(songUrl).toHaveBeenCalledTimes(2);
  });

  test("peek 在空缓存上返回 null，命中后返回 url", async () => {
    const { fetchNeteaseUrl, peekNeteaseUrl } = await loadModule();

    expect(peekNeteaseUrl(5, "exhigh")).toBeNull();

    await fetchNeteaseUrl(5, "exhigh");

    expect(peekNeteaseUrl(5, "exhigh")?.url).toBe("https://cdn.example.com/5.mp3");
  });
});

describe("预取", () => {
  test("失败只吞掉，不往外抛", async () => {
    mockSongUrl(async () => {
      throw new Error("network down");
    });

    const { prefetchNeteaseUrl } = await loadModule();

    expect(() => prefetchNeteaseUrl(1, "exhigh")).not.toThrow();
    // 让内部的 catch 跑完，避免污染后面用例的未处理拒绝
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  test("id 为空时根本不发请求", async () => {
    const { prefetchNeteaseUrl } = await loadModule();

    prefetchNeteaseUrl(undefined);
    prefetchNeteaseUrl(null);
    prefetchNeteaseUrl(0);

    expect(songUrl).not.toHaveBeenCalled();
  });
});

describe("防回归：播放流程必须走带缓存的取地址", () => {
  test("play-list 里不该再出现裸调 window.electron.netease.songUrl", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/store/play-list.ts"), "utf8");

    expect(source).toContain("fetchNeteaseUrl(");
    expect(source).not.toContain("window.electron.netease.songUrl(");
  });
});
