import { create } from "zustand";
import { persist } from "zustand/middleware";

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

          // 兼容之前的错误默认值
          if (store?.appSettings?.fontFamily === "system-default") {
            store.appSettings.fontFamily = "system-ui";
          }

          // 旧版本默认圆角为 8px（偏方），新版本提升到 14px，让整体更圆润。
          // 仅迁移「仍是旧默认值」的配置，用户手动调过的值保持不动。
          if (store?.appSettings?.borderRadius === 8) {
            store.appSettings.borderRadius = defaultAppSettings.borderRadius;
          }

          return {
            state: store?.appSettings,
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
          hiddenMenuKeys: state.hiddenMenuKeys,
          displayMode: state.displayMode,
          ffmpegPath: state.ffmpegPath,
          themeMode: state.themeMode,
          pageTransition: state.pageTransition,
          appLaunchAnimation: state.appLaunchAnimation,
          appLaunchAnimationDuration: state.appLaunchAnimationDuration,
          appLaunchAnimationVideo: state.appLaunchAnimationVideo,
          showSearchHistory: state.showSearchHistory,
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
