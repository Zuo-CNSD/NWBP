import type { IpcHandlerProps } from "./types";

import { registerPluginHandlers } from "../plugin";
import { registerAppHandlers } from "./app";
import { registerCookieIpcHandlers } from "./cookie";
import { registerDialogHandlers } from "./dialog";
import { registerDownloadHandlers } from "./download";
import { registerFontHandlers } from "./font";
import { registerLocalMusicHandlers } from "./local-music";
import { registerLyricsHandlers } from "./lyrics";
import { registerNeteaseHandlers } from "./netease";
import { registerShortcutHandlers } from "./shortcut";
import { registerStoreHandlers } from "./store";
import { registerWindowHandlers } from "./window";

export function registerIpcHandlers(props: IpcHandlerProps) {
  registerStoreHandlers();
  registerDialogHandlers();
  registerFontHandlers();
  registerDownloadHandlers(props);
  registerAppHandlers();
  registerCookieIpcHandlers();
  registerWindowHandlers(props);
  registerShortcutHandlers(props);
  registerLyricsHandlers();
  registerNeteaseHandlers();
  registerLocalMusicHandlers();
  // 插件放最后：它启动时要读设置、要拿主窗口，前面那些得先就位
  registerPluginHandlers(props);
}
