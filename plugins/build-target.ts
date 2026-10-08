import { logger } from "@rsbuild/core";
import { Arch, Platform } from "electron-builder";

/** 可以作为打包目标的平台 */
export type BuildPlatform = "mac" | "win" | "linux";

const ELECTRON_BUILDER_PLATFORM: Record<BuildPlatform, Platform> = {
  mac: Platform.MAC,
  win: Platform.WINDOWS,
  linux: Platform.LINUX,
};

/**
 * 各平台的图标放在 `electron/icons/` 下的哪个子目录。
 * linux 没有专属目录（图标直接用根目录的 `logo.png`），所以是 null。
 */
const ICON_SRC_DIRNAME: Record<BuildPlatform, string | null> = {
  mac: "macos",
  win: "win",
  linux: null,
};

const HOST_PLATFORM: BuildPlatform =
  process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";

/**
 * 这次构建要打哪几个平台。
 *
 * - 不设 `NWBP_BUILD_TARGET` → 只打当前系统（electron-builder 的默认行为）。
 * - 设了 → 例如 `NWBP_BUILD_TARGET=mac,win`，**一次构建同时产出多个平台**。
 *   必须一次跑完，因为 `plugin-electron.ts` 的 `onBeforeBuild` 里会 `rimraf dist`，
 *   分两次跑的话第二次会把第一次的安装包一起删掉。
 */
export function resolveBuildPlatforms(): Array<BuildPlatform> {
  const raw = (process.env.NWBP_BUILD_TARGET ?? "").trim();
  if (!raw) return [HOST_PLATFORM];

  const platforms: Array<BuildPlatform> = [];
  for (const name of raw.split(/[,\s]+/).filter(Boolean)) {
    const platform = name.toLowerCase() as BuildPlatform;
    if (!(platform in ELECTRON_BUILDER_PLATFORM)) {
      logger.warn(`[electron] 忽略不认识的平台 "${name}"（可用：mac / win / linux）`);
      continue;
    }
    if (!platforms.includes(platform)) platforms.push(platform);
  }

  if (platforms.length === 0) return [HOST_PLATFORM];
  logger.info(`[electron] 本次要打这几个平台：${platforms.join(", ")}`);
  return platforms;
}

/**
 * 转成 electron-builder 的 `targets` 参数。
 *
 * 内层 Map 故意留空 —— 这样 electron-builder 会自己按 config 里的 `mac.target` /
 * `win.target` 推导目标与架构，我们**不需要把 dmg/zip、nsis/portable 抄第二遍**。
 * （依据：`computeArchToTargetNamesMap()` 在 arch 映射为空时回落到
 * `platformSpecificBuildOptions.target`。）
 */
export function toElectronBuilderTargets(platforms: Array<BuildPlatform>): Map<Platform, Map<Arch, Array<string>>> {
  return new Map(platforms.map(platform => [ELECTRON_BUILDER_PLATFORM[platform], new Map<Arch, Array<string>>()]));
}

/** 该平台的图标源目录名（相对 `electron/icons/`），null 表示用根目录的 logo.png */
export function iconSrcDirOf(platform: BuildPlatform): string | null {
  return ICON_SRC_DIRNAME[platform];
}
