import { ipcMain } from "electron";

import { channel } from "../channel";
import * as api from "./api";

export function registerNeteaseHandlers() {
  ipcMain.handle(channel.netease.getAccount, () => api.getAccount());

  ipcMain.handle(channel.netease.loginWithCookie, async (_, cookie: string) => api.loginWithCookie(cookie));

  ipcMain.handle(channel.netease.logout, () => api.logout());

  ipcMain.handle(channel.netease.qrCreate, () => api.createQrSession());

  ipcMain.handle(channel.netease.qrCheck, (_, key: string) => api.checkQrSession(key));

  ipcMain.handle(channel.netease.search, (_, args: NeteaseSearchArgs) => {
    const limit = args.limit ?? 30;
    const offset = args.offset ?? 0;

    if (args.type === 1000) return api.searchPlaylists(args.keyword, limit, offset);
    if (args.type === 10) return api.searchAlbums(args.keyword, limit, offset);
    return api.searchTracks(args.keyword, limit, offset);
  });

  ipcMain.handle(channel.netease.hotPlaylists, (_, limit?: number) => api.hotPlaylists(limit ?? 30));

  ipcMain.handle(channel.netease.playlistDetail, (_, id: number) => api.getPlaylistDetail(id));

  ipcMain.handle(channel.netease.albumDetail, (_, id: number) => api.getAlbumDetail(id));

  ipcMain.handle(channel.netease.myPlaylists, () => api.getMyPlaylists());

  ipcMain.handle(channel.netease.myAlbums, () => api.getMyAlbums());

  ipcMain.handle(channel.netease.songUrl, (_, id: number, level?: "standard" | "exhigh" | "lossless") =>
    api.getSongUrl(id, level),
  );

  ipcMain.handle(channel.netease.lyric, (_, id: number) => api.getLyric(id));

  ipcMain.handle(channel.netease.like, (_, id: number, like: boolean) => api.likeSong(id, like));

  ipcMain.handle(channel.netease.likedIds, () => api.getLikedIds());
}
