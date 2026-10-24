import React from "react";
import { type Control, Controller } from "react-hook-form";

import { Button } from "@heroui/react";
import { RiCheckLine, RiGuideLine, RiMusic2Line, RiSparklingLine } from "@remixicon/react";
import clx from "classnames";

import { t } from "@/common/i18n";
import { useOnboardingStore } from "@/store/modal/onboarding";

interface Props {
  control: Control<AppSettings>;
}

const SOURCE_OPTIONS: { value: MusicSource; label: string; hint: string }[] = [
  { value: "bilibili", label: "哔哩哔哩", hint: "不登录也能听；收藏按收藏夹管理，可以有多个" },
  { value: "netease", label: "网易云音乐", hint: "需要登录；收藏只有一组「我喜欢的音乐」" },
];

/**
 * 「音乐源与页面」设置。
 *
 * 这里的 `musicSource` 就是**首选音乐源**，同时管三件事（侧栏顺序 / 我喜欢的音乐 /
 * 搜索默认音源）。原来这个开关藏在「常规设置 → 搜索」里，只能影响搜索，
 * 用户根本猜不到它还能决定导航顺序，所以单独开一页。
 */
const MusicSourceSettings: React.FC<Props> = ({ control }) => {
  const openOnboarding = useOnboardingStore(s => s.open);

  return (
    <div className="space-y-6">
      <div>
        <h2>{t("首选音乐源")}</h2>
        <p className="text-default-500 mt-1 text-sm leading-relaxed">
          {t(
            "决定「我喜欢的音乐」进哪一家、导航里哪个平台排在前面，以及搜索默认走哪一家。两个平台的功能都会保留，只是先后顺序不同。",
          )}
        </p>
      </div>

      <Controller
        control={control}
        name="musicSource"
        render={({ field }) => (
          <div className="grid max-w-[640px] grid-cols-1 gap-3 sm:grid-cols-2">
            {SOURCE_OPTIONS.map(option => {
              const active = field.value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => field.onChange(option.value)}
                  className={clx(
                    "rounded-medium relative flex flex-col gap-1 border-1 p-4 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/10"
                      : "border-divider/40 hover:border-default-400 bg-content2/40",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <RiMusic2Line size={16} className={active ? "text-primary" : "text-default-500"} />
                    {t(option.label)}
                  </span>
                  <span className="text-default-500 text-xs leading-relaxed">{t(option.hint)}</span>
                  {active && (
                    <span className="bg-primary text-primary-foreground absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full">
                      <RiCheckLine size={11} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      />

      <div className="border-divider/40 space-y-3 border-t-1 pt-5">
        <div className="flex items-start gap-2">
          <RiGuideLine size={16} className="text-default-500 mt-0.5 flex-none" />
          <div>
            <div className="text-sm font-medium">{t("新手引导")}</div>
            <p className="text-default-500 mt-1 text-xs leading-relaxed">
              {t("介绍界面布局、音乐源、收藏与背景展示模式。首次启动会自动弹出一次，也可以在这里重新看。")}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          radius="md"
          variant="flat"
          startContent={<RiSparklingLine size={15} />}
          onPress={openOnboarding}
        >
          {t("重新查看新手引导")}
        </Button>
      </div>
    </div>
  );
};

export default MusicSourceSettings;
