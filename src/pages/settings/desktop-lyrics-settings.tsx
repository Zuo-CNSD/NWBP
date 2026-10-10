import { useEffect, useMemo, useState } from "react";

import { Switch, Slider, Button, Tab, Tabs } from "@heroui/react";
import { useShallow } from "zustand/react/shallow";

import { createThrottledPush } from "@/common/utils/throttled-push";
import ColorPicker from "@/components/color-picker";
import { useSettings } from "@/store/settings";

/**
 * 桌面歌词设置。
 *
 * 两件事要分清楚：
 *  - 这些值存在应用设置里，改完自动落盘，下次启动按它恢复；
 *  - 但**开窗/关窗是主进程的事**，所以要额外调一次 `desktopLyrics.setEnabled`，
 *    只改设置是不会弹窗的。
 */
const MIN_FONT_SIZE = 16;
const MAX_FONT_SIZE = 72;

const DesktopLyricsSettings = () => {
  const {
    enabled,
    fontSize,
    color,
    backgroundMode,
    backgroundOpacity,
    backgroundColor,
    backgroundImage,
    backgroundImageBlur,
    textOpacity,
    showTranslation,
    showRomanization,
    spectrum,
    locked,
  } = useSettings(
    useShallow(s => ({
      enabled: s.desktopLyrics,
      fontSize: s.desktopLyricsFontSize,
      color: s.desktopLyricsColor,
      backgroundMode: s.desktopLyricsBackgroundMode,
      backgroundOpacity: s.desktopLyricsBackgroundOpacity,
      backgroundColor: s.desktopLyricsBackgroundColor,
      backgroundImage: s.desktopLyricsBackgroundImage,
      backgroundImageBlur: s.desktopLyricsBackgroundImageBlur,
      textOpacity: s.desktopLyricsTextOpacity,
      showTranslation: s.desktopLyricsShowTranslation,
      showRomanization: s.desktopLyricsShowRomanization,
      spectrum: s.desktopLyricsSpectrum,
      locked: s.desktopLyricsLocked,
    })),
  );
  const update = useSettings(s => s.update);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  /*
   * 设置 store 是从主进程异步读回来的，水合完成前各个字段还是默认值。
   * 这时候如果就去调 IPC，会把「默认值」当成用户的意图写回去 ——
   * 最典型的后果是桌面歌词开着的时候进一次设置页，`desktopLyrics` 还是默认的 false，
   * 直接把歌词窗给关了。所以水合完成前不发任何指令。
   */
  const [hydrated, setHydrated] = useState(() => useSettings.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    return useSettings.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  // 开/关窗口：只改设置不会弹窗，得让主进程动手
  useEffect(() => {
    if (!hydrated) return;
    void window.electron?.desktopLyrics?.setEnabled?.(enabled);
  }, [enabled, hydrated]);

  // 锁定状态要同步到窗口（锁定 = 鼠标穿透）
  useEffect(() => {
    if (!hydrated) return;
    void window.electron?.desktopLyrics?.setLocked?.(locked);
  }, [locked, hydrated]);

  // 样式即时推给已经开着的桌面歌词窗
  /*
   * 拖动滑块时 onChange 每帧都会触发，不必每帧都走一趟 IPC —— 合并到 60ms 一次
   * 依旧跟手，还能把主进程侧的写设置 / 广播次数压下一个量级（末次会被补发）。
   */
  const pushStyle = useMemo(
    () =>
      createThrottledPush<DesktopLyricsStyle>(
        payload => void window.electron?.desktopLyrics?.notifyStyleChanged?.(payload),
        60,
      ),
    [],
  );

  useEffect(() => {
    if (!hydrated) return;

    pushStyle.send({
      fontSize,
      color,
      backgroundMode,
      backgroundOpacity,
      backgroundColor,
      backgroundImage,
      backgroundImageBlur,
      textOpacity,
      showTranslation,
      showRomanization,
      spectrum,
      enabled,
      locked,
    });
  }, [
    fontSize,
    color,
    backgroundMode,
    backgroundOpacity,
    backgroundColor,
    backgroundImage,
    backgroundImageBlur,
    textOpacity,
    showTranslation,
    showRomanization,
    spectrum,
    enabled,
    locked,
    hydrated,
    pushStyle,
  ]);

  // 卸载时把还没到点发出去的最后一次补上，否则「拖到一半切走页面」会丢掉末尾的值
  useEffect(() => () => pushStyle.flush(), [pushStyle]);

  /**
   * 切底板模式。
   * 从「透明」切到纯色/背景图时，如果当前不透明度是 0 就顺手提到 85 ——
   * 否则用户切过去了却什么都看不见，会以为功能坏了。
   */
  const handleBackgroundModeChange = (mode: DesktopLyricsBackgroundMode) => {
    const patch: Partial<AppSettings> = { desktopLyricsBackgroundMode: mode };
    if (mode !== "transparent" && backgroundOpacity === 0) patch.desktopLyricsBackgroundOpacity = 85;
    update(patch);
  };

  const handlePickBackgroundImage = async () => {
    const result = await window.electron?.pickBackgroundImage?.();
    if (!result?.path) return;
    update({
      desktopLyricsBackgroundImage: result.path,
      desktopLyricsBackgroundMode: "image",
      ...(backgroundOpacity === 0 ? { desktopLyricsBackgroundOpacity: 85 } : {}),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-medium mr-6">桌面歌词</div>
        <Switch isSelected={enabled} onValueChange={value => update({ desktopLyrics: value })} />
      </div>

      {enabled && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-medium mr-6">文字颜色</div>
            <ColorPicker
              value={color}
              onChange={hex => update({ desktopLyricsColor: hex })}
              isOpen={colorPickerOpen}
              onOpenChange={setColorPickerOpen}
            >
              <div className="border-default h-8 w-12 rounded-full border" style={{ backgroundColor: color }} />
            </ColorPicker>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-medium mr-6">字号</div>
            <div className="flex w-[260px] items-center gap-3">
              <Slider
                aria-label="桌面歌词字号"
                minValue={MIN_FONT_SIZE}
                maxValue={MAX_FONT_SIZE}
                step={1}
                value={fontSize}
                onChange={value => update({ desktopLyricsFontSize: value as number })}
                className="flex-1"
              />
              <span className="text-default-500 w-12 text-right text-sm">{fontSize}px</span>
            </div>
          </div>

          {/* ---- 底板：三选一 ---- */}
          <div className="flex items-center justify-between">
            <div className="mr-6">
              <div className="text-medium">歌词底板</div>
              <div className="text-default-500 mt-0.5 text-xs">歌词后面那块底。「透明」= 只有字，不带任何底板</div>
            </div>
            <Tabs
              aria-label="桌面歌词底板模式"
              size="sm"
              selectedKey={backgroundMode}
              onSelectionChange={key => handleBackgroundModeChange(key as DesktopLyricsBackgroundMode)}
              classNames={{ cursor: "rounded-medium" }}
            >
              <Tab key="transparent" title="透明" />
              <Tab key="color" title="纯色" />
              <Tab key="image" title="自定义背景" />
            </Tabs>
          </div>

          {backgroundMode === "color" && (
            <div className="flex items-center justify-between">
              <div className="text-medium mr-6">底板颜色</div>
              <ColorPicker
                value={backgroundColor}
                onChange={hex => update({ desktopLyricsBackgroundColor: hex })}
                isOpen={colorPickerOpen}
                onOpenChange={setColorPickerOpen}
              >
                <div className="border-default h-8 w-12 rounded-full border" style={{ backgroundColor }} />
              </ColorPicker>
            </div>
          )}

          {backgroundMode === "image" && (
            <>
              <div className="flex items-center justify-between">
                <div className="mr-6 min-w-0">
                  <div className="text-medium">背景图片</div>
                  <div className="text-default-500 mt-0.5 max-w-[420px] truncate text-xs">
                    {backgroundImage || "还没选图片"}
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <Button size="sm" variant="flat" onPress={() => void handlePickBackgroundImage()}>
                    选择图片
                  </Button>
                  {Boolean(backgroundImage) && (
                    <Button
                      size="sm"
                      variant="light"
                      color="danger"
                      onPress={() => update({ desktopLyricsBackgroundImage: "" })}
                    >
                      清除
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="mr-6">
                  <div className="text-medium">背景模糊</div>
                  <div className="text-default-500 mt-0.5 text-xs">糊一点，歌词压在上面更好读</div>
                </div>
                <div className="flex w-[260px] items-center gap-3">
                  <Slider
                    aria-label="桌面歌词背景模糊"
                    minValue={0}
                    maxValue={40}
                    step={1}
                    value={backgroundImageBlur}
                    onChange={value => update({ desktopLyricsBackgroundImageBlur: value as number })}
                    className="flex-1"
                  />
                  <span className="text-default-500 w-12 text-right text-sm">{backgroundImageBlur}px</span>
                </div>
              </div>
            </>
          )}

          {backgroundMode !== "transparent" && (
            <div className="flex items-center justify-between">
              <div className="mr-6">
                <div className="text-medium">底板不透明度</div>
                <div className="text-default-500 mt-0.5 text-xs">0% 等于透明底板（和上面的「透明」模式效果一样）</div>
              </div>
              <div className="flex w-[260px] items-center gap-3">
                <Slider
                  aria-label="桌面歌词底板不透明度"
                  minValue={0}
                  maxValue={100}
                  step={1}
                  value={backgroundOpacity}
                  onChange={value => update({ desktopLyricsBackgroundOpacity: value as number })}
                  className="flex-1"
                />
                <span className="text-default-500 w-12 text-right text-sm">{backgroundOpacity}%</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="mr-6">
              <div className="text-medium">歌词文字</div>
              <div className="text-default-500 mt-0.5 text-xs">只影响歌词文字本身，和底板互不影响</div>
            </div>
            <div className="flex w-[260px] items-center gap-3">
              <Slider
                aria-label="桌面歌词文字透明度"
                minValue={0}
                maxValue={100}
                step={1}
                value={textOpacity}
                onChange={value => update({ desktopLyricsTextOpacity: value as number })}
                className="flex-1"
              />
              <span className="text-default-500 w-12 text-right text-sm">{textOpacity}%</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-medium mr-6">显示翻译</div>
            <Switch
              isSelected={showTranslation}
              onValueChange={value => update({ desktopLyricsShowTranslation: value })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-medium mr-6">显示罗马音</div>
            <Switch
              isSelected={showRomanization}
              onValueChange={value => update({ desktopLyricsShowRomanization: value })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="mr-6">
              <div className="text-medium">显示频谱条</div>
              <div className="text-default-500 mt-0.5 text-xs">
                在歌词上方加一条实时频谱，颜色跟随歌词文字。音频在主窗口分析后推给歌词窗
              </div>
            </div>
            <Switch isSelected={spectrum} onValueChange={value => update({ desktopLyricsSpectrum: value })} />
          </div>

          <div className="flex items-center justify-between">
            <div className="mr-6">
              <div className="text-medium">锁定（鼠标穿透）</div>
              <div className="text-default-500 mt-0.5 text-xs">
                锁定后整条歌词都不吃鼠标事件，不会挡住下面的操作。默认关闭 ——
                锁定状态下拖不动歌词，所以想挪位置时记得先解锁
              </div>
            </div>
            <Switch isSelected={locked} onValueChange={value => update({ desktopLyricsLocked: value })} />
          </div>

          <div className="text-default-500 space-y-1 text-xs">
            <div>· 拖动歌词任意位置即可移动，拖窗口边缘可改大小，位置会自动记住</div>
            <div>
              · 在歌词上点右键会弹出菜单：锁定、底板（透明 / 纯色 / 自定义背景）、字号、颜色、文字不透明度、翻译 /
              罗马音、重置位置、关闭
            </div>
            <div>· 按住 Ctrl / ⌘ 滚动滚轮也能直接改字号</div>
            <div>· 鼠标移到歌词右上角会出现锁定 / 关闭按钮</div>
          </div>
        </>
      )}
    </div>
  );
};

export default DesktopLyricsSettings;
