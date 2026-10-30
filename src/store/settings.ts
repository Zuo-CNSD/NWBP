import { create } from "zustand";
import { persist } from "zustand/middleware";

import { normalizeLanguage } from "@shared/i18n";
import { defaultAppSettings } from "@shared/settings/app-settings";
import { StoreNameMap } from "@shared/store";

interface SettingsActions {
  getSettings: () => AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

export const useSettings = create<AppSettings & SettingsActions>()(
  persist(
    (set, get) => ({
      ...defaultAppSettings,
      getSettings: () => {
        return Object.keys(defaultAppSettings).reduce((acc, key) => {
          acc[key] = get()[key];
          return acc;
        }, {} as AppSettings);
      },
      update: (patch: Partial<AppSettings>) => {
        /*
         * 只写真的变了的字段。
         *
         * 两个原因：
         *  1. 值没变就不该通知订阅者 —— 否则拖着滑块时每帧都白重渲染一轮；
         *  2. persist 中间件只要收到一次 set 就会把**整份设置**写一遍磁盘，
         *     值相同的写入纯属浪费。
         * 比较用 `!==` 就够：设置项要么是原始值，要么是「改了必然换成新引用」的对象。
         */
        const current = get();
        const changed = Object.entries(patch).some(([key, value]) => current[key as keyof AppSettings] !== value);
        if (!changed) return;

        set(patch);
      },
      reset: () => {
        set(defaultAppSettings);
      },
    }),
    {
      name: "settings",
      storage: {
        getItem: async () => {
          const store = await window.electron.getStore(StoreNameMap.AppSettings);

          /*
           * 首次启动（磁盘上还没有设置）就跟随系统语言。
           *
           * 否则繁体 / 英文系统的用户第一次打开看到的是一屏简体，
           * 得自己翻到设置里改用哪种语言 —— 这不是「支持了某种语言」该有的样子。
           * 只要存过设置就一律尊重存档，不做任何「自动」覆盖：选过就是选过了。
           */
          if (!store?.appSettings) {
            // 只给 language，其余字段由 persist 用 defaultAppSettings 补齐；
            // 类型上要求整份 AppSettings，所以这里断言一下
            return { state: { language: normalizeLanguage(navigator.language) } as AppSettings };
          }

          // 兼容之前的错误默认值
          if (store.appSettings.fontFamily === "system-default") {
            store.appSettings.fontFamily = "system-ui";
          }

          // 旧版本默认圆角为 8px（偏方），新版本提升到 14px，让整体更圆润。
          // 仅迁移「仍是旧默认值」的配置，用户手动调过的值保持不动。
          if (store.appSettings.borderRadius === 8) {
            store.appSettings.borderRadius = defaultAppSettings.borderRadius;
          }

          /*
           * 旧版本把品牌绿写进了默认值，于是每个升级上来的用户配置里都躺着
           * `#1ed760` —— 不迁移的话，主题改成黑白也照样满屏发绿。
           * 只动「还是那串绿」的配置：自己挑过颜色的用户不受影响。
           */
          if (store.appSettings.primaryColor === "#1ed760") {
            store.appSettings.primaryColor = "";
          }

          return {
            state: store.appSettings,
          };
        },

        setItem: async (_, value) => {
          if (value.state) {
            await window.electron.setStore(StoreNameMap.AppSettings, {
              appSettings: value.state,
            });
          }
        },

        removeItem: async () => {
          await window.electron.clearStore(StoreNameMap.AppSettings);
        },
      },
      partialize: state => {
        return {
          language: state.language,
          downloadPath: state.downloadPath,
          closeWindowOption: state.closeWindowOption,
          autoStart: state.autoStart,
          fontFamily: state.fontFamily,
          primaryColor: state.primaryColor,
          backgroundColor: state.backgroundColor,
          borderRadius: state.borderRadius,
          liquidGlass: state.liquidGlass,
          glassOpacity: state.glassOpacity,
          backgroundImage: state.backgroundImage,
          backgroundImageBlur: state.backgroundImageBlur,
          backgroundImageDim: state.backgroundImageDim,
          windowTransparent: state.windowTransparent,
          audioQuality: state.audioQuality,
          musicSource: state.musicSource,
          sourceMode: state.sourceMode,
          hiddenMenuKeys: state.hiddenMenuKeys,
          displayMode: state.displayMode,
          ffmpegPath: state.ffmpegPath,
          themeMode: state.themeMode,
          appLaunchAnimation: state.appLaunchAnimation,
          appLaunchAnimationDuration: state.appLaunchAnimationDuration,
          appLaunchAnimationVideo: state.appLaunchAnimationVideo,
          showSearchHistory: state.showSearchHistory,
          onboardingDone: state.onboardingDone,
          proxySettings: state.proxySettings,
          sideMenuCollapsed: state.sideMenuCollapsed,
          sideMenuWidth: state.sideMenuWidth,
          sideMenuCollectionFolded: state.sideMenuCollectionFolded,
          reportPlayHistory: state.reportPlayHistory,
          localMusicDirs: state.localMusicDirs,
          desktopLyrics: state.desktopLyrics,
          desktopLyricsFontSize: state.desktopLyricsFontSize,
          desktopLyricsColor: state.desktopLyricsColor,
          desktopLyricsBackgroundMode: state.desktopLyricsBackgroundMode,
          desktopLyricsBackgroundOpacity: state.desktopLyricsBackgroundOpacity,
          desktopLyricsBackgroundColor: state.desktopLyricsBackgroundColor,
          desktopLyricsBackgroundImage: state.desktopLyricsBackgroundImage,
          desktopLyricsBackgroundImageBlur: state.desktopLyricsBackgroundImageBlur,
          desktopLyricsTextOpacity: state.desktopLyricsTextOpacity,
          desktopLyricsShowTranslation: state.desktopLyricsShowTranslation,
          desktopLyricsShowRomanization: state.desktopLyricsShowRomanization,
          desktopLyricsSpectrum: state.desktopLyricsSpectrum,
          playbarSpectrum: state.playbarSpectrum,
          desktopLyricsBounds: state.desktopLyricsBounds,
          desktopLyricsLocked: state.desktopLyricsLocked,
          desktopLyricsLockMigrated: state.desktopLyricsLockMigrated,
        };
      },
    },
  ),
);
