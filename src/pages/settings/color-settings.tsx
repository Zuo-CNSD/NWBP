import React from "react";
import { Controller, type Control } from "react-hook-form";

import { Card, CardBody, CardFooter } from "@heroui/react";

import { Themes } from "@/common/constants/theme";
import { isHex } from "@/common/utils/color";
import ColorPicker from "@/components/color-picker";
import { useTheme } from "@/components/theme/use-theme";

const ColorItem = ({
  label,
  value,
  onChange,
  presets,
}: {
  label: string;
  value?: string;
  onChange: (hex: string) => void;
  presets?: string[];
}) => {
  return (
    <ColorPicker value={value} onChange={onChange} presets={presets}>
      <Card as="div" isPressable radius="md" shadow="sm" className="border-default w-[100px] overflow-hidden border">
        {/*
          色块做成四角都圆的小片（原来是 rounded-t-medium，下面两角是方的）。
          内缩 6px 让圆角看得见，否则贴着卡片边缘会被卡片自己的圆角吃掉。
        */}
        <CardBody
          className="rounded-medium mx-1.5 mt-1.5 h-[40px] items-center p-0"
          style={{ backgroundColor: value || presets?.[0] }}
        />
        <CardFooter className="justify-center p-2 text-xs">
          <b>{label}</b>
        </CardFooter>
      </Card>
    </ColorPicker>
  );
};

const ColorSettings = ({ control }: { control: Control<AppSettings> }) => {
  const { theme } = useTheme();

  return (
    <div className="flex w-full justify-end gap-3">
      <Controller
        control={control}
        name="backgroundColor"
        render={({ field }) => {
          const backgroundColor = Themes[theme].colors!.background as string;
          const pickerValue = isHex(field.value) ? field.value : backgroundColor;
          return (
            <ColorItem label="背景" value={pickerValue} onChange={v => field.onChange(v)} presets={[backgroundColor]} />
          );
        }}
      />
      <Controller
        control={control}
        name="primaryColor"
        render={({ field }) => {
          const primaryColor = Themes[theme].colors!.primary as string;
          const pickerValue = isHex(field.value) ? field.value : primaryColor;
          return (
            <ColorItem label="主色" value={pickerValue} onChange={v => field.onChange(v)} presets={[primaryColor]} />
          );
        }}
      />
    </div>
  );
};

export default ColorSettings;
