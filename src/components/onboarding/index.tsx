import React, { useEffect, useState } from "react";

import { Button, Modal, ModalBody, ModalContent, ModalFooter } from "@heroui/react";
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCheckLine,
  RiDownloadLine,
  RiFullscreenLine,
  RiHeart3Line,
  RiLayoutLeftLine,
  RiMusic2Line,
  RiPlayListLine,
  RiSearchLine,
} from "@remixicon/react";
import clx from "classnames";

import { t } from "@/common/i18n";
import { useOnboardingStore } from "@/store/modal/onboarding";
import { useSettings } from "@/store/settings";

interface StepProps {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  desc: string;
  /** 该步的补充要点 */
  points?: { icon?: React.ComponentType<{ size?: number | string; className?: string }>; text: string }[];
  /** 额外的交互内容（例如选音源） */
  extra?: React.ReactNode;
}

/**
 * 首次启动的新手引导。
 *
 * 四步，只讲「进来之后怎么用」，不堆功能清单：
 * 布局 → 界面模式 → 音乐库 → 沉浸视图。
 * 设置页随时能重新打开（`onboardingDone` 只控制自动弹出的那一次）。
 */
const Onboarding = () => {
  const isOpen = useOnboardingStore(s => s.isOnboardingOpen);
  const close = useOnboardingStore(s => s.close);
  const sourceMode = useSettings(s => s.sourceMode ?? "mixed");
  const musicSource = useSettings(s => s.musicSource);
  const updateSettings = useSettings(s => s.update);
  const [step, setStep] = useState(0);

  // 每次重新打开都从第一步开始
  useEffect(() => {
    if (isOpen) setStep(0);
  }, [isOpen]);

  const finish = () => {
    updateSettings({ onboardingDone: true });
    close();
  };

  const steps: StepProps[] = [
    {
      icon: RiLayoutLeftLine,
      title: t("界面分三块，先认路"),
      desc: t("左边是导航，上方是搜索与窗口按钮，底部始终是播放栏 —— 在哪个页面都能控制播放。"),
      points: [
        { icon: RiPlayListLine, text: t("导航最上面一组是与音源无关的通用功能，音源相关的分组按你的界面模式出现") },
        { icon: RiPlayListLine, text: t("播放栏左边的封面点一下，会进入沉浸式背景展示视图") },
      ],
    },
    {
      icon: RiMusic2Line,
      title: t("先定界面模式"),
      desc: t(
        "模式决定侧栏里放哪几家的内容：只用一个音源就选它，两边都用就选融合。随时可以在设置里改，换模式不会动播放队列。",
      ),
      extra: (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(
              [
                { value: "netease" as const, label: t("网易云模式"), hint: t("侧栏只留网易云") },
                { value: "bilibili" as const, label: t("哔哩哔哩模式"), hint: t("侧栏只留哔哩哔哩") },
                { value: "mixed" as const, label: t("融合模式"), hint: t("两家都在，各成一组") },
              ] satisfies { value: SourceMode; label: string; hint: string }[]
            ).map(option => {
              const active = sourceMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateSettings({ sourceMode: option.value })}
                  className={clx(
                    "rounded-medium relative flex flex-col gap-1 border-1 p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/10"
                      : "border-divider/40 hover:border-default-400 bg-content2/40",
                  )}
                >
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span className="text-default-500 text-xs leading-relaxed">{option.hint}</span>
                  {active && (
                    <span className="bg-primary text-primary-foreground absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full">
                      <RiCheckLine size={11} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {sourceMode === "mixed" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-default-500 text-xs">{t("融合模式下默认进入")}</span>
              {(
                [
                  { value: "bilibili" as const, label: t("哔哩哔哩") },
                  { value: "netease" as const, label: t("网易云音乐") },
                ] satisfies { value: MusicSource; label: string }[]
              ).map(option => {
                const active = musicSource === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateSettings({ musicSource: option.value })}
                    className={clx(
                      "rounded-full border-1 px-3 py-1 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-divider/40 text-default-500 hover:border-default-400",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ),
    },
    {
      icon: RiHeart3Line,
      title: t("收藏是分开存的"),
      desc: t("两家的收藏模型不一样，所以不会混在一起：网易云是一个「我喜欢的音乐」，哔哩哔哩是一堆收藏夹。"),
      points: [
        { icon: RiHeart3Line, text: t("导航里的「我喜欢的音乐」不会跳到你当前模式看不见的那一家") },
        { icon: RiSearchLine, text: t("融合模式的搜索页可以临时切音源，只影响这一次找歌") },
        { icon: RiDownloadLine, text: t("下载记录与本地音乐放在通用分组里，跟音源无关") },
      ],
    },
    {
      icon: RiFullscreenLine,
      title: t("还有一个背景展示模式"),
      desc: t("点播放栏左侧的封面进入：整屏展示动态背景与专辑封面，只留必要的歌曲信息和播放控制。"),
      points: [
        { icon: RiFullscreenLine, text: t("进出这个模式不会打断播放，进度、队列、歌词都接着走") },
        { icon: RiMusic2Line, text: t("右上角齿轮可以调背景样式、歌词显示与频谱") },
      ],
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const Icon = current.icon;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open) finish();
      }}
      size="lg"
      radius="lg"
      hideCloseButton
      /*
       * 引导是"一次性看完"的界面，可读性优先：
       * 面板给到接近实心（95%）而不是纯玻璃，否则背后的内容会透上来干扰阅读。
       */
      classNames={{
        base: "bg-content1/95 backdrop-blur-2xl border-1 border-divider/40",
        body: "py-2",
        footer: "border-t-1 border-divider/30",
      }}
    >
      <ModalContent>
        {/*
          不用 ModalHeader：它默认是单行 flex，塞两行（步骤序号 + 标题）时
          第一行会被吃掉。这里直接写死一个两行块。
        */}
        <div className="flex items-start gap-3 px-6 pt-6 pb-2">
          <span className="bg-primary/15 text-primary mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full">
            <Icon size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-default-400 text-xs">
              {t("新手引导")} · {step + 1}/{steps.length}
            </span>
            <span className="text-foreground text-base font-semibold">{current.title}</span>
          </div>
        </div>

        <ModalBody>
          <p className="text-foreground/75 text-sm leading-relaxed">{current.desc}</p>

          {current.points && (
            <ul className="mt-3 space-y-2">
              {current.points.map((point, index) => {
                const PointIcon = point.icon ?? RiCheckLine;
                return (
                  <li key={index} className="text-foreground/80 flex items-start gap-2 text-sm">
                    <PointIcon size={15} className="text-primary mt-[3px] flex-none" />
                    <span className="leading-relaxed">{point.text}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {current.extra}
        </ModalBody>

        <ModalFooter className="items-center justify-between">
          <div className="flex items-center gap-1.5">
            {steps.map((_, index) => (
              <span
                key={index}
                className={clx("h-1.5 rounded-full transition-all", {
                  "bg-primary w-5": index === step,
                  "bg-default-300 w-1.5": index !== step,
                })}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                size="sm"
                variant="light"
                radius="md"
                startContent={<RiArrowLeftLine size={15} />}
                onPress={() => setStep(value => Math.max(0, value - 1))}
              >
                {t("上一步")}
              </Button>
            )}
            <Button size="sm" variant="light" radius="md" onPress={finish}>
              {t("跳过引导")}
            </Button>
            <Button
              size="sm"
              color="primary"
              radius="md"
              onPress={() => (isLast ? finish() : setStep(value => value + 1))}
              endContent={isLast ? <RiCheckLine size={15} /> : <RiArrowRightLine size={15} />}
            >
              {isLast ? t("开始使用") : t("下一步")}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default Onboarding;
