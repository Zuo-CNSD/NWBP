import { logger } from "@rsbuild/core";
import { build as electronBuild } from "electron-builder";

import pkg from "../package.json";
import { ELECTRON_OUT_DIRNAME, ELECTRON_ICON_BASE_PATH } from "../shared/path";
import { resolveBuildPlatforms, toElectronBuilderTargets } from "./build-target";

export async function buildElectron() {
  await electronBuild({
    publish: "onTag",
    targets: toElectronBuilderTargets(resolveBuildPlatforms()),
    config: {
      appId: "com.nwbp.player",
      productName: "NWBP",
      copyright: `Copyright © ${new Date().getFullYear()}`,
      nodeVersion: "current",
      /*
       * 只取点分数字部分（0.1.0-beta.2 → 0.1.0）。
       * buildVersion 会落到 macOS 的 CFBundleVersion 和 Windows 的
       * FileVersion / ProductVersion 上，这两处都只认「点分数字」：
       * - Apple 要求 CFBundleVersion 是 1~3 段点分整数
       * - Windows 那边是 rcedit 去写的，带 -beta 这种后缀会解析失败
       * 所以预发布标记只留在**文件名**里（artifactName 用的是 version），不往这两处带。
       */
      buildVersion: pkg.version.split("-")[0],
      asar: true,
      electronCompile: false,
      compression: "maximum",
      removePackageScripts: true,
      removePackageKeywords: true,
      npmRebuild: false,
      nodeGypRebuild: false,
      buildDependenciesFromSource: false,
      electronLanguages: ["zh-CN"],
      directories: {
        output: "dist/artifacts",
      },
      extraResources: [{ from: ELECTRON_ICON_BASE_PATH, to: ELECTRON_ICON_BASE_PATH }],
      /*
       * electron-builder 打包的是 node_modules 的**实际内容**，不看 package.json 里有没有，
       * 所以从依赖里删掉的包仍然会被塞进来。检查更新功能已整体移除，这里显式排掉
       * electron-updater（连同它的 source map），省得把死代码打进安装包。
       */
      files: [`${ELECTRON_OUT_DIRNAME}/**`, "dist/web/**", "!**/electron-updater/**"],
      win: {
        target: [
          { target: "nsis", arch: ["x64", "arm64"] },
          { target: "portable", arch: ["x64", "arm64"] },
        ],
        icon: `${ELECTRON_ICON_BASE_PATH}/logo.ico`,
        extraResources: [{ from: "electron/ffmpeg/ffmpeg.exe", to: "electron/ffmpeg/ffmpeg.exe" }],
      },
      nsis: {
        deleteAppDataOnUninstall: true,
        oneClick: false,
        perMachine: false,
        allowElevation: true,
        allowToChangeInstallationDirectory: true,
        buildUniversalInstaller: false,
        artifactName: "${productName}-${version}-win-setup-${arch}.${ext}",
      },
      portable: {
        artifactName: "${productName}-${version}-win-portable-${arch}.${ext}",
      },
      mac: {
        target: [
          { target: "dmg", arch: ["x64", "arm64"] },
          { target: "zip", arch: ["x64", "arm64"] },
        ],
        category: "public.app-category.music",
        icon: `${ELECTRON_ICON_BASE_PATH}/nwbp.icon`,
        hardenedRuntime: true,
        gatekeeperAssess: false,
        darkModeSupport: true,
        entitlements: "plugins/mac/entitlements.mac.plist",
        entitlementsInherit: "plugins/mac/entitlements.mac.plist",
        notarize: false,
        artifactName: "${productName}-${version}-mac-${arch}.${ext}",
        extraResources: [{ from: "electron/ffmpeg/ffmpeg-mac-${arch}", to: "electron/ffmpeg/ffmpeg-mac-${arch}" }],
      },
      linux: {
        target: [
          { target: "AppImage", arch: ["x64", "arm64"] },
          { target: "deb", arch: ["x64", "arm64"] },
          { target: "rpm", arch: ["x64", "arm64"] },
        ],
        icon: `${ELECTRON_ICON_BASE_PATH}/logo.png`,
        category: "AudioVideo",
        synopsis: "NWBP - bilibili music desktop application",
        maintainer: "wood3n",
        vendor: "wood3n",
        executableName: "NWBP",
        artifactName: "${productName}-${version}-linux-${arch}.${ext}",
        extraResources: [{ from: "electron/ffmpeg/ffmpeg-linux", to: "electron/ffmpeg/ffmpeg-linux" }],
      },
      publish: {
        provider: "github",
        owner: "wood3n",
        repo: "biu",
        releaseType: null,
      },
    },
  })
    .then(result => {
      logger.success(result);
    })
    .catch(error => {
      logger.error(error);
    });
}
