import { app, ipcMain, session } from "electron";
import isDev from "electron-is-dev";
import log from "electron-log";

import { getLegacyImportResult, hasLegacyData, hasLocalBilibiliLogin, importLegacyData } from "../legacy-import";
import { channel } from "./channel";

export const applyProxySettings = async (proxySettings?: ProxySettings) => {
  try {
    if (!proxySettings || proxySettings.type === "none") {
      await session.defaultSession.setProxy({ mode: "direct" });
      return;
    }

    const { type, host, port, username, password } = proxySettings;

    if (!host || !port) {
      await session.defaultSession.setProxy({ mode: "direct" });
      return;
    }

    const scheme = type === "http" ? "http" : type === "socks4" ? "socks4" : "socks5";

    const auth =
      username && password
        ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
        : username
          ? `${encodeURIComponent(username)}@`
          : "";

    const proxyRules = `${scheme}://${auth}${host}:${port}`;

    await session.defaultSession.setProxy({ proxyRules });
  } catch (error) {
    log.error("[proxy] Failed to apply proxy settings:", error);
  }
};

export function registerAppHandlers() {
  ipcMain.handle(channel.app.getVersion, async () => {
    return app.getVersion();
  });

  ipcMain.handle(channel.app.isDev, async () => {
    return isDev;
  });

  ipcMain.handle(channel.app.setProxySettings, async (_, proxySettings: ProxySettings) => {
    await applyProxySettings(proxySettings);
  });

  ipcMain.handle(channel.app.legacyImportStatus, () => ({
    loginImportedAtStartup: getLegacyImportResult().loginImported,
    importedAtStartup: getLegacyImportResult().imported,
    source: getLegacyImportResult().source,
    hasLegacyData: hasLegacyData(),
    hasLogin: hasLocalBilibiliLogin(),
  }));

  /*
   * 手动同步旧版登录态。
   *
   * 运行期不能直接覆盖 Cookies 文件（Chromium 已经打开着它），
   * 所以这里只负责把文件复制到位，然后请用户重启 —— 重启时
   * main.ts 顶层的自动导入流程会处理剩下的事。
   */
  ipcMain.handle(channel.app.importLegacyLogin, () => {
    const result = importLegacyData({ includeState: false });
    return {
      ...result,
      hasLegacyData: hasLegacyData(),
      hasLogin: hasLocalBilibiliLogin(),
    };
  });

  ipcMain.handle(channel.app.relaunchApp, () => {
    app.relaunch();
    app.exit(0);
  });
}
