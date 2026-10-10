import { useCallback, useEffect, useRef, useState } from "react";

import { describeLoadError } from "@/common/utils/ipc-error";

/** 一页拉多少首 —— 与主进程 `PLAYLIST_PAGE_SIZE` 一致（`v3/song/detail` 一次最多 100 个 id） */
const PAGE_SIZE = 100;

interface Result {
  /** 歌单名（首屏拉到之前是空串，调用方给个兜底文案） */
  name: string;
  /** 歌单**总**曲目数（不是已加载数） */
  trackCount: number;
  /** 已经累积加载到的曲目 */
  tracks: NeteaseTrack[];
  /** 首屏加载中 */
  loading: boolean;
  /** 正在加载下一页 —— 传给 `VirtualPageList` 的那个 `loading` */
  loadingMore: boolean;
  hasMore: boolean;
  error: string;
  /** `resolveId` 没找到歌单（未登录 / 账号里没有「我喜欢的音乐」） */
  found: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
}

/**
 * 分页拉取一个网易云歌单的曲目。
 *
 * 主进程的 `playlistDetail(id, offset, limit)` 是**分页**的（一页 100 首），
 * 单次调用拿不到千首歌单的全部曲目 —— 这里负责「首屏 + 滚到底加载更多 + 累积」。
 *
 * ⚠️ `resolveId` 必须由调用方 `useCallback` 包好，否则每次渲染都是新函数 → 无限重拉。
 * ⚠️ 换账号要传 `refreshKey`（通常是 `uid`）：这些页面在设置页换完账号后**不会卸载**
 *    （组件被复用），没有它就会一直显示上一个账号的歌单。
 */
export function useNeteasePlaylistTracks(
  resolveId: () => Promise<number | null>,
  refreshKey?: string | number | null,
): Result {
  const [name, setName] = useState("");
  const [trackCount, setTrackCount] = useState(0);
  const [tracks, setTracks] = useState<NeteaseTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState(true);

  /** 已解析出的歌单 id（加载更多要用） */
  const idRef = useRef<number | null>(null);
  /** 已请求过的曲目数 = 下一页的 offset */
  const loadedRef = useRef(0);
  /** 加载更多进行中 —— 挡住 `VirtualPageList` 补屏时的重复触发 */
  const busyRef = useRef(false);
  /**
   * 请求代际。换歌单 / 换账号后旧请求可能还在飞，
   * 不带代际的话它回来会把上一个账号的曲目追加到新列表里。
   */
  const genRef = useRef(0);

  const loadFirst = useCallback(async () => {
    const gen = ++genRef.current;
    busyRef.current = false;
    loadedRef.current = 0;
    idRef.current = null;

    setLoading(true);
    setError("");
    setFound(true);
    setHasMore(false);
    setTracks([]);
    setTrackCount(0);
    setName("");

    try {
      const id = await resolveId();
      if (gen !== genRef.current) return;
      if (!id) {
        setFound(false);
        return;
      }
      idRef.current = id;

      const detail = await window.electron.netease.playlistDetail(id, 0, PAGE_SIZE);
      if (gen !== genRef.current) return;

      const page = detail?.tracks ?? [];
      const total = detail?.trackCount ?? page.length;

      setName(detail?.name ?? "");
      setTrackCount(total);
      setTracks(page);
      loadedRef.current = page.length;
      // 空页说明 id 列表和实际能取到的曲目对不上，别让界面停在"无限加载"上
      setHasMore(page.length > 0 && page.length < total);
    } catch (err) {
      if (gen === genRef.current) setError(describeLoadError(err));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [resolveId]);

  const loadMore = useCallback(async () => {
    const id = idRef.current;
    if (!id || busyRef.current) return;

    busyRef.current = true;
    const gen = genRef.current;
    setLoadingMore(true);

    try {
      const detail = await window.electron.netease.playlistDetail(id, loadedRef.current, PAGE_SIZE);
      if (gen !== genRef.current) return;

      const page = detail?.tracks ?? [];
      const total = detail?.trackCount;

      if (typeof total === "number" && total > 0) setTrackCount(total);

      if (page.length === 0) {
        // 取不到更多了，收掉 hasMore，否则补屏逻辑会反复触发
        setHasMore(false);
        return;
      }

      loadedRef.current += page.length;
      setTracks(prev => [...prev, ...page]);
      setHasMore(loadedRef.current < (total ?? loadedRef.current + 1));
    } catch {
      // 加载更多失败不打断已有列表；放开锁让用户滚动时能自然重试
      setHasMore(true);
    } finally {
      busyRef.current = false;
      if (gen === genRef.current) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst, refreshKey]);

  return {
    name,
    trackCount,
    tracks,
    loading,
    loadingMore,
    hasMore,
    error,
    found,
    reload: loadFirst,
    loadMore,
  };
}

export default useNeteasePlaylistTracks;
