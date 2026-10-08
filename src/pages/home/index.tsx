import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { Skeleton } from "@heroui/react";
import { RiArrowRightSLine, RiPlayFill } from "@remixicon/react";
import clsx from "classnames";
import moment from "moment";

import Image from "@/components/image";
import { getWebDynamicFeedAll, type WebDynamicItem } from "@/service/web-dynamic";
import { searchWebInterfaceHistory, type HistoryListItem } from "@/service/web-interface-history-search";
import { usePlayList } from "@/store/play-list";
import { useUser } from "@/store/user";

/**
 * 主页。
 *
 * 结构就两块：上半部分是「问候语 + 当前时间」（进入时逐块浮现），
 * 下面一排是「最近播放（最多 2 条）+ 最新动态（最多 1 条）」。
 *
 * 两处取舍：
 *
 * 1. **进页面才拉数据，不做缓存。** 最近播放和最新动态都是"时效性"内容，
 *    缓存反而会让用户看到过期的东西；代价是每次回主页多两个请求，
 *    但也只有回主页时才发，和「历史记录」页每次进都拉是同一套行为。
 *
 * 2. **两个接口各拉各的、失败各自退化。** 动态接口挂了不该让最近播放也空着，
 *    所以分成两个独立的 async 块，且都不往界面上抛错误 ——
 *    主页是门面，不该因为某个接口失败就变成一块报错板。
 */
const GREETING_BOUNDS: Array<[number, string]> = [
  [5, "夜深了"],
  [9, "早上好"],
  [12, "上午好"],
  [14, "中午好"],
  [18, "下午好"],
  [24, "晚上好"],
];

const greetingOf = (hour: number) => GREETING_BOUNDS.find(([end]) => hour < end)?.[1] ?? "晚上好";

const pad = (value: number) => String(value).padStart(2, "0");

/** 封面缩略图：B 站的图可以带 `@宽_高_裁剪.格式` 后缀，省流量也更清晰 */
const THUMB_PARAMS = "160w_160h_1c.webp";

