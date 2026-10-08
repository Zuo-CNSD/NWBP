import { useEffect, useMemo, useState } from "react";

import { readableColor } from "color2k";
import { useShallow } from "zustand/react/shallow";

import { Themes } from "@/common/constants/theme";
import { hexToHsl, resolveTheme, isHex } from "@/common/utils/color";
import { applyGlassTheme, DEFAULT_GLASS_OPACITY } from "@/common/utils/glass";
import { applyRadiusScale } from "@/common/utils/radius";
import { useBackgroundImage } from "@/store/background-image";
import { useSettings } from "@/store/settings";

import { ThemeNameContext } from "./use-theme";

interface Props {
  children: React.ReactNode;
}

const Theme = ({ children }: Props) => {
  const {
    themeMode,
    fontFamily,
    primaryColor,
    borderRadius,
    backgroundColor,
    liquidGlass,
    glassOpacity,
    backgroundImage,
    backgroundImageBlur,
    backgroundImageDim,
    windowTransparent,
  } = useSettings(
    useShallow(s => ({
      themeMode: s.themeMode,
      fontFamily: s.fontFamily,
      primaryColor: s.primaryColor,
      borderRadius: s.borderRadius,
      backgroundColor: s.backgroundColor,
      liquidGlass: s.liquidGlass,
      glassOpacity: s.glassOpacity ?? DEFAULT_GLASS_OPACITY,
      backgroundImage: s.backgroundImage,
      backgroundImageBlur: s.backgroundImageBlur,
      backgroundImageDim: s.backgroundImageDim,
      windowTransparent: s.windowTransparent,
    })),
  );

  const [systemTheme, setSystemTheme] = useState<"light" | "dark" | undefined>(undefined);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState("");
  const [isFullScreen, setIsFullScreen] = useState(false);

  // 当 themeMode 为 system 时，监听系统主题变化并更新本地 systemTheme
  useEffect(() => {
    if (themeMode !== "system") {
      return;
    }

    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setSystemTheme(undefined);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = (matches: boolean) => {
      setSystemTheme(matches ? "dark" : "light");
    };

    applyTheme(mediaQuery.matches);

    const mediaQueryHandler = (event: MediaQueryListEvent) => {
      applyTheme(event.matches);
    };

    mediaQuery.addEventListener("change", mediaQueryHandler);

    return () => {
      mediaQuery.removeEventListener("change", mediaQueryHandler);
    };
  }, [themeMode]);

  // 将主题相关样式应用到 :root 和 body，确保挂载在 body 上的组件可读取到
  useEffect(() => {
    const root = document.documentElement;
    const themeName = resolveTheme(themeMode, systemTheme);

    root.classList.remove("light", "dark");
    root.classList.add(themeName);
    root.style.colorScheme = themeName;

    const rootStyle = root.style;
    const _primaryColor = isHex(primaryColor) ? primaryColor : (Themes[themeName].colors?.primary as string);
    const _backgroundColor = isHex(backgroundColor)
      ? backgroundColor
      : (Themes[themeName].colors?.background as string);

    if (_primaryColor) {
      rootStyle.setProperty("--heroui-primary", hexToHsl(_primaryColor));
    }
    if (_backgroundColor) {
      rootStyle.setProperty("--heroui-background", hexToHsl(_backgroundColor));
      const fgHex = readableColor(_backgroundColor);
      rootStyle.setProperty("--heroui-foreground", hexToHsl(fgHex));
    }
    // 一次性同步 HeroUI 的三档圆角，避免只有 medium 档位跟随设置变化
    applyRadiusScale(rootStyle, borderRadius);

    // 液态玻璃：接管面板色变量 + 输出壁纸色带（色带通过 CSS 变量提供给 .glass-wallpaper）
    applyGlassTheme(rootStyle, {
      enabled: liquidGlass,
      isDark: themeName === "dark",
      primaryColor: _primaryColor || primaryColor,
      glassOpacity,
    });

    // 窗口背景透明：交给 CSS 决定哪些层留白，同时同步 macOS 的系统毛玻璃
    root.classList.toggle("window-transparent", windowTransparent);
    window.electron?.setWindowTransparent?.(windowTransparent);
    root.classList.toggle("window-fullscreen", isFullScreen);

    const validFontFamily = fontFamily === "system-default" ? "system-ui" : fontFamily;
    rootStyle.fontFamily = validFontFamily || rootStyle.fontFamily;
  }, [
    fontFamily,
    primaryColor,
    borderRadius,
    themeMode,
    systemTheme,
    backgroundColor,
    liquidGlass,
    glassOpacity,
    windowTransparent,
    isFullScreen,
  ]);

  // 按路径读回已保存的背景图（存的是路径，图片本身不进设置，避免设置文件膨胀）
  useEffect(() => {
    let canceled = false;

    if (!backgroundImage) {
      setBackgroundImageUrl("");
      useBackgroundImage.getState().setUrl("");
      return;
    }

    window.electron
      .readBackgroundImage(backgroundImage)
      .then(dataUrl => {
        if (canceled) return;
        setBackgroundImageUrl(dataUrl ?? "");
        // 共享给全屏播放器等组件，避免它们各自再读一遍文件
        useBackgroundImage.getState().setUrl(dataUrl ?? "");
      })
      .catch(() => {
        if (canceled) return;
        setBackgroundImageUrl("");
        useBackgroundImage.getState().setUrl("");
      });

    return () => {
      canceled = true;
    };
  }, [backgroundImage]);

  // 全屏时把窗口圆角收掉，否则四角会露出桌面
  useEffect(() => {
    window.electron
      ?.isFullScreen?.()
      .then(value => setIsFullScreen(value))
      .catch(() => undefined);

    return window.electron?.onWindowFullScreenChange?.(setIsFullScreen);
  }, []);

  /*
   * 滚动期间给 html 挂一个 is-scrolling 类，用来暂停底衬的漂移动画。
   * 底衬在持续做 transform 动画时，所有磨砂层每帧都要重新采样它，
   * 滚动时再叠加一次重绘就容易抖（滚动时玻璃闪烁）。
   * 用 capture 监听：scroll 事件不冒泡，但捕获阶段能拿到内部滚动容器的事件。
   */
  useEffect(() => {
    const root = document.documentElement;
    let timer: number | undefined;

    const handleScroll = () => {
      root.classList.add("is-scrolling");
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        root.classList.remove("is-scrolling");
        timer = undefined;
      }, 180);
    };

    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
      if (timer) window.clearTimeout(timer);
      root.classList.remove("is-scrolling");
    };
  }, []);

  const contextValue = useMemo(() => ({ theme: resolveTheme(themeMode, systemTheme) }), [themeMode, systemTheme]);

  /*
   * 底衬的优先级：透明背景 > 自定义图片 > 自定义纯色 > 自动彩色渐变
   * 「透明背景」下什么都不铺，直接透出桌面。
   */
  const hasCustomColor = isHex(backgroundColor);
  const showImageBackdrop = Boolean(backgroundImageUrl) && !windowTransparent;
  const showGradientBackdrop = liquidGlass && !showImageBackdrop && !hasCustomColor && !windowTransparent;

  return (
    <main className="app-shell relative isolate h-screen w-screen overflow-hidden">
      {/* 液态玻璃的彩色流动底衬，玻璃面板靠它产生折射感 */}
      {showGradientBackdrop && <div aria-hidden className="glass-wallpaper" />}
      {showImageBackdrop && (
        <div
          aria-hidden
          className="glass-image"
          style={
            {
              backgroundImage: `url("${backgroundImageUrl}")`,
              "--background-blur": `${backgroundImageBlur}px`,
              "--background-dim": `${backgroundImageDim}`,
            } as React.CSSProperties
          }
        />
      )}
      <ThemeNameContext value={contextValue}>{children}</ThemeNameContext>
    </main>
  );
};

export default Theme;
