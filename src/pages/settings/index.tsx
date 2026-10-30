import React, { useEffect, useState } from "react";
import { type Control, useForm } from "react-hook-form";

import { Divider, Tab, Tabs } from "@heroui/react";
import {
  RiFileTextLine,
  RiInformationLine,
  RiKeyboardLine,
  RiMenuLine,
  RiMusic2Line,
  RiPlugLine,
  RiSettings3Line,
} from "@remixicon/react";
import { useShallow } from "zustand/react/shallow";

import { t } from "@/common/i18n";
import { DEFAULT_GLASS_OPACITY } from "@/common/utils/glass";
import ScrollContainer from "@/components/scroll-container";
import { useSettings } from "@/store/settings";
import { normalizeLanguage } from "@shared/i18n";

import DesktopLyricsSettings from "./desktop-lyrics-settings";
import Developers from "./developers";
import MenuSettings from "./menu-settings";
import MusicSourceSettings from "./music-source-settings";
import NeteaseSettings from "./netease-settings";
import PluginSettings from "./plugin-settings";
import ShortcutSettingsPage from "./shortcut-settings";
import { SystemSettingsTab } from "./system-settings";
import UpdateSettings from "./update-settings";

const useSystemSettingsForm = () => {
  const [appVersion, setAppVersion] = useState<string>("");
  const {
    language,
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
    sourceMode,
    hiddenMenuKeys,
    displayMode,
    ffmpegPath,
    themeMode,
    appLaunchAnimation,
    appLaunchAnimationDuration,
    appLaunchAnimationVideo,
    playbarSpectrum,
    showSearchHistory,
    proxySettings,
    reportPlayHistory,
  } = useSettings(
    useShallow(s => ({
      language: normalizeLanguage(s.language),
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
      sourceMode: s.sourceMode ?? "mixed",
      hiddenMenuKeys: s.hiddenMenuKeys,
      displayMode: s.displayMode,
      ffmpegPath: s.ffmpegPath,
      themeMode: s.themeMode,
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
      language,
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
      sourceMode,
      hiddenMenuKeys,
      displayMode,
      ffmpegPath,
      themeMode,
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

/**
 * 音源页。
 *
 * Beta 9 把原来的「音源与模式」并进这一页 —— 它跟网易云账号本来就是一件事：
 * 选哪家当主角、要不要登录账号，用户是连着想的，分成两个 Tab 反而要来回跳。
 *
 * 代理设置则从 Tab 里撤掉、收进「常规设置」的折叠区：一年改不了一次的东西
 * 占着一个一级入口，是这份设置页挤成一排的直接原因。
 */
const SourceAndAccountSettings = ({ control }: { control: Control<AppSettings> }) => (
  <div className="space-y-8">
    <MusicSourceSettings control={control} />
    <Divider />
    <div>
      <h2>{t("网易云账号")}</h2>
      <p className="text-default-500 mt-1 text-sm leading-relaxed">
        {t("登录后才能看到「我喜欢的音乐」和你自己的歌单；只听哔哩哔哩的话可以不登录。")}
      </p>
      <div className="mt-4">
        <NeteaseSettings />
      </div>
    </div>
  </div>
);

/**
 * 设置页。
 *
 * 从 Beta 9 起改成**左侧竖向导航 + 右侧内容**：
 * 原来九个 Tab 横在一行，窗口稍微窄一点就开始横向滚动，最后两个永远点不到；
 * 竖排之后条目再多也只是往下延伸，滚轮一推就够着，也不会跟内容抢宽度。
 */
const SettingsPage = () => {
  const system = useSystemSettingsForm();

  const tabs: { key: string; label: string; icon: React.ReactNode; content: React.ReactNode }[] = [
    {
      key: "system",
      label: t("常规设置"),
      icon: <RiSettings3Line size={16} />,
      content: <SystemSettingsTab {...system} />,
    },
    {
      key: "source",
      label: t("音源与账号"),
      icon: <RiMusic2Line size={16} />,
      content: <SourceAndAccountSettings control={system.control} />,
    },
    {
      key: "lyrics",
      label: t("歌词设置"),
      icon: <RiFileTextLine size={16} />,
      content: <DesktopLyricsSettings />,
    },
    {
      key: "menu",
      label: t("菜单设置"),
      icon: <RiMenuLine size={16} />,
      content: <MenuSettings control={system.control} />,
    },
    {
      key: "shortcut",
      label: t("快捷键设置"),
      icon: <RiKeyboardLine size={16} />,
      content: <ShortcutSettingsPage />,
    },
    {
      key: "plugin",
      label: t("插件"),
      icon: <RiPlugLine size={16} />,
      content: <PluginSettings />,
    },
    {
      key: "update",
      label: t("关于与更新"),
      icon: <RiInformationLine size={16} />,
      content: <UpdateSettings appVersion={system.appVersion} />,
    },
  ];

  return (
    <ScrollContainer enableBackToTop className="h-full w-full">
      <div className="m-auto mb-6 max-w-[1040px] px-8 py-4">
        <h1 className="mb-6">{t("设置")}</h1>
        <Tabs
          isVertical
          aria-label={t("设置选项")}
          classNames={{
            // base 在纵向模式下是 flex-row：左边导航、右边面板
            base: "gap-8",
            // 导航吸顶：内容很长时（插件页尤其）也能随时换页
            tabList: "sticky top-0 h-fit w-[184px] flex-none items-stretch gap-1 p-1",
            tab: "h-9 justify-start px-3",
            panel: "min-w-0 flex-1 px-1 py-0",
            cursor: "rounded-medium",
          }}
        >
          {tabs.map(tab => (
            <Tab
              key={tab.key}
              title={
                <div className="flex items-center gap-2">
                  {tab.icon}
                  <span>{tab.label}</span>
                </div>
              }
            >
              {tab.content}
            </Tab>
          ))}
        </Tabs>
        {/* 署名放在 Tabs 外面，切到哪个 Tab 滑到底都能看到 */}
        <div className="mt-10">
          <Developers />
        </div>
      </div>
    </ScrollContainer>
  );
};

export default SettingsPage;
