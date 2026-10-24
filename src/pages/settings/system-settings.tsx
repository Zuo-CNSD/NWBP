import React from "react";
import { Controller, useWatch } from "react-hook-form";
import type { Control, UseFormSetValue } from "react-hook-form";

import {
  addToast,
  Button,
  Divider,
  Form,
  Input,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  Slider,
  Switch,
  Tab,
  Tabs,
} from "@heroui/react";
import { RiComputerLine, RiFileListLine, RiLayoutGridFill, RiListView, RiMoonLine, RiSunLine } from "@remixicon/react";

import { t } from "@/common/i18n";
import { MAX_GLASS_OPACITY, MIN_GLASS_OPACITY } from "@/common/utils/glass";
import { MAX_RADIUS, MIN_RADIUS } from "@/common/utils/radius";
import { formatAppVersion } from "@/common/utils/version";
import FontSelect from "@/components/font-select";
import { LANGUAGE_LABELS, LANGUAGES, normalizeLanguage } from "@shared/i18n";

import BackgroundSettings from "./background-settings";
import ColorSettings from "./color-settings";
import ImportExport from "./export-import";

/**
 * 从 `onSelectionChange` 的入参里取出语言。
 *
 * 正常情况下拿到的是 `Set<Key>`，但 HeroUI 内部那个隐藏 `<select>` 走原生 change
 * 时会把**裸字符串**直接塞进来，而下游是按可迭代对象展开的
 * （`Array.from("ja")` → `["j", "a"]`，只剩首字母，存进去就是个非法值）。
 * 浏览器自动填充、辅助技术也可能把它填成任意内容，所以这里一律收敛：
 * 只认四种受支持的语言，其余回落中文。
 */
const pickLanguage = (selection: unknown): Language => {
  const raw = typeof selection === "string" ? selection : Array.from((selection as Iterable<unknown> | null) ?? [])[0];

  return normalizeLanguage(typeof raw === "string" ? raw : undefined);
};

type SystemSettingsTabProps = {
  appVersion: string;
  audioQuality: AudioQuality;
  control: Control<AppSettings>;
  setValue: UseFormSetValue<AppSettings>;
};

