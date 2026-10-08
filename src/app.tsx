import { useEffect } from "react";
import { useHref, useNavigate, useRoutes } from "react-router";

import { HeroUIProvider, ToastProvider } from "@heroui/react";
import moment from "moment";

import { getCookitFromBSite } from "./common/utils/cookie";
import { startDesktopLyricsBroadcast, stopDesktopLyricsBroadcast } from "./common/utils/desktop-lyrics-channel";
import { isAuxiliaryWindow } from "./common/utils/lyrics-render";
import { toggleMiniMode } from "./common/utils/mini-player";
import { mapKeyToElectronAccelerator } from "./common/utils/shortcut";
import AppLaunchAnimation from "./components/app-launch-animation";
import Theme from "./components/theme";
import routes from "./routes";
import { useLyrics } from "./store/lyrics";
import { usePlayList } from "./store/play-list";
import { usePlayProgress } from "./store/play-progress";
import { useSettings } from "./store/settings";
import { useShortcutSettings } from "./store/shortcuts";

import "moment/locale/zh-cn";

import "overlayscrollbars/overlayscrollbars.css";
import "./app.css";

moment.locale("zh-cn");

export function App() {
  const routeElement = useRoutes(routes);
  const navigate = useNavigate();

  useEffect(() => {
    getCookitFromBSite();
  }, []);

  /*
   * 歌词解析挂在这里，而不是挂在全屏播放器的歌词组件上。
   * 挂组件上的话，用户不开全屏就不会解析，桌面歌词永远是空的。
   */
  const playId = usePlayList(s => s.playId);

  useEffect(() => {
    if (isAuxiliaryWindow()) return;

    startDesktopLyricsBroadcast();
    return () => stopDesktopLyricsBroadcast();
  }, []);

  useEffect(() => {
    if (isAuxiliaryWindow()) return;

    void useLyrics.getState().load();
    // playId 变化才重新解析；load 内部会自己读当前曲目
  }, [playId]);

  /*
   * 桌面歌词的开关/锁定状态以**主进程**为准，会广播回来。
   * 因为用户可能在歌词条上直接点 × 关掉，或者点锁解锁 —— 这些都是主进程在动作，
   * 主窗口的 zustand store 是另一个内存副本，不接这路广播就会和真实状态对不上，
   * 接着设置页挂载时又会把过期的值写回去。
   */
  useEffect(() => {
    if (isAuxiliaryWindow()) return;

    return window.electron?.desktopLyrics?.onStyleChanged?.(next => {
      useSettings.getState().update({
        desktopLyrics: next.enabled,
        desktopLyricsLocked: next.locked,
        desktopLyricsFontSize: next.fontSize,
        desktopLyricsColor: next.color,
        desktopLyricsShowTranslation: next.showTranslation,
        desktopLyricsShowRomanization: next.showRomanization,
        desktopLyricsSpectrum: next.spectrum,
      });
    });
  }, []);

  useEffect(() => {
    if (window.electron && window.electron.navigate) {
      const removeListener = window.electron.navigate(path => navigate(path));
      return removeListener;
    }
  }, [navigate]);

  // 订阅来自主进程的任务栏缩略按钮命令
  useEffect(() => {
    if (window.electron && window.electron.onPlayerCommand) {
      const removeListener = window.electron.onPlayerCommand(cmd => {
        const { prev, next, togglePlay } = usePlayList.getState();
        if (cmd === "prev") {
          prev();
        } else if (cmd === "next") {
          next();
        } else if (cmd === "toggle") {
          togglePlay();
        }
      });
      return removeListener;
    }
  }, []);

  // 订阅来自主进程的全局快捷键命令
  useEffect(() => {
    if (window.electron && window.electron.onShortcutCommand) {
      return window.electron.onShortcutCommand(cmd => {
        const { prev, next, togglePlay, setVolume, volume } = usePlayList.getState();

        switch (cmd) {
          case "togglePlay":
            togglePlay();
            break;
          case "prev":
            prev();
            break;
          case "next":
            next();
            break;
          case "volumeUp":
            setVolume(Math.min(1, volume + 0.05));
            break;
          case "volumeDown":
            setVolume(Math.max(0, volume - 0.05));
            break;
          case "toggleMiniMode":
            toggleMiniMode();
            break;
          default:
            break;
        }
      });
    }
  }, []);

  // 监听应用内快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略在输入框中的按键
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const shortcut = mapKeyToElectronAccelerator(e);
      if (!shortcut) return;

      const { shortcuts } = useShortcutSettings.getState();
      const matched = shortcuts.find(s => s.shortcut === shortcut);

      if (matched) {
        e.preventDefault();
        const { prev, next, togglePlay, setVolume, volume } = usePlayList.getState();
        switch (matched.id) {
          case "togglePlay":
            togglePlay();
            break;
          case "prev":
            prev();
            break;
          case "next":
            next();
            break;
          case "volumeUp":
            setVolume(Math.min(1, volume + 0.05));
            break;
          case "volumeDown":
            setVolume(Math.max(0, volume - 0.05));
            break;
          case "toggleMiniMode":
            toggleMiniMode();
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (usePlayProgress.getState().currentTime) {
        usePlayProgress.getState().saveCurrentTime();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    // 清理函数
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return (
    <HeroUIProvider navigate={navigate} useHref={useHref} locale="zh-CN">
      <ToastProvider
        placement="bottom-right"
        toastOffset={90}
        maxVisibleToasts={3}
        toastProps={{ timeout: 2000, color: "primary" }}
        regionProps={{
          classNames: {
            base: "z-[99999]",
          },
        }}
      />
      <Theme>
        {routeElement}
        {/* 开场动画盖在最上层；辅助窗里它自己会返回 null */}
        <AppLaunchAnimation />
      </Theme>
    </HeroUIProvider>
  );
}
