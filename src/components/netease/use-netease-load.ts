import { useCallback, useEffect, useState } from "react";

import { describeLoadError } from "@/common/utils/ipc-error";

interface Result<T> {
  data: T;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}

/**
 * 网易云几个页面的统一取数：一进页面拉一次 + 加载态 + 出错文案 + 重试。
 *
 * ⚠️ `loader` 必须由调用方用 `useCallback` 包好（它自己的依赖也写全），
 * 否则每次渲染都会生成新函数 → 这个 effect 会反复触发、无限请求。
 *
 * ⚠️ **换账号要传 `refreshKey`**（通常是当前 `uid`）。这些页面自己不会卸载
 * （在设置页换完账号再切回来时组件是复用的），没有这个 key 就会一直显示
 * 上一个账号的歌单。传原始值即可，别传对象。
 */
export function useNeteaseLoad<T>(
  loader: () => Promise<T>,
  initial: T,
  refreshKey?: string | number | null,
): Result<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loader());
    } catch (err) {
      setError(describeLoadError(err));
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    void run();
  }, [run, refreshKey]);

  return { data, loading, error, reload: run };
}

export default useNeteaseLoad;