const Home = () => {
  const navigate = useNavigate();
  const isLogin = useUser(state => state.user?.isLogin);

  const [now, setNow] = useState(() => new Date());
  /** null = 还在加载；[] = 没有最近播放 */
  const [recent, setRecent] = useState<HistoryListItem[] | null>(null);
  /** undefined = 还在加载；null = 没有动态 */
  const [dynamicItem, setDynamicItem] = useState<WebDynamicItem | null | undefined>(undefined);

  // 时钟：每秒走一格。用 tabular-nums 保证数字跳动时整体不抖
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isLogin) {
      setRecent([]);
      setDynamicItem(null);
      return;
    }

    let alive = true;

    void (async () => {
      try {
        const res = await searchWebInterfaceHistory({ pn: 1 });
        const list = res.code === 0 ? (res.data?.list ?? []) : [];
        // 直接取历史最顶上的两条 —— 不做「能不能播」的过滤：
        // 用户要的是「我最近看过什么」，剧集/专栏也该照实显示（只是点了不播）
        if (alive) setRecent(list.slice(0, 2));
      } catch {
        if (alive) setRecent([]);
      }
    })();

    void (async () => {
      try {
        const res = await getWebDynamicFeedAll({ type: "video", platform: "web" });
        if (alive) setDynamicItem(res.code === 0 ? (res.data?.items?.[0] ?? null) : null);
      } catch {
        if (alive) setDynamicItem(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isLogin]);

  /** 能不能播：剧集（pgc）点不出播放器，没有 bvid 的也播不了 */
  const canPlay = (item: HistoryListItem) => Boolean(item.history?.bvid) && item.history?.business !== "pgc";

  const playHistory = (item: HistoryListItem) => {
    const { bvid } = item.history ?? {};
    if (!canPlay(item) || !bvid) return;

    void usePlayList.getState().play({
      type: "mv",
      bvid,
      title: item.title,
      cover: item.cover,
      ownerName: item.author_name,
      ownerMid: item.author_mid,
    });
  };

  const author = dynamicItem?.modules?.module_author;
  const dynamicText = dynamicItem?.modules?.module_dynamic?.desc?.text ?? "";
  const dynamicCover = dynamicItem?.modules?.module_dynamic?.major?.archive?.cover ?? "";

  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto px-8 pt-[9vh] pb-10">
      {/* 问候语 + 当前时间：三行分别延迟一点出现，形成"逐块浮现" */}
      <div className="home-reveal flex flex-col items-center" style={{ animationDelay: "60ms" }}>
        <div className="home-outlined text-base font-medium" style={{ opacity: 0.92 }}>
          {greetingOf(now.getHours())}
        </div>
        <div className="home-outlined mt-2 text-6xl leading-none font-bold tracking-tight tabular-nums">
          {pad(now.getHours())}:{pad(now.getMinutes())}
          <span className="text-3xl opacity-60">:{pad(now.getSeconds())}</span>
        </div>
        <div className="home-outlined-sm mt-3 text-sm">{moment(now).format("YYYY年M月D日 dddd")}</div>
      </div>

      <div
        className="home-reveal mt-32 flex w-full max-w-5xl flex-wrap items-start justify-center gap-6"
        style={{ animationDelay: "280ms" }}
      >
        {/* 最近播放（最多两首） */}
        <section className="flex min-w-[320px] flex-1 flex-col gap-2.5">
          <header className="flex items-center justify-between">
            <span className="home-outlined text-sm">最近播放</span>
            <button
              type="button"
              className="home-outlined-sm flex items-center gap-0.5 text-xs transition-opacity hover:opacity-70"
              onClick={() => void navigate("/history")}
            >
              全部
              <RiArrowRightSLine size={14} />
            </button>
          </header>

          {recent === null ? (
            <>
              <Skeleton className="rounded-large h-[64px]" />
              <Skeleton className="rounded-large h-[64px]" />
            </>
          ) : recent.length === 0 ? (
            <div className="home-outlined-sm rounded-large border-default-200/40 flex h-[64px] items-center justify-center border border-dashed text-sm">
              {isLogin ? "还没有播放记录" : "登录后显示最近播放"}
            </div>
          ) : (
            recent.map(item => (
              <button
                key={`${item.history.oid}-${item.view_at}`}
                type="button"
                onClick={() => playHistory(item)}
                className="group bg-content1/60 hover:bg-content2/70 rounded-large flex items-center gap-3 p-2 text-left transition-colors"
              >
                <Image
                  removeWrapper
                  src={item.cover}
                  params={THUMB_PARAMS}
                  className="rounded-medium h-[48px] w-[48px] flex-none object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="home-outlined truncate text-sm font-medium">{item.title}</div>
                  {item.author_name ? (
                    <div className="home-outlined-sm mt-0.5 truncate text-xs">{item.author_name}</div>
                  ) : null}
                </div>
                {canPlay(item) ? (
                  <RiPlayFill
                    size={18}
                    className="mr-1 flex-none text-white opacity-0 transition-opacity group-hover:opacity-100"
                  />
                ) : null}
              </button>
            ))
          )}
        </section>

        {/* 最新动态（最多一条） */}
        <section className="flex w-full max-w-[380px] min-w-[320px] flex-col gap-2.5">
          <header className="flex items-center justify-between">
            <span className="home-outlined text-sm">最新动态</span>
            <button
              type="button"
              className="home-outlined-sm flex items-center gap-0.5 text-xs transition-opacity hover:opacity-70"
              onClick={() => void navigate("/dynamic-feed")}
            >
              全部
              <RiArrowRightSLine size={14} />
            </button>
          </header>

          {dynamicItem === undefined ? (
            <Skeleton className="rounded-large h-[132px]" />
          ) : !dynamicItem ? (
            <div className="home-outlined-sm rounded-large border-default-200/40 flex h-[132px] items-center justify-center border border-dashed text-sm">
              {isLogin ? "暂时没有新动态" : "登录后显示最新动态"}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void navigate("/dynamic-feed")}
              className="group bg-content1/60 hover:bg-content2/70 rounded-large flex flex-col gap-2 p-3 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <Image
                  removeWrapper
                  src={author?.face}
                  params={THUMB_PARAMS}
                  className="h-6 w-6 flex-none rounded-full object-cover"
                />
                <span className="home-outlined min-w-0 flex-1 truncate text-xs font-medium">{author?.name ?? ""}</span>
                <span className="home-outlined-sm flex-none text-[11px]">{author?.pub_time ?? ""}</span>
              </div>

              <div
                className={clsx(
                  "home-outlined-sm text-xs leading-relaxed",
                  dynamicCover ? "line-clamp-3" : "line-clamp-5",
                )}
              >
                {dynamicText || dynamicItem.type}
              </div>

              {dynamicCover ? (
                <Image
                  removeWrapper
                  src={dynamicCover}
                  params="480w_270h_1c.webp"
                  className="rounded-medium h-[72px] w-full object-cover"
                />
              ) : null}
            </button>
          )}
        </section>
      </div>
    </div>
  );
};

export default Home;
