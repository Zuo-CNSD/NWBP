import React from "react";
import { type Control, Controller } from "react-hook-form";

import { Button } from "@heroui/react";
import {
  RiBilibiliLine,
  RiCheckLine,
  RiGuideLine,
  RiLayoutGridLine,
  RiMusic2Line,
  RiSparklingLine,
} from "@remixicon/react";
import clx from "classnames";

import { t } from "@/common/i18n";
import { useOnboardingStore } from "@/store/modal/onboarding";

interface Props {
  control: Control<AppSettings>;
}

interface ModeOption {
  value: SourceMode;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

/**
 * 三个展示模式。
 *
 * 这一页在 Beta 8 是「首选音乐源（二选一）」，Beta 9 改成**模式切换**：
 * 用户真正想要的是「我就只用网易云」或者「两个一起用」，
 * 而不是「两家都塞在侧栏里，只是排个先后」。
 */
const MODE_OPTIONS: ModeOption[] = [
  {
    value: "netease",
    label: "网易云模式",
    hint: "侧栏只留网易云：我的歌单 / 我的专辑 / 热门歌单。哔哩哔哩的入口全部收起，界面最干净。",
    icon: <RiMusic2Line size={16} />,
  },
  {
    value: "bilibili",
    label: "哔哩哔哩模式",
    hint: "侧栏只留哔哩哔哩：推荐音乐 / 关注 / 稍后再看 / 历史记录，收藏夹也跟着在这一组。",
    icon: <RiBilibiliLine size={16} />,
  },
  {
    value: "mixed",
    label: "融合模式",
    hint: "两家都放在侧栏里，上下各成一组。谁排在前面由下面的「默认进入」决定，功能一个都不少。",
    icon: <RiLayoutGridLine size={16} />,
  },
];

/** 融合模式下的默认音源（单选模式下由模式本身决定，这里不用显示） */
const PREFERRED_OPTIONS: { value: MusicSource; label: string; hint: string }[] = [
  { value: "bilibili", label: "哔哩哔哩", hint: "不登录也能听；收藏按收藏夹管理，可以有多个" },
  { value: "netease", label: "网易云音乐", hint: "需要登录；收藏只有一组「我喜欢的音乐」" },
];

const OptionCard = ({
  active,
  icon,
  label,
  hint,
  compact,
  onPress,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  compact?: boolean;
  onPress: () => void;
}) => (
  <button
    type="button"
    onClick={onPress}
    className={clx(
      "rounded-medium relative flex flex-col gap-1 border-1 text-left transition-colors",
      compact ? "p-3" : "p-4",
      active ? "border-primary bg-primary/10" : "border-divider/40 hover:border-default-400 bg-content2/40",
    )}
  >
    <span className={clx("flex items-center gap-2 font-semibold", compact ? "text-xs" : "text-sm")}>
      <span className={active ? "text-primary" : "text-default-500"}>{icon}</span>
      {label}
    </span>
    <span className="text-default-500 text-xs leading-relaxed">{hint}</span>
    {active && (
      <span className="bg-primary text-primary-foreground absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full">
        <RiCheckLine size={11} />
      </span>
    )}
  </button>
);

/**
 * 「音乐源与页面」设置。
 *
 * 主开关是 `sourceMode`（网易云 / 哔哩哔哩 / 融合），决定**侧栏显示哪几组**；
 * 融合模式下再让用户选一个「默认进入」，它由 `musicSource` 承担，
 * 同时决定「我喜欢的音乐」指向哪一家。单选模式下 `musicSource` 不参与判断。
 */
const MusicSourceSettings: React.FC<Props> = ({ control }) => {
  const openOnboarding = useOnboardingStore(s => s.open);

  return (
    <div className="space-y-6">
      <div>
        <h2>{t("界面模式")}</h2>
        <p className="text-default-500 mt-1 text-sm leading-relaxed">
          {t(
            "决定侧栏里放哪几家的内容。只用一个音源就选对应的模式，两边都用就选融合；换模式不会动播放队列，也不会丢任何数据。",
          )}
        </p>
      </div>

      <Controller
        control={control}
        name="sourceMode"
        render={({ field }) => (
          <div className="space-y-5">
            <div className="grid max-w-[720px] grid-cols-1 gap-3 sm:grid-cols-3">
              {MODE_OPTIONS.map(option => (
                <OptionCard
                  key={option.value}
                  active={field.value === option.value}
                  icon={option.icon}
                  label={t(option.label)}
                  hint={t(option.hint)}
                  onPress={() => field.onChange(option.value)}
                />
              ))}
            </div>

            {field.value === "mixed" && (
              <div className="border-divider/40 space-y-3 border-l-2 pl-4">
                <div>
                  <div className="text-sm font-medium">{t("融合模式下默认进入")}</div>
                  <p className="text-default-500 mt-1 text-xs leading-relaxed">
                    {t("决定两家谁排在前面，也决定「我喜欢的音乐」进哪一家的收藏。")}
                  </p>
                </div>
                <Controller
                  control={control}
                  name="musicSource"
                  render={({ field: sourceField }) => (
                    <div className="grid max-w-[520px] grid-cols-1 gap-2 sm:grid-cols-2">
                      {PREFERRED_OPTIONS.map(option => (
                        <OptionCard
                          key={option.value}
                          compact
                          active={sourceField.value === option.value}
                          icon={<RiMusic2Line size={14} />}
                          label={t(option.label)}
                          hint={t(option.hint)}
                          onPress={() => sourceField.onChange(option.value)}
                        />
                      ))}
                    </div>
                  )}
                />
              </div>
            )}
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
