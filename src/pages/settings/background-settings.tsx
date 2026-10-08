import React, { useEffect, useState } from "react";
import { Controller, type Control } from "react-hook-form";

import { addToast, Button, Slider, Switch } from "@heroui/react";
import { RiDeleteBinLine, RiImageAddLine } from "@remixicon/react";

import { MAX_BACKGROUND_BLUR, MAX_BACKGROUND_DIM, MIN_BACKGROUND_BLUR, MIN_BACKGROUND_DIM } from "@/common/utils/glass";

const platform = window.electron.getPlatform();

const Row = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => (
  <div className="flex w-full items-center justify-between">
    <div className="mr-6 space-y-1">
      <div className="text-medium font-medium">{title}</div>
      {desc && <div className="text-default-500 text-sm">{desc}</div>}
    </div>
    {children}
  </div>
);

const BackgroundSettings = ({ control }: { control: Control<AppSettings> }) => {
  return (
    <>
      <Controller
        control={control}
        name="backgroundImage"
        render={({ field }) => <ImagePicker value={field.value} onChange={field.onChange} />}
      />

      <Controller
        control={control}
        name="backgroundImageBlur"
        render={({ field }) => (
          <Row title="背景模糊" desc="给背景图加毛玻璃，面板压在上面更有层次">
            <div className="w-[360px]">
              <Slider
                showTooltip={false}
                size="sm"
                aria-label="背景模糊"
                endContent={<span className="tabular-nums">{field.value}px</span>}
                value={field.value}
                onChange={v => field.onChange(Number(v))}
                minValue={MIN_BACKGROUND_BLUR}
                maxValue={MAX_BACKGROUND_BLUR}
                step={1}
                classNames={{ thumb: "after:hidden", track: "rounded-full" }}
              />
            </div>
          </Row>
        )}
      />

      <Controller
        control={control}
        name="backgroundImageDim"
        render={({ field }) => (
          <Row title="背景压暗" desc="调暗背景图，保证文字和控件看得清">
            <div className="w-[360px]">
              <Slider
                showTooltip={false}
                size="sm"
                aria-label="背景压暗"
                endContent={<span className="tabular-nums">{Math.round(field.value * 100)}%</span>}
                value={field.value}
                onChange={v => field.onChange(Number(v))}
                minValue={MIN_BACKGROUND_DIM}
                maxValue={MAX_BACKGROUND_DIM}
                step={0.05}
                classNames={{ thumb: "after:hidden", track: "rounded-full" }}
              />
            </div>
          </Row>
        )}
      />

      <Controller
        control={control}
        name="windowTransparent"
        render={({ field }) => (
          <Row
            title="透明背景"
            desc={
              platform === "macos"
                ? "窗口不铺底色，桌面直接透过来（配合系统毛玻璃）；开启后会覆盖自定义背景图"
                : "窗口不铺底色，直接透出桌面；开启后会覆盖自定义背景图"
            }
          >
            <div className="flex w-[360px] justify-end">
              <Switch disableAnimation isSelected={field.value} onValueChange={field.onChange} />
            </div>
          </Row>
        )}
      />
    </>
  );
};

const ImagePicker = ({ value, onChange }: { value?: string; onChange: (path: string) => void }) => {
  const [previewUrl, setPreviewUrl] = useState("");

  // 打开设置页时把已保存的背景图读回来做预览
  useEffect(() => {
    let canceled = false;

    if (!value) {
      setPreviewUrl("");
      return;
    }

    window.electron
      .readBackgroundImage(value)
      .then(dataUrl => {
        if (!canceled) setPreviewUrl(dataUrl ?? "");
      })
      .catch(() => {
        if (!canceled) setPreviewUrl("");
      });

    return () => {
      canceled = true;
    };
  }, [value]);

  const handlePick = async () => {
    const result = await window.electron.pickBackgroundImage();
    if (!result) return;

    if (!result.dataUrl) {
      addToast({ title: "读取图片失败，请换一张（支持 png/jpg/webp/gif/bmp，且不超过 32MB）", color: "danger" });
      return;
    }

    setPreviewUrl(result.dataUrl);
    onChange(result.path);
  };

  const handleClear = () => {
    setPreviewUrl("");
    onChange("");
  };

  return (
    <Row title="自定义背景" desc="选一张本地图片作为应用背景">
      <div className="flex w-[360px] items-center justify-end space-x-2">
        {previewUrl ? (
          <div
            className="border-default-200 rounded-medium h-10 w-16 flex-none border bg-cover bg-center"
            style={{ backgroundImage: `url("${previewUrl}")` }}
            aria-label="当前背景图预览"
          />
        ) : (
          <div className="border-default-200 text-default-400 rounded-medium flex h-10 w-16 flex-none items-center justify-center border border-dashed">
            <RiImageAddLine size={18} />
          </div>
        )}
        <Button size="sm" variant="flat" startContent={<RiImageAddLine size={16} />} onPress={handlePick}>
          选择图片
        </Button>
        {Boolean(value) && (
          <Button
            size="sm"
            variant="flat"
            isIconOnly
            aria-label="清除背景图"
            className="hover:text-danger"
            onPress={handleClear}
          >
            <RiDeleteBinLine size={16} />
          </Button>
        )}
      </div>
    </Row>
  );
};

export default BackgroundSettings;
