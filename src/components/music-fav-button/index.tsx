import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";

import { RiStarFill, RiStarLine } from "@remixicon/react";

import { favoriteTrack, isNeteaseTrack } from "@/common/utils/favorite";
import IconButton from "@/components/icon-button";
import { useMusicFavStore } from "@/store/music-fav";
import { useNeteaseLike } from "@/store/netease-like";
import { usePlayList } from "@/store/play-list";

/**
 * 播放栏的收藏星星。
 *
 * **曲目来自哪家就收藏到哪家**：
 * - 网易云曲目 → 直接翻转「我喜欢的音乐」，星星跟着 `useNeteaseLike` 的集合走
 * - B 站曲目   → 打开收藏夹选择弹窗，星星跟着 `useMusicFavStore` 走
 *
 * 两套状态都得订阅（hooks 不能条件调用），真正决定显示哪个的是 `isNetease`。
 */
const MusicFavButton = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const list = usePlayList(s => s.list);
  const playId = usePlayList(s => s.playId);
  const playItem = useMemo(() => list.find(item => item.id === playId), [list, playId]);

  const isNetease = isNeteaseTrack(playItem);
  const biliIsFav = useMusicFavStore(s => s.isFav);
  const refreshIsFav = useMusicFavStore(s => s.refreshIsFav);
  const setIsFav = useMusicFavStore(s => s.setIsFav);
  const neteaseLikedIds = useNeteaseLike(s => s.ids);

  const isFav = isNetease ? Boolean(playItem?.neteaseId && neteaseLikedIds.has(playItem.neteaseId)) : biliIsFav;

  useEffect(() => {
    if (!playItem) return;

    if (isNeteaseTrack(playItem)) {
      // 拉一次集合就够了，store 内部会去重 / 走缓存
      void useNeteaseLike.getState().refresh();
      return;
    }

    refreshIsFav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playItem]);

  const handleOpen = () => {
    if (!playItem) return;

    void favoriteTrack(playItem, {
      onChanged: next => {
        // 网易云那边由 store 自己维护集合，这里不用再同步；只有 B 站要走下面这段
        if (isNetease) return;

        setIsFav(next);

        if (location.pathname.startsWith("/collection/")) {
          const searchParams = new URLSearchParams(location.search);
          searchParams.set("refresh", Date.now().toString());

          navigate(
            {
              pathname: location.pathname,
              search: `?${searchParams.toString()}`,
            },
            { replace: true },
          );
        }
      },
    });
  };

  return (
    <IconButton onPress={handleOpen} disabled={!playItem}>
      {isFav ? <RiStarFill size={18} className="text-primary" /> : <RiStarLine size={18} />}
    </IconButton>
  );
};

export default MusicFavButton;
