import { logger } from "@rsbuild/core";
import chokidar from "chokidar";
import electron from "electron";
import * as childProcess from "node:child_process";
import path from "node:path";

import { ELECTRON_OUT_DIR } from "../shared/path";

export function startElectronDev() {
  let electronProcess: childProcess.ChildProcessWithoutNullStreams | null = null;
  let isRestarting = false;
  let restartTimer: NodeJS.Timeout | null = null;

  const spawnElectron = () => {
    /*
     * 开发期附加参数，用空格分隔。
     * 主要用途：给走查开远程调试（`NWBP_DEV_ARGS="--remote-debugging-port=9223"`）、
     * 或者换一份 userData（`--user-data-dir=/tmp/xxx`）免得动到真实的用户配置。
     */
    const extraArgs = (process.env.NWBP_DEV_ARGS ?? "").split(/\s+/).filter(Boolean);
    // @ts-expect-error electron type not match string
    electronProcess = childProcess.spawn(electron, [".", ...extraArgs], {
      stdio: "inherit",
      windowsHide: false,
    });

    electronProcess?.on("spawn", () => {
      logger.success("Start electron successfully!");
    });

    electronProcess?.on("error", (err: unknown) => {
      logger.error("Failed to start electron process", err);
    });

    electronProcess?.on("close", (code: number, signal: unknown) => {
      if (isRestarting) {
        logger.info("Electron closed for restart; relaunching...");
        spawnElectron();
        isRestarting = false;
        return;
      }
      if (code === null) {
        logger.error("exited with signal", signal);
        process.exit(1);
      }
      process.exit(code);
    });
  };

  const restartElectron = () => {
    if (!electronProcess) {
      spawnElectron();
      return;
    }
    if (isRestarting) return;
    isRestarting = true;
    try {
      electronProcess.kill();
    } catch (e) {
      logger.warn("Failed to kill electron process", e);
    }
  };

  // Start once initially
  spawnElectron();

  // Watch .electron folder and restart on changes
  const watchDir = ELECTRON_OUT_DIR;
  logger.info(`Watching '${watchDir}' for changes to restart Electron`);

  const watcher = chokidar.watch(watchDir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 400,
      pollInterval: 100,
    },
  });

  const scheduleRestart = (reason: string) => {
    if (restartTimer) return;
    logger.info(`[electron-dev] Change detected (${reason}); scheduling restart...`);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      restartElectron();
    }, 500);
  };

  watcher.on("all", (event, filePath) => {
    scheduleRestart(`${event}: ${path.relative(watchDir, filePath)}`);
  });

  const handleTerminationSignal = (signal: any) => {
    process.on(signal, () => {
      if (electronProcess && !electronProcess.killed) {
        electronProcess.kill(signal);
      }
      watcher.close().catch(() => void 0);
    });
  };

  handleTerminationSignal("SIGINT");
  handleTerminationSignal("SIGTERM");
}
