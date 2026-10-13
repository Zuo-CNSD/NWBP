import { BrowserWindow, ipcMain, nativeImage } from "electron";
import path from "node:path";

import { ELECTRON_ICON_BASE_PATH } from "@shared/path";

import { onLanguageChange, t } from "../i18n";
import { channel } from "../ipc/channel";
import { IconBase } from "../utils";

const iconPrev = nativeImage.createFromPath(path.resolve(IconBase, ELECTRON_ICON_BASE_PATH, "prev.png"));
const iconNext = nativeImage.createFromPath(path.resolve(IconBase, ELECTRON_ICON_BASE_PATH, "next.png"));
const iconPlay = nativeImage.createFromPath(path.resolve(IconBase, ELECTRON_ICON_BASE_PATH, "play.png"));
const iconPause = nativeImage.createFromPath(path.resolve(IconBase, ELECTRON_ICON_BASE_PATH, "pause.png"));

/**
 * 在 Windows 上设置任务栏缩略按钮，并根据播放状态动态更新播放/暂停按钮。
 * 返回一个清理句柄用于取消事件监听。
 */
let lastPlaying = false;
let stopLanguageWatch: (() => void) | null = null;

export function setupWindowsThumbar(win: BrowserWindow) {
  const ensureThumbBar = (isPlaying: boolean) => {
    lastPlaying = isPlaying;
    win.setThumbarButtons([
      {
        tooltip: t("上一首"),
        icon: iconPrev,
        click: () => win.webContents.send(channel.player.prev),
      },
      {
        tooltip: isPlaying ? t("暂停") : t("播放"),
        icon: isPlaying ? iconPause : iconPlay,
        click: () => win.webContents.send(channel.player.toggle),
      },
      {
        tooltip: t("下一首"),
        icon: iconNext,
        click: () => win.webContents.send(channel.player.next),
      },
    ]);
  };

  // 初始化按钮（默认未播放）
  ensureThumbBar(false);

  ipcMain.on(channel.player.state, (_, isPlaying) => {
    ensureThumbBar(!!isPlaying);
  });

  /*
   * 按钮的 tooltip 是文案，换语言后要重设一遍。
   * 重设需要知道当前播放状态，所以上面把状态记在 lastPlaying 里。
   * 先退订再订阅：这个函数理论上可能被重复调用，不退订会越挂越多。
   */
  stopLanguageWatch?.();
  stopLanguageWatch = onLanguageChange(() => {
    if (win.isDestroyed()) {
      stopLanguageWatch?.();
      stopLanguageWatch = null;
      return;
    }
    ensureThumbBar(lastPlaying);
  });
}
