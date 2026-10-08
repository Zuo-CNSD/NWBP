import { ipcMain } from "electron";

// 这些 Params / Response 类型在 shared/types/*.d.ts 里是全局声明，直接使用即可，
// 不能作为具名导出从 api 文件 import（原实现还写错了名字：SeachSongByLrclibParams）
import { getLyricsByLrclib } from "./api/lrclib-lyric";
import { getLyricsByNetease, getSongByNetease } from "./api/netease-lyric";
import { channel } from "./channel";
import {
  clearLyricsMatchPick,
  getLyricsMatchPick,
  resolveLyrics,
  resolveNeteaseLyrics,
  romanize,
  setLyricsMatchPick,
  translate,
} from "./lyrics-engine";

export function registerLyricsHandlers() {
  ipcMain.handle(channel.lyrics.searchNeteaseSongs, async (_, params: SearchSongByNeteaseParams) => {
    return getSongByNetease(params);
  });

  ipcMain.handle(channel.lyrics.getNeteaseLyrics, async (_, params: GetLyricsByNeteaseParams) => {
    return getLyricsByNetease(params);
  });

  ipcMain.handle(channel.lyrics.searchLrclib, async (_, params: SearchSongByLrclibParams) => {
    return getLyricsByLrclib(params);
  });

  // ---- 多源歌词聚合 ----
  ipcMain.handle(channel.lyrics.resolveCandidates, async (_, params: LyricsResolveParams) => {
    try {
      return await resolveLyrics(params);
    } catch (error) {
      return {
        candidates: [],
        picked: null,
        fromManualPick: false,
        sourceStatus: [],
        error: String(error instanceof Error ? error.message : error),
      };
    }
  });

  /** 网易云歌曲：直接按 id 取词，不用先搜索 */
  ipcMain.handle(channel.lyrics.resolveNeteaseById, async (_, id: number, target: LyricsMatchTarget) =>
    resolveNeteaseLyrics(id, target),
  );

  ipcMain.handle(channel.lyrics.translateLines, async (_, lines: string[], target?: string) =>
    translate(lines, target),
  );

  ipcMain.handle(channel.lyrics.romanizeLines, async (_, lines: string[]) => romanize(lines));

  ipcMain.handle(channel.lyrics.getMatchPick, async (_, trackKey: string) => getLyricsMatchPick(trackKey));

  ipcMain.handle(channel.lyrics.setMatchPick, async (_, trackKey: string, pick: LyricsMatchRecord) =>
    setLyricsMatchPick(trackKey, pick),
  );

  ipcMain.handle(channel.lyrics.clearMatchPick, async (_, trackKey: string) => clearLyricsMatchPick(trackKey));
}
