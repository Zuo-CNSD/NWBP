import React, { useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Outlet, useLocation } from "react-router";

import log from "electron-log/renderer";

import ConfirmModal from "@/components/confirm-modal";
import Fallback from "@/components/error-fallback";
import FavoritesSelectModal from "@/components/favorites-select-modal";
import FullScreenPlayer from "@/components/full-screen-player";
import PlayListDrawer from "@/components/music-playlist-drawer";
import Onboarding from "@/components/onboarding";
import PageTransition from "@/components/page-transition";
import VideoPagesDownloadSelectModal from "@/components/video-pages-download-select-modal";
import PlayBar from "@/layout/playbar";
import { useOnboardingStore } from "@/store/modal/onboarding";
import { useNetease } from "@/store/netease";
import { useSettings } from "@/store/settings";
import { useUser } from "@/store/user";

import Navbar from "./navbar";
import PlayBarAudioBar from "./playbar/audio-bar";
import SideNav from "./side";

const Layout = () => {
  const playbarSpectrum = useSettings(state => state.playbarSpectrum);
  const onboardingDone = useSettings(state => state.onboardingDone);
  const openOnboarding = useOnboardingStore(state => state.open);
  const updateUser = useUser(state => state.updateUser);
  const refreshNeteaseAccount = useNetease(state => state.refresh);
  const location = useLocation();

  useEffect(() => {
    updateUser();
    // 侧栏「网易云」分组要按登录态显示，所以启动时也问一次
    void refreshNeteaseAccount();
  }, []);

  /*
   * 首次启动弹新手引导。
   *
   * 延迟一拍再弹：刚启动时主页还在拉数据，立刻盖一层模态框会让人觉得"卡住了"。
   *
   * 这里**只负责弹**，不负责标记「看过」—— 标记在引导组件关闭时写。
   * 之前图省事在这个 effect 里先写 `onboardingDone: true` 再挂 timer，
   * 结果开发模式下 React 19 的 StrictMode 会「挂载→卸载→再挂载」：
   * 第一轮把标记写成 true 并挂上 timer，清理时 timer 被 clear，
   * 第二轮因为标记已是 true 直接 return —— 引导永远不出现。
   */
  useEffect(() => {
    if (onboardingDone) return;
    const timer = window.setTimeout(() => openOnboarding(), 900);
    return () => window.clearTimeout(timer);
  }, [onboardingDone, openOnboarding]);

  return (
    <ErrorBoundary
      FallbackComponent={Fallback}
      resetKeys={[location.pathname]}
      onError={(error, info) => {
        log.error("[ErrorBoundary]", error, info);
      }}
    >
      {/*
        整块内容做成「一张浮起的圆角面板」：侧栏 / 内容区 / 播放栏都在它里面，
        彼此之间用分隔线而不是间隙 —— 只要有间隙，两个圆角之间就会漏出一条
        背景色，看着像没做完。圆角只在最外圈出现。
      */}
      <div className="h-full w-full p-2">
        <div className="glass-panel rounded-large relative flex h-full min-h-0 w-full flex-col overflow-hidden shadow-2xl">
          <div aria-hidden className="glass-fill" />
          <div className="glass-content flex min-h-0 w-full flex-1">
            <SideNav />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="h-16 flex-none">
                <Navbar />
              </div>
              {/*
                内容区不再自带圆角和边距 —— 外层面板已经负责裁剪，
                自己再套一层圆角反而会在滚动内容上多切一刀
              */}
              <div className="h-full min-h-0 overflow-hidden">
                <Outlet />
              </div>
            </div>
            {/*
              换页的极短加载反馈。**必须放在 .glass-content 里面** ——
              那一层本身就是 position: relative，所以不用给任何容器补定位，
              页面里那些 position: absolute 的元素不会因此换包含块。
              它是 SideNav 的兄弟节点，绝对定位 + pointer-events: none，
              既不参与 flex 排布，也不挡点击。
            */}
            <PageTransition />
          </div>
          {/* 播放栏：靠上边框和内容区分开，不再留缝 */}
          <div className="border-divider/20 relative z-50 flex-none border-t">
            {/*
              动态音频条：跟在播放栏正上方，属于播放栏这一块（边框留在它上面）。
              可以关掉 —— 设置 → 常规设置 → 播放栏音频条。
            */}
            {playbarSpectrum ? (
              <div className="px-5 pt-1 pb-0.5">
                <PlayBarAudioBar />
              </div>
            ) : null}
            <div className="h-[88px]">
              <PlayBar />
            </div>
          </div>
        </div>
      </div>
      <FavoritesSelectModal />
      <ConfirmModal />
      <VideoPagesDownloadSelectModal />
      <PlayListDrawer />
      <FullScreenPlayer />
      <Onboarding />
    </ErrorBoundary>
  );
};

export default Layout;
