import { beforeEach, describe, expect, test } from "vitest";

import type { PlayData } from "@/store/play-list";

import { historyKey, type PlayHistoryItem, toPlayItem, usePlayHistory } from "@/store/play-history";

const track = (patch: Partial<PlayData>): PlayData => ({ id: "x", title: "t", type: "audio", ...patch }) as PlayData;

const row = (patch: Partial<PlayHistoryItem>): PlayHistoryItem =>
  ({ key: "k", title: "t", type: "audio", playedAt: 0, ...patch }) as PlayHistoryItem;

beforeEach(() => {
  usePlayHistory.setState({ items: [] });
});

describe("historyKey", () => {
  test("B 站的 sid 和网易云的 id 都是纯数字，必须靠来源前缀区分", () => {
    const bili = historyKey(track({ type: "audio", sid: 123 }));
    const netease = historyKey(track({ type: "audio", source: "netease", neteaseId: 123 }));

    expect(bili).toBe("bili:audio:123");
    expect(netease).toBe("netease:123");
    expect(bili).not.toBe(netease);
  });

  test("视频按 bvid 去重 —— 分集不该在最近播放里刷屏", () => {
    expect(historyKey(track({ type: "mv", bvid: "BV1" }))).toBe("bili:mv:BV1");
    expect(historyKey(track({ type: "mv", bvid: "BV1", cid: "9", pageIndex: 3 }))).toBe("bili:mv:BV1");
  });

  test("本地文件用路径当 key", () => {
    expect(historyKey(track({ type: "audio", source: "local", id: "/music/a.mp3" }))).toBe("local:/music/a.mp3");
  });

  test("没有可用的唯一 id 时不记（避免一堆「未知歌曲」占满列表）", () => {
    expect(historyKey(track({ type: "mv" }))).toBeNull();
    expect(historyKey(track({ type: "audio" }))).toBeNull();
  });
});

describe("usePlayHistory.record", () => {
  test("重复播放同一首只留一条，并挪到最前", () => {
    const { record } = usePlayHistory.getState();
    record(track({ type: "audio", sid: 1, title: "A" }));
    record(track({ type: "audio", sid: 2, title: "B" }));
    record(track({ type: "audio", sid: 1, title: "A" }));

    const { items } = usePlayHistory.getState();
    expect(items.map(item => item.title)).toEqual(["A", "B"]);
    expect(items[0].sid).toBe(1);
    expect(items[0].playedAt).toBeGreaterThanOrEqual(items[1].playedAt);
  });

  test("B 站和网易云的同号曲目是两条不同的记录", () => {
    const { record } = usePlayHistory.getState();
    record(track({ type: "audio", sid: 123, title: "B站版" }));
    record(track({ type: "audio", source: "netease", neteaseId: 123, title: "网易云版" }));

    const { items } = usePlayHistory.getState();
    expect(items).toHaveLength(2);
    expect(items.map(item => item.title)).toEqual(["网易云版", "B站版"]);
  });

  test("remove 只删指定的一条，clear 清空", () => {
    const { record, remove, clear } = usePlayHistory.getState();
    record(track({ type: "audio", sid: 1 }));
    record(track({ type: "audio", sid: 2 }));

    remove("bili:audio:1");
    expect(usePlayHistory.getState().items.map(item => item.sid)).toEqual([2]);

    clear();
    expect(usePlayHistory.getState().items).toHaveLength(0);
  });
});

describe("toPlayItem", () => {
  test("三种来源都能还原成能播的项", () => {
    expect(toPlayItem(row({ source: "netease", neteaseId: 1 }))).toMatchObject({
      type: "audio",
      source: "netease",
      neteaseId: 1,
    });
    expect(toPlayItem(row({ type: "mv", bvid: "BV1" }))).toMatchObject({ type: "mv", bvid: "BV1" });
    expect(toPlayItem(row({ source: "local", localPath: "/a.mp3" }))).toMatchObject({
      source: "local",
      id: "/a.mp3",
      audioUrl: "/a.mp3",
    });
  });

  test("缺关键 id 时返回 null —— 不造一个点了没反应的项", () => {
    expect(toPlayItem(row({ type: "mv" }))).toBeNull();
    expect(toPlayItem(row({ source: "netease" }))).toBeNull();
    expect(toPlayItem(row({ source: "local" }))).toBeNull();
  });
});
