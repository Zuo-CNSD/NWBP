import log from "electron-log";

import { isCommandPlaying } from "@shared/netease/together";

import { t } from "../../i18n";
import { getNeteaseAccount, readNeteaseCookie } from "./account";
import { neteaseEapiPost } from "./client";

/**
 * 网易云「一起听」。
 *
 * 这一批接口全部走 **eapi**（见 `crypto.ts` 里的说明），路由是照着网易云自己的客户端
 * 逐条核对过的 —— 网上流传的一份实现里有两个路径是错的，照着写会一直 404：
 *
 *   | 操作       | 路径                                          | 备注                     |
 *   | ---------- | --------------------------------------------- | ------------------------ |
 *   | 创建房间   | `/api/listen/together/room/create`            | 要带 `refer`             |
 *   | 房间状态   | `/api/listen/together/room/check`             |                          |
 *   | 加入房间   | `/api/listen/together/play/invitation/accept` | 要 `roomId` + `inviterId`|
 *   | **读房间** | `/api/listen/together/sync/playlist/get`      | 整个功能能跑通靠的就是它 |
 *   | 上报歌单   | `/api/listen/together/sync/list/command/report` | `playlistParam` 是 JSON 串 |
 *   | 上报动作   | `/api/listen/together/play/command/report`    | `commandInfo` 是 JSON 串  |
 *   | 心跳       | `/api/listen/together/heartbeat`              | 注意不是 `heatbeat`      |
 *   | 结束房间   | `/api/listen/together/end/v2`                 |                          |
 *   | 我的状态   | `/api/listen/together/status/get`             |                          |
 *
 * ⚠️ `playlistParam` / `commandInfo` 都是**字符串化的对象**，不是平铺字段。
 * 把里面的 key 直接提到顶层是另一个请求，服务端可以收下然后忽略 —— 而且不报错，很难查。
 *
 * ⚠️ `sync/playlist/get` 返回的是**对方**的那条命令。只有自己一个人的房间里，
 * 就算自己刚发过命令，它依然返回 `data: {}`。所以「房间是空的」不是 bug，
 * 一起听**至少要两个已登录账号**才有意义。
 */

/** 房间必须要有人在场才有意义，但所有请求都得先确认登录态 */
const requireLogin = () => {
  const account = getNeteaseAccount();
  if (!account.loggedIn || !account.uid || !readNeteaseCookie()) {
    throw new Error(t("请先登录网易云账号"));
  }
  return account;
};

const ensureOk = <T extends { code?: number; message?: string; msg?: string }>(res: T | null, label: string) => {
  const code = Number(res?.code ?? 0);
  if (code !== 200) {
    throw new Error(t("{0}失败：{1}", label, res?.message ?? res?.msg ?? `code ${code}`));
  }
  return res as T;
};

// ---------------------------------------------------------------- 房间

export const togetherCreate = async (): Promise<NeteaseTogetherRoom> => {
  const account = requireLogin();

  const res = await neteaseEapiPost<NeteaseTogetherRawResponse>("/api/listen/together/room/create", {
    refer: "songplay_more",
  });
  ensureOk(res, t("创建一起听房间"));

  // 房间信息可能是 `data.roomInfo`，也可能就是 `data` 本身 —— 两种形状都见过
  const data = (res?.data ?? {}) as Record<string, any>;
  const info = (data.roomInfo ?? data) as Record<string, any>;

  const roomId = String(info?.roomId ?? "");
  if (!roomId) throw new Error(t("创建一起听房间失败：没拿到房间号"));

  const inviterId = Number(info?.creatorId ?? info?.inviterId ?? account.uid ?? 0);
  log.info("[netease] 一起听房间已创建:", roomId);

  return { roomId, inviterId };
};

export const togetherCheck = async (roomId: string): Promise<{ joinable: boolean }> => {
  requireLogin();
  const res = await neteaseEapiPost<NeteaseTogetherRawResponse>("/api/listen/together/room/check", { roomId });
  ensureOk(res, t("查询房间"));

  const data = (res?.data ?? {}) as Record<string, any>;
  return { joinable: Boolean(data.joinable) };
};

/** 用邀请码的另一半（发起人 uid）加进房间 */
export const togetherAccept = async (roomId: string, inviterId: number): Promise<void> => {
  requireLogin();
  const res = await neteaseEapiPost<NeteaseTogetherRawResponse>("/api/listen/together/play/invitation/accept", {
    refer: "inbox_invite",
    roomId,
    inviterId: String(inviterId),
  });
  ensureOk(res, t("加入一起听房间"));
};

export const togetherEnd = async (roomId: string): Promise<void> => {
  requireLogin();
  const res = await neteaseEapiPost<NeteaseTogetherRawResponse>("/api/listen/together/end/v2", { roomId });
  ensureOk(res, t("结束一起听房间"));
};