export const SystemSettingsTab = ({ appVersion, audioQuality, control, setValue }: SystemSettingsTabProps) => {
  // 「打开动画」选了视频才显示选视频那行，所以要跟着表单值走
  const launchAnimation = useWatch({ control, name: "appLaunchAnimation" });
  const launchVideo = useWatch({ control, name: "appLaunchAnimationVideo" });

  const handlePickLaunchVideo = async () => {
    const result = await window.electron?.pickLaunchVideo?.();
    if (!result?.path) return;

    if (result.tooLarge) {
      addToast({
        title: t("视频太大了"),
        description: t("开场动画每次启动都要读一遍，请换一个 64MB 以内的视频"),
        color: "warning",
      });
      return;
    }

    setValue("appLaunchAnimationVideo", result.path, { shouldDirty: true });
  };

  return (
    <Form className="space-y-6">
      <h2>{t("语言")}</h2>
      {/*
        界面语言。改完立刻生效 —— 设置写进 store，App 那边订阅着，
        key 一变整棵树重挂载，所有已经渲染出来的文案就都换语言了。
        语言名用各自的语言写（不翻译），用户扫一眼就能认出自己的母语。
      */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("界面语言")}</div>
          <div className="text-default-500 text-sm">{t("切换界面语言，改完立即生效")}</div>
        </div>
        <div className="w-[180px]">
          <Controller
            control={control}
            name="language"
            render={({ field }) => (
              <Select
                disallowEmptySelection
                aria-label={t("界面语言")}
                selectedKeys={new Set([field.value ?? "zh-CN"])}
                onSelectionChange={keys => field.onChange(pickLanguage(keys))}
              >
                {LANGUAGES.map(code => (
                  <SelectItem key={code}>{LANGUAGE_LABELS[code]}</SelectItem>
                ))}
              </Select>
            )}
          />
        </div>
      </div>
      <Divider />
      <h2>{t("外观")}</h2>
      {/* 显示模式 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("数据显示样式")}</div>
          <div className="text-default-500 text-sm">{t("选择媒体内容的显示样式")}</div>
        </div>
        <Controller
          control={control}
          name="displayMode"
          render={({ field }) => (
            <Tabs
              aria-label={t("数据展示")}
              classNames={{
                cursor: "rounded-medium",
              }}
              selectedKey={field.value}
              onSelectionChange={key => field.onChange(key)}
            >
              <Tab
                key="list"
                title={
                  <div className="flex items-center space-x-2">
                    <RiListView size={18} />
                    <span>{t("列表")}</span>
                  </div>
                }
              />
              <Tab
                key="card"
                title={
                  <div className="flex items-center space-x-2">
                    <RiLayoutGridFill size={18} />
                    <span>{t("网格")}</span>
                  </div>
                }
              />
              <Tab
                key="compact"
                title={
                  <div className="flex items-center space-x-2">
                    <RiFileListLine size={18} />
                    <span>{t("紧凑")}</span>
                  </div>
                }
              />
            </Tabs>
          )}
        />
      </div>
      {/* 主题模式 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("主题")}</div>
          <div className="text-default-500 text-sm">{t("选择浅色或深色主题")}</div>
        </div>

        <Controller
          control={control}
          name="themeMode"
          render={({ field }) => (
            <Tabs
              aria-label={t("主题切换")}
              classNames={{
                cursor: "rounded-medium",
              }}
              selectedKey={field.value}
              onSelectionChange={key => field.onChange(key)}
            >
              <Tab
                key="system"
                title={
                  <div className="flex items-center space-x-2">
                    <RiComputerLine size={18} />
                    <span>{t("跟随系统")}</span>
                  </div>
                }
              />
              <Tab
                key="light"
                title={
                  <div className="flex items-center space-x-2">
                    <RiSunLine size={18} />
                    <span>{t("浅色")}</span>
                  </div>
                }
              />
              <Tab
                key="dark"
                title={
                  <div className="flex items-center space-x-2">
                    <RiMoonLine size={18} />
                    <span>{t("深色")}</span>
                  </div>
                }
              />
            </Tabs>
          )}
        />
      </div>
      {/* color 自定义 */}
      <div className="w-full">
        <ColorSettings control={control} />
      </div>
      {/* 字体选择 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("字体")}</div>
          <div className="text-default-500 text-sm">{t("选择界面显示的字体")}</div>
        </div>
        <div className="w-[180px]">
          <Controller
            control={control}
            name="fontFamily"
            render={({ field }) => <FontSelect value={field.value} onChange={field.onChange} />}
          />
        </div>
      </div>

      {/* 全局圆角设置 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("圆角")}</div>
          <div className="text-default-500 text-sm">{t("调整界面控件的圆角大小")}</div>
        </div>
        <div className="w-[360px]">
          <Controller
            control={control}
            name="borderRadius"
            render={({ field }) => (
              <Slider
                showTooltip={false}
                size="sm"
                endContent={<span className="tabular-nums">{field.value}px</span>}
                aria-label={t("全局圆角")}
                value={field.value}
                onChange={v => field.onChange(Number(v))}
                minValue={MIN_RADIUS}
                maxValue={MAX_RADIUS}
                step={1}
                classNames={{
                  thumb: "after:hidden",
                  track: "rounded-full",
                }}
              />
            )}
          />
        </div>
      </div>
      {/* 液态玻璃外观 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("液态玻璃")}</div>
          <div className="text-default-500 text-sm">
            {t("面板改为半透明毛玻璃 + 流动彩色底衬（自定义背景色时自动失效）")}
          </div>
        </div>
        <Controller
          control={control}
          name="liquidGlass"
          render={({ field }) => <Switch disableAnimation isSelected={field.value} onValueChange={field.onChange} />}
        />
      </div>
      {/* 玻璃透明度 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("玻璃透明度")}</div>
          <div className="text-default-500 text-sm">{t('数值越大面板越透（越"薄"），越小越厚实')}</div>
        </div>
        <div className="w-[360px]">
          <Controller
            control={control}
            name="glassOpacity"
            render={({ field }) => (
              <Slider
                showTooltip={false}
                size="sm"
                aria-label={t("玻璃透明度")}
                endContent={<span className="tabular-nums">{field.value}</span>}
                value={field.value}
                onChange={v => field.onChange(Number(v))}
                minValue={MIN_GLASS_OPACITY}
                maxValue={MAX_GLASS_OPACITY}
                step={1}
                classNames={{ thumb: "after:hidden", track: "rounded-full" }}
              />
            )}
          />
        </div>
      </div>
      {/* 播放栏音频条 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("播放栏音频条")}</div>
          <div className="text-default-500 text-sm">{t("在播放栏上方显示一条跟随声音跳动的频谱")}</div>
        </div>
        <Controller
          control={control}
          name="playbarSpectrum"
          render={({ field }) => <Switch disableAnimation isSelected={field.value} onValueChange={field.onChange} />}
        />
      </div>
      {/* 自定义背景与透明窗口 */}
      <Divider />
      <h2>{t("背景")}</h2>
      <BackgroundSettings control={control} />
      <Divider />
      <h2>{t("播放")}</h2>
      {/* 音质选择 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("音质偏好")}</div>
          <div className="text-default-500 text-sm">
            {audioQuality === "auto" && t("自动选择最高音质")}
            {audioQuality === "lossless" && "FLAC / Hi-Res"}
            {audioQuality === "high" && "180-320 kbps"}
            {audioQuality === "medium" && "100-140 kbps"}
            {audioQuality === "low" && "60-80 kbps"}
          </div>
        </div>
        <div className="w-[180px]">
          <Controller
            control={control}
            name="audioQuality"
            render={({ field }) => (
              <Select
                disallowEmptySelection
                aria-label={t("音质偏好")}
                selectedKeys={field.value ? new Set([field.value]) : new Set()}
                onSelectionChange={keys => {
                  const value = Array.from(keys)[0] as AudioQuality;
                  field.onChange(value);
                }}
              >
                <SelectItem key="auto">{t("自动")}</SelectItem>
                <SelectItem key="lossless">{t("无损")}</SelectItem>
                <SelectItem key="high">{t("高品质")}</SelectItem>
                <SelectItem key="medium">{t("中等")}</SelectItem>
                <SelectItem key="low">{t("低品质")}</SelectItem>
              </Select>
            )}
          />
        </div>
      </div>
      {/* 播放记录上报 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("上报本机播放记录")}</div>
          <div className="text-default-500 text-sm">{t("将播放进度同步到Bilibili服务器")}</div>
        </div>
        <Controller
          control={control}
          name="reportPlayHistory"
          render={({ field }) => <Switch disableAnimation isSelected={field.value} onValueChange={field.onChange} />}
        />
      </div>

      <Divider />
      <h2>{t("下载")}</h2>
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("下载目录")}</div>
          <div className="text-default-500 text-sm">{t("选择音视频保存的位置")}</div>
        </div>
        <div className="w-[360px]">
          <Controller
            control={control}
            name="downloadPath"
            render={({ field }) => (
              <div className="flex items-center space-x-1">
                <Input isDisabled placeholder={t("选择文件夹")} value={field.value} onValueChange={field.onChange} />
                <Button
                  variant="flat"
                  onPress={async () => {
                    const path = await window.electron.selectDirectory();
                    if (path) setValue("downloadPath", path, { shouldDirty: true, shouldTouch: true });
                  }}
                >
                  {t("选择")}
                </Button>
              </div>
            )}
          />
        </div>
      </div>

      {/* FFmpeg 路径配置 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("FFmpeg 路径")}</div>
          <div className="text-default-500 text-sm">{t("手动指定 FFmpeg 可执行文件路径")}</div>
        </div>
        <div className="w-[360px]">
          <Controller
            control={control}
            name="ffmpegPath"
            render={({ field }) => (
              <div className="flex items-center space-x-1">
                <Input isDisabled placeholder={t("自动检测")} value={field.value} onValueChange={field.onChange} />
                <Button
                  variant="flat"
                  onPress={async () => {
                    const path = await window.electron.selectFile();
                    if (path) setValue("ffmpegPath", path, { shouldDirty: true, shouldTouch: true });
                  }}
                >
                  {t("选择")}
                </Button>
              </div>
            )}
          />
        </div>
      </div>
      <Divider />
      <h2>{t("搜索")}</h2>
      {/*
        「歌曲音源」原来在这里。
        Beta 8 把它提升成「首选音乐源」，还管侧栏顺序和「我喜欢的音乐」，
        继续塞在搜索分节里会让人以为它只影响搜索 → 挪到独立的「音乐源与页面」页。
      */}
      {/* 显示搜索历史 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("显示搜索历史")}</div>
          <div className="text-default-500 text-sm">{t("在搜索框中显示搜索历史记录")}</div>
        </div>
        <Controller
          control={control}
          name="showSearchHistory"
          render={({ field }) => <Switch disableAnimation isSelected={field.value} onValueChange={field.onChange} />}
        />
      </div>

      <Divider />
      <h2>{t("系统")}</h2>
      {/* 窗口关闭选项 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("窗口关闭")}</div>
          <div className="text-default-500 text-sm">{t("选择窗口关闭时的行为")}</div>
        </div>
        <Controller
          control={control}
          name="closeWindowOption"
          render={({ field }) => (
            <RadioGroup orientation="horizontal" value={field.value} onValueChange={field.onChange}>
              <Radio value="hide">{t("隐藏到托盘")}</Radio>
              <Radio value="exit">{t("直接退出")}</Radio>
            </RadioGroup>
          )}
        />
      </div>

      {/* app 打开动画 */}
      <div className="flex w-full items-start justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("打开动画")}</div>
          <div className="text-default-500 text-sm">
            {t("启动 app 时盖住整窗的开场画面，播放期间点任意处或按任意键可跳过")}
          </div>
        </div>
        <div className="w-[180px] flex-none">
          <Controller
            control={control}
            name="appLaunchAnimation"
            render={({ field }) => (
              <Select
                aria-label={t("app 打开动画")}
                selectedKeys={field.value ? new Set([field.value]) : new Set()}
                onSelectionChange={keys => field.onChange(Array.from(keys)[0] as AppLaunchAnimation)}
              >
                <SelectItem key="none">{t("无动画")}</SelectItem>
                <SelectItem key="fade">{t("淡入")}</SelectItem>
                <SelectItem key="logo">{t("图标淡入")}</SelectItem>
                <SelectItem key="pulse">{t("图标呼吸")}</SelectItem>
                <SelectItem key="video">{t("自定义视频")}</SelectItem>
              </Select>
            )}
          />
        </div>
      </div>

      {/* 时长只对内置动画有意义；视频模式按视频自己的长度走 */}
      {launchAnimation === "fade" || launchAnimation === "logo" || launchAnimation === "pulse" ? (
        <div className="flex w-full items-center justify-between">
          <div className="mr-6 space-y-1">
            <div className="text-medium font-medium">{t("动画时长")}</div>
            <div className="text-default-500 text-sm">{t("开场动画播多久之后进主界面")}</div>
          </div>
          <div className="w-[360px]">
            <Controller
              control={control}
              name="appLaunchAnimationDuration"
              render={({ field }) => (
                <Slider
                  showTooltip={false}
                  size="sm"
                  endContent={<span className="tabular-nums">{field.value}ms</span>}
                  aria-label={t("开场动画时长")}
                  value={field.value}
                  onChange={v => field.onChange(Number(v))}
                  minValue={400}
                  maxValue={4000}
                  step={100}
                  classNames={{
                    thumb: "after:hidden",
                    track: "rounded-full",
                  }}
                />
              )}
            />
          </div>
        </div>
      ) : null}

      {launchAnimation === "video" ? (
        <div className="flex w-full items-center justify-between">
          <div className="mr-6 min-w-0 space-y-1">
            <div className="text-medium font-medium">{t("开场视频")}</div>
            <div className="text-default-500 truncate text-sm">
              {launchVideo ? launchVideo.split(/[/\\]/).pop() : t("支持 mp4 / webm / mov，不超过 64MB；铺满整窗播放")}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Button size="sm" variant="flat" onPress={() => void handlePickLaunchVideo()}>
              {launchVideo ? t("更换视频") : t("选择视频")}
            </Button>
            {launchVideo ? (
              <Button
                size="sm"
                variant="light"
                onPress={() => setValue("appLaunchAnimationVideo", "", { shouldDirty: true })}
              >
                {t("清除")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 开机自启动开关 */}
      <div className="flex w-full items-center justify-between">
        <div className="mr-6 space-y-1">
          <div className="text-medium font-medium">{t("开机自启动")}</div>
          <div className="text-default-500 text-sm">{t("系统登录后自动启动应用")}</div>
        </div>
        <div className="flex w-[360px] justify-end">
          <Controller
            control={control}
            name="autoStart"
            render={({ field }) => <Switch disableAnimation isSelected={field.value} onValueChange={field.onChange} />}
          />
        </div>
      </div>

      <Divider />
      <h2>{t("关于应用")}</h2>
      <div className="flex w-full items-center justify-between">
        {/* 存的是 semver（0.1.0-beta.2），显示成 Beta 2 */}
        <span className="mr-6">{t("当前版本 {0}", formatAppVersion(appVersion))}</span>
      </div>
      <ImportExport />
    </Form>
  );
};
