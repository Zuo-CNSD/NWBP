import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { Tab, Tabs } from "@heroui/react";
import { useShallow } from "zustand/react/shallow";

import { DEFAULT_GLASS_OPACITY } from "@/common/utils/glass";
import ScrollContainer from "@/components/scroll-container";
import { useSettings } from "@/store/settings";

import DesktopLyricsSettings from "./desktop-lyrics-settings";
import Developers from "./developers";
import MenuSettings from "./menu-settings";
import NeteaseSettings from "./netease-settings";
import ProxySettings from "./proxy-settings";
import ShortcutSettingsPage from "./shortcut-settings";
import { SystemSettingsTab } from "./system-settings";

const useSystemSettingsForm = () => {
  const [appVersion, setAppVersion] = useState<string>("");
  const {
    fontFamily,
    primaryColor,
    backgroundColor,
    borderRadius,
    liquidGlass,
    glassOpacity,
    backgroundImage,
    backgroundImageBlur,
    backgroundImageDim,
    windowTransparent,
    downloadPath,
    closeWindowOption,
    autoStart,
    audioQuality,
    musicSource,
    hiddenMenuKeys,
    displayMode,
    ffmpegPath,
    themeMode,
    pageTransition,
    appLaunchAnimation,
    appLaunchAnimationDuration,
    appLaunchAnimationVideo,
    playbarSpectrum,
    showSearchHistory,
    proxySettings,
    reportPlayHistory,
  } = useSettings(
    useShallow(s => ({
      fontFamily: s.fontFamily,
      primaryColor: s.primaryColor,
      backgroundColor: s.backgroundColor,
      borderRadius: s.borderRadius,
      liquidGlass: s.liquidGlass ?? true,
      glassOpacity: s.glassOpacity ?? DEFAULT_GLASS_OPACITY,
      backgroundImage: s.backgroundImage ?? "",
      backgroundImageBlur: s.backgroundImageBlur ?? 0,
      backgroundImageDim: s.backgroundImageDim ?? 0.25,
      windowTransparent: s.windowTransparent ?? false,
      downloadPath: s.downloadPath,
      closeWindowOption: s.closeWindowOption,
      autoStart: s.autoStart,
      audioQuality: s.audioQuality,
      musicSource: s.musicSource,
      hiddenMenuKeys: s.hiddenMenuKeys,
      displayMode: s.displayMode,
      ffmpegPath: s.ffmpegPath,
      themeMode: s.themeMode,
      pageTransition: s.pageTransition,
      appLaunchAnimation: s.appLaunchAnimation,
      appLaunchAnimationDuration: s.appLaunchAnimationDuration,
      appLaunchAnimationVideo: s.appLaunchAnimationVideo,
      playbarSpectrum: s.playbarSpectrum,
      showSearchHistory: s.showSearchHistory,
      proxySettings: s.proxySettings,
      reportPlayHistory: s.reportPlayHistory,
    })),
  );
  const updateSettings = useSettings(s => s.update);

  const { control, watch, setValue } = useForm<AppSettings>({
    defaultValues: {
      fontFamily,
      primaryColor,
      backgroundColor,
      borderRadius,
      liquidGlass,
      glassOpacity,
      backgroundImage,
      backgroundImageBlur,
      backgroundImageDim,
      windowTransparent,
      downloadPath,
      closeWindowOption,
      autoStart,
      audioQuality,
      musicSource,
      hiddenMenuKeys,
      displayMode,
      ffmpegPath,
      themeMode,
      pageTransition,
      appLaunchAnimation,
      appLaunchAnimationDuration,
      appLaunchAnimationVideo,
      playbarSpectrum,
      showSearchHistory,
      proxySettings: proxySettings ?? {
        type: "none",
        host: "",
        port: undefined,
        username: "",
        password: "",
      },
      reportPlayHistory,
    },
  });

  useEffect(() => {
    const subscription = watch((values, { name }) => {
      if (!name) return;
      const patch = { [name]: (values as any)[name] } as Partial<AppSettings>;
      updateSettings(patch);
      if (name === "proxySettings" && values.proxySettings && window.electron?.setProxySettings) {
        window.electron.setProxySettings(values.proxySettings as ProxySettings);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, updateSettings]);

  useEffect(() => {
    window.electron.getAppVersion().then(v => setAppVersion(v));
  }, []);

  return {
    appVersion,
    audioQuality,
    control,
    setValue,
  };
};

const SettingsPage = () => {
  const system = useSystemSettingsForm();

  return (
    <ScrollContainer enableBackToTop className="h-full w-full">
      <div className="m-auto mb-6 max-w-[900px] px-8 py-4">
        <div className="space-y-6">
          <h1>设置</h1>
          <Tabs aria-label="设置选项" classNames={{ panel: "px-1 py-0", cursor: "rounded-medium" }}>
            <Tab key="system" title="常规设置">
              <SystemSettingsTab {...system} />
            </Tab>
            <Tab key="lyrics" title="歌词设置">
              <DesktopLyricsSettings />
            </Tab>
            <Tab key="netease" title="网易云音乐">
              <NeteaseSettings />
            </Tab>
            <Tab key="menu" title="菜单设置">
              <MenuSettings control={system.control} />
            </Tab>
            <Tab key="shortcut" title="快捷键设置">
              <ShortcutSettingsPage />
            </Tab>
            <Tab key="proxy" title="代理设置">
              <ProxySettings control={system.control} />
            </Tab>
          </Tabs>
          {/* 署名放在 Tabs 外面，切到哪个 Tab 滑到底都能看到 */}
          <Developers />
        </div>
      </div>
    </ScrollContainer>
  );
};

export default SettingsPage;
