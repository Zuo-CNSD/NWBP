import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Switch, RadioGroup, Radio } from "@heroui/react";
import { useShallow } from "zustand/shallow";

import { isHex } from "@/common/utils/color";
import ColorPicker from "@/components/color-picker";
import { useBackgroundImage } from "@/store/background-image";
import {
  resolveBackgroundMode,
  resolveLyricsPositionH,
  resolveLyricsPositionV,
  useFullScreenPlayerSettings,
} from "@/store/full-screen-player-settings";
import { usePlayList } from "@/store/play-list";

const FullScreenPlayerSettingsPanel = ({ isUiVisible = true }: { isUiVisible?: boolean }) => {
  const { playId, list } = usePlayList(
    useShallow(state => ({
      playId: state.playId,
      list: state.list,
    })),
  );
  const playItem = list.find(item => item.id === playId);
  const isLocal = playItem?.source === "local";
  const {
    showLyrics,
    showSpectrum,
    showCover,
    backgroundMode,
    lyricsPositionH,
    lyricsPositionV,
    backgroundColor,
    spectrumColor,
    lyricsColor,
    update,
  } = useFullScreenPlayerSettings(
    useShallow(s => ({
      showLyrics: s.showLyrics,
      showSpectrum: s.showSpectrum,
      showCover: s.showCover,
      backgroundMode: resolveBackgroundMode(s),
      lyricsPositionH: resolveLyricsPositionH(s),
      lyricsPositionV: resolveLyricsPositionV(s),
      backgroundColor: s.backgroundColor,
      spectrumColor: s.spectrumColor,
      lyricsColor: s.lyricsColor,
      update: s.update,
    })),
  );

  const customBackgroundUrl = useBackgroundImage(s => s.url);

  const { control, setValue } = useForm({
    defaultValues: {
      showLyrics,
      showSpectrum,
      showCover,
      backgroundMode,
      lyricsPositionH,
      lyricsPositionV,
      backgroundColor,
      spectrumColor,
      lyricsColor,
    },
    mode: "onChange",
  });

  const [lyricsPickerOpen, setLyricsPickerOpen] = useState(false);
  const [spectrumPickerOpen, setSpectrumPickerOpen] = useState(false);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);

  useEffect(() => {
    if (!isUiVisible) {
      setLyricsPickerOpen(false);
      setSpectrumPickerOpen(false);
      setBackgroundPickerOpen(false);
    }
  }, [isUiVisible]);

  useEffect(() => {
    setValue("showLyrics", showLyrics);
    setValue("showSpectrum", showSpectrum);
    setValue("showCover", showCover);
    setValue("backgroundMode", backgroundMode);
    setValue("lyricsPositionH", lyricsPositionH);
    setValue("lyricsPositionV", lyricsPositionV);
    setValue("backgroundColor", backgroundColor);
    setValue("spectrumColor", spectrumColor);
    setValue("lyricsColor", lyricsColor);
  }, [
    setValue,
    showLyrics,
    showSpectrum,
    showCover,
    backgroundMode,
    lyricsPositionH,
    lyricsPositionV,
    backgroundColor,
    spectrumColor,
    lyricsColor,
  ]);

  const values = useWatch({ control });

  useEffect(() => {
    if (!values || typeof values !== "object") return;
    update({
      showLyrics: values.showLyrics,
      showSpectrum: values.showSpectrum,
      showCover: values.showCover,
      backgroundMode: values.backgroundMode,
      lyricsPositionH: values.lyricsPositionH,
      lyricsPositionV: values.lyricsPositionV,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    values?.showLyrics,
    values?.showSpectrum,
    values?.showCover,
    values?.backgroundMode,
    values?.lyricsPositionH,
    values?.lyricsPositionV,
    update,
  ]);

  useEffect(() => {
    if (!values || typeof values !== "object") return;
    const sanitizeLyricsColor = (v?: string) => (isHex(v) ? v! : "#ffffff");
    const sanitizeSpectrumColor = (v?: string) => (v === "currentColor" || isHex(v) ? v! : "currentColor");
    const sanitizeBackgroundColor = (v?: string) => (isHex(v) ? v! : "#ffffff");
    const id = window.setTimeout(() => {
      update({
        spectrumColor: sanitizeSpectrumColor(values.spectrumColor),
        lyricsColor: sanitizeLyricsColor(values.lyricsColor),
        backgroundColor: sanitizeBackgroundColor(values.backgroundColor),
      });
    }, 200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values?.spectrumColor, values?.lyricsColor, values?.backgroundColor, update]);

  return (
    <div className="min-w-[320px] space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-medium mr-6">显示歌词</div>
        <Controller
          control={control}
          name="showLyrics"
          render={({ field }) => <Switch isSelected={field.value} onValueChange={field.onChange} />}
        />
      </div>
      {values?.showLyrics && (
        <div className="flex items-center justify-between">
          <div className="text-medium mr-6">歌词字体颜色</div>
          <Controller
            control={control}
            name="lyricsColor"
            render={({ field }) => {
              const v = field.value;
              const pickerValue = isHex(v) ? v : "#ffffff";
              return (
                <ColorPicker
                  value={pickerValue}
                  onChange={hex => field.onChange(hex)}
                  isOpen={lyricsPickerOpen && isUiVisible}
                  onOpenChange={setLyricsPickerOpen}
                >
                  <div
                    className="border-default h-8 w-12 rounded-full border"
                    style={{ backgroundColor: field.value || undefined }}
                  />
                </ColorPicker>
              );
            }}
          />
        </div>
      )}

      {values?.showLyrics && (
        <div className="flex items-center justify-between">
          <div className="text-medium mr-6">歌词横向</div>
          <Controller
            control={control}
            name="lyricsPositionH"
            render={({ field }) => (
              <RadioGroup
                orientation="horizontal"
                size="sm"
                aria-label="歌词横向位置"
                value={field.value}
                onValueChange={field.onChange}
              >
                <Radio value="left">靠左</Radio>
                <Radio value="center">居中</Radio>
                <Radio value="right">靠右</Radio>
              </RadioGroup>
            )}
          />
        </div>
      )}

      {values?.showLyrics && values?.lyricsPositionH === "center" && values?.showCover && (
        <div className="text-default-500 text-right text-xs">歌词居中时铺满整屏，「显示封面」会暂时不占位</div>
      )}

      {values?.showLyrics && (
        <div className="flex items-center justify-between">
          <div className="text-medium mr-6">歌词纵向</div>
          <Controller
            control={control}
            name="lyricsPositionV"
            render={({ field }) => (
              <RadioGroup
                orientation="horizontal"
                size="sm"
                aria-label="歌词纵向位置"
                value={field.value}
                onValueChange={field.onChange}
              >
                <Radio value="top">靠上</Radio>
                <Radio value="center">居中</Radio>
                <Radio value="bottom">靠下</Radio>
              </RadioGroup>
            )}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-medium mr-6">显示频谱图</div>
        <Controller
          control={control}
          name="showSpectrum"
          render={({ field }) => <Switch isSelected={field.value} onValueChange={field.onChange} />}
        />
      </div>
      {values?.showSpectrum && (
        <div className="flex items-center justify-between">
          <div className="text-medium mr-6">频谱图颜色</div>
          <Controller
            control={control}
            name="spectrumColor"
            render={({ field }) => {
              const v = field.value;
              const pickerValue = isHex(v) ? v : "#ffffff";
              return (
                <ColorPicker
                  value={pickerValue}
                  onChange={hex => field.onChange(hex)}
                  isOpen={spectrumPickerOpen && isUiVisible}
                  onOpenChange={setSpectrumPickerOpen}
                >
                  <div
                    className="border-default h-8 w-12 rounded-full border"
                    style={{ backgroundColor: isHex(v) ? v : undefined }}
                  />
                </ColorPicker>
              );
            }}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-medium mr-6">显示封面</div>
        <Controller
          control={control}
          name="showCover"
          render={({ field }) => (
            <Switch isSelected={field.value} onValueChange={field.onChange} isDisabled={isLocal} />
          )}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-medium mr-6">背景</div>
        <Controller
          control={control}
          name="backgroundMode"
          render={({ field }) => (
            <RadioGroup
              orientation="horizontal"
              size="sm"
              value={field.value}
              onValueChange={field.onChange}
              aria-label="全屏播放器背景"
            >
              <Radio value="blur">虚化封面</Radio>
              <Radio value="custom" isDisabled={!customBackgroundUrl}>
                自定义背景
              </Radio>
              <Radio value="color">纯色</Radio>
            </RadioGroup>
          )}
        />
      </div>
      {values?.backgroundMode === "custom" && !customBackgroundUrl && (
        <div className="text-default-500 text-right text-xs">
          还没有设置自定义背景图，去「设置 → 常规设置 → 背景」里选一张
        </div>
      )}
      {values?.backgroundMode === "color" && (
        <div className="flex items-center justify-between">
          <div className="text-medium mr-6">背景颜色</div>
          <Controller
            control={control}
            name="backgroundColor"
            render={({ field }) => {
              return (
                <ColorPicker
                  value={field.value}
                  onChange={hex => field.onChange(hex)}
                  isOpen={backgroundPickerOpen && isUiVisible}
                  onOpenChange={setBackgroundPickerOpen}
                >
                  <div
                    className="border-default h-8 w-12 rounded-full border"
                    style={{ backgroundColor: field.value }}
                  />
                </ColorPicker>
              );
            }}
          />
        </div>
      )}
      {values?.backgroundMode === "custom" && customBackgroundUrl && (
        <div className="text-default-500 text-right text-xs">
          背景图的模糊与压暗跟随「设置 → 常规设置 → 背景」里的参数
        </div>
      )}
    </div>
  );
};

export default FullScreenPlayerSettingsPanel;