/** 我当前在哪个房间、房间里都有谁（头像也在这里） */
export const togetherStatus = async (): Promise<NeteaseTogetherStatus> => {
  requireLogin();

  const res = await neteaseEapiPost<NeteaseTogetherRawResponse>("/api/listen/together/status/get", {});
  ensureOk(res, t("获取一起听状态"));

  const data = (res?.data ?? {}) as Record<string, any>;
  const info = (data.roomInfo ?? {}) as Record<string, any>;
  const rawUsers = Array.isArray(info.roomUsers) ? info.roomUsers : [];

  return {
    inRoom: Boolean(data.inRoom),
    roomId: String(info.roomId ?? ""),
    members: rawUsers.map(
      (u: any): NeteaseTogetherUser => ({
        uid: Number(u?.userId ?? 0),
        nickname: String(u?.nickname ?? ""),
        avatarUrl: String(u?.avatarUrl ?? ""),
      }),
    ),
  };
};

// ---------------------------------------------------------------- 同步

/**
 * 从房间的歌单里取曲目 id。
 *
 * 两个坑：
 *  - 服务端回的 `randomList` / `displayList` 有时是**裸数组**，有时被包成 `{ result: [...] }`；
 *  - 随机播放模式下要**优先读 `randomList`**，读错的话对方拿到的队列顺序是错的
 *    （表现就是「下一首」按了不出声）。
 */
const readRoomQueue = (playlist: Record<string, any>): number[] => {
  const mode = String(playlist?.playMode ?? "").toUpperCase();
  const luckyFirst = mode.includes("RANDOM") || mode.includes("SHUFFLE");
  const keys = luckyFirst ? ["randomList", "displayList"] : ["displayList", "randomList"];

  for (const key of keys) {
    const raw = playlist?.[key];
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.result) ? raw.result : null;
    if (!list) continue;

    const ids = list.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0);
    if (ids.length) return ids;
  }

  return [];
};

export const togetherSnapshot = async (roomId: string): Promise<NeteaseTogetherSnapshot> => {
  requireLogin();

  const res = await neteaseEapiPost<NeteaseTogetherRawResponse>("/api/listen/together/sync/playlist/get", { roomId });
  ensureOk(res, t("读取房间状态"));

  const data = (res?.data ?? {}) as Record<string, any>;
  const command = (data.playCommand ?? data.commandInfo ?? null) as Record<string, any> | null;
  const playlist = (data.playlist ?? {}) as Record<string, any>;

  return {
    hasCommand: Boolean(command),
    command: command
      ? {
          userId: Number(command.userId ?? 0),
          songId: Number(command.targetSongId ?? 0),
          positionMs: Number(command.progress ?? 0),
          // 播放态判定见 shared/netease/together.ts 的 isCommandPlaying
          playing: isCommandPlaying(String(command.commandType ?? ""), String(command.playStatus ?? "")),
          serverSeq: Number(command.serverSeq ?? 0),
          commandType: String(command.commandType ?? "").toUpperCase(),
        }
      : null,
    queue: readRoomQueue(playlist),
  };
};

/** 把本地播放列表整份推给房间（房主换歌单时用） */
export const togetherReportPlaylist = async (roomId: string, songIds: number[]): Promise<void> => {
  const account = requireLogin();
  const ids = songIds.filter(id => Number.isFinite(id) && id > 0);
  if (!ids.length) throw new Error(t("当前播放列表里没有网易云歌曲"));

  const playlistParam = JSON.stringify({
    commandType: "REPLACE",
    version: [{ userId: account.uid, version: Date.now() }],
    anchorSongId: "",
    anchorPosition: -1,
    randomList: ids,
    displayList: ids,
  });

  const res = await neteaseEapiPost<NeteaseTogetherRawResponse>("/api/listen/together/sync/list/command/report", {
    roomId,
    playlistParam,
  });
  ensureOk(res, t("同步播放列表"));
};

/** 上报一次播放动作（播放 / 暂停 / 切歌 / 拖进度） */
export const togetherReportCommand = async (args: NeteaseTogetherReportArgs): Promise<void> => {
  requireLogin();

  const commandInfo = JSON.stringify({
    commandType: args.commandType,
    progress: Math.max(0, Math.round(args.progressMs)),
    playStatus: args.playing ? "PLAY" : "PAUSE",
    formerSongId: args.formerSongId ? String(args.formerSongId) : "-1",
    targetSongId: String(args.songId),
    clientSeq: args.clientSeq,
  });

  const res = await neteaseEapiPost<NeteaseTogetherRawResponse>("/api/listen/together/play/command/report", {
    roomId: args.roomId,
    commandInfo,
  });
  ensureOk(res, t("同步播放状态"));
};

/** 心跳：既是保活，也是「我现在播到哪儿了」 */
export const togetherHeartbeat = async (
  roomId: string,
  songId: number,
  playing: boolean,
  progressMs: number,
): Promise<void> => {
  requireLogin();

  const res = await neteaseEapiPost<NeteaseTogetherRawResponse>("/api/listen/together/heartbeat", {
    roomId,
    songId: String(songId),
    playStatus: playing ? "PLAY" : "PAUSE",
    progress: Math.max(0, Math.round(progressMs)),
  });
  ensureOk(res, t("一起听心跳"));
};
