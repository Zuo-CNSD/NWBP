import { addToast } from "@heroui/react";
import log from "electron-log/renderer";
import { create } from "zustand";

import { t } from "@/common/i18n";
import {
  advancePosition,
  buildInvite,
  normalizeJoinInput,
  parseInvite,
  SEEK_TOLERANCE_MS,
} from "@shared/netease/together";

import { usePlayList } from "./play-list";

/**
 * 网易云「一起听」的房间状态。
 *
 * ## 为什么不是一整套事件系统
 *
 * 网易云这边没有推送 —— 房间状态靠**轮询** `sync/playlist/get` 拿，
 * 里面只有「对方最后一条命令」。所以这里就是一个轮询循环 + 一份「已经套用过的命令」
 * 指纹，而不是订阅模型。
 *
 * ## 三个反直觉的地方
 *
 *  1. **只有自己的房间里快照永远是空的。** 网易云返回的是「对方」那条命令，
 *     自己刚发过的不会回给自己。所以拿不到东西不是 bug，一起听**至少要两个账号**。
 *  2. **命令里的进度是快照。** 收到时要按 `serverSeq` 把流逝的时间补上，
 *     否则每一轮轮询都在追赶同一个旧的进度，听感就是一卡一卡。
 *  3. **必须抑制回声。** 套用对方的命令会改本地播放状态，而本地状态变化又会触发上报 ——
 *     不加抑制就是两台机器互相弹球。`applyingRemote` 就是干这个的。
 */

export type TogetherRole = "idle" | "host" | "guest";

/** 轮询间隔：3 秒够跟手，又不至于把接口打爆 */
const POLL_INTERVAL = 3000;
/** 每 N 次轮询发一次心跳（≈6 秒） */
const HEARTBEAT_EVERY = 2;
/** 每 N 次轮询刷一次成员列表（≈12 秒，成员变化本来就慢） */
const MEMBERS_EVERY = 4;
/** 本地进度和「上一拍推算出的位置」差这么多，就认为用户拖了进度条 */
const LOCAL_SEEK_JUMP_MS = 2000;
/** 刚套用完远端命令的这段时间内不判本地跳变（否则会把对方的 seek 又报回去） */
const REMOTE_QUIET_MS = 8000;
/** 套用完命令后最多花这么久去对齐本地播放（切歌后音频源要过一会儿才就绪） */
const PENDING_ALIGN_MS = 12000;

interface State {
  role: TogetherRole;
  roomId: string;
  inviterId: number;
  members: NeteaseTogetherUser[];
  /** 分享给别人用的邀请码 `roomId|inviterId` */
  invite: string;
  busy: boolean;
  error: string;

  createRoom: () => Promise<boolean>;
  joinRoom: (input: string) => Promise<boolean>;
  leaveRoom: () => Promise<boolean>;
  /** 把本地播放列表整份推给房间。`silent` 用于建房时自动推 —— 没歌时不打扰用户 */
  pushPlaylist: (silent?: boolean) => Promise<boolean>;
  refreshMembers: () => Promise<void>;
}

// ---------------------------------------------------------------- 模块级运行时

let timer: number | null = null;
let tick = 0;
let clientSeq = 0;
/** > 0 表示正在套用远端命令，此时本地变化不上报 */
let applyingRemote = false;
/** 已套用的命令指纹，避免同一条命令被反复执行 */
let appliedKey = "";
let lastRemoteApplyAt = 0;
/** 上一拍的进度基准，用来识别用户拖了进度条 */
let lastProgressAt = 0;
let lastProgressMs = 0;
let watcherBound = false;

/**
 * 「还在等本地追上远端那条命令」的窗口。
 *
 * 切歌不是一帧就绪的：`playListItem` 只改 `playId`，真正的取流 + load + play 在
 * play-list 的订阅里异步跑完。所以套用完命令后要留一段时间反复对齐，
 * 否则「网络慢一点就没跟上」—— 而且这条命令的指纹已经记下了，下一拍不会再套用。
 */
let pendingUntil = 0;
let pendingPlaying = false;
let pendingSeekMs = 0;
/**
 * 是否**见过一次**「在房间里」。
 *
 * `status/get` 在刚建完房的那几拍可能还没把房间算进来，而「不在房间」又正是
 * 「房间被对方结束了」的信号 —— 不加这道闸，建完房十几秒后房间会自己关掉。
 */
let sawInRoom = false;

const api = () => window.electron?.netease?.together;

const currentItem = () => {
  const { list, playId } = usePlayList.getState();
  return list.find(item => item.id === playId);
};

const currentSongId = () => {
  const item = currentItem();
  return item?.source === "netease" && item.neteaseId ? item.neteaseId : 0;
};

const currentProgressMs = () => {
  const audio = usePlayList.getState().getAudio();
  return audio && Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime * 1000) : 0;
};

const toast = (title: string, color: "danger" | "success" | "default" = "danger") => addToast({ title, color });

// ---------------------------------------------------------------- 上报

/** 发一条播放命令；失败只记日志 —— 一起听断了不该打断本地播放 */
const report = async (
  commandType: NeteaseTogetherReportArgs["commandType"],
  songId: number,
  progressMs: number,
  playing: boolean,
  formerSongId?: number,
) => {
  const { role, roomId } = useNeteaseTogether.getState();
  if (role === "idle" || !roomId || !songId) return;

  clientSeq += 1;
  try {
    await api()?.reportCommand({
      roomId,
      commandType,
      songId,
      progressMs,
      playing,
      formerSongId,
      clientSeq,
    });
  } catch (error) {
    log.warn("[together] 上报播放状态失败:", error);
  }
};

/** 监听本地播放变化并同步给房间 */
const bindWatcher = () => {
  if (watcherBound) return;
  watcherBound = true;

  usePlayList.subscribe((state, prev) => {
    const { role } = useNeteaseTogether.getState();
    if (role === "idle") return;
    // 正在套用远端命令 —— 这次变化不是用户操作的，别报回去
    if (applyingRemote) return;

    const prevItem = prev.list.find(item => item.id === prev.playId);
    const prevSongId = prevItem?.source === "netease" && prevItem.neteaseId ? prevItem.neteaseId : 0;

    if (state.playId !== prev.playId) {
      const songId = currentSongId();
      if (!songId) return;
      void report("GOTO", songId, 0, true, prevSongId || undefined);
      return;
    }

    if (state.isPlaying !== prev.isPlaying) {
      const songId = currentSongId();
      if (!songId) return;
      void report(state.isPlaying ? "PLAY" : "PAUSE", songId, currentProgressMs(), state.isPlaying);
    }
  });
};

// ---------------------------------------------------------------- 套用远端命令

const sameSong = (songId: number) => currentSongId() === songId;

/** 房间切到了本地列表里没有的歌 —— 用详情接口把它补进来再播 */
const ensureLocalTrack = async (songId: number) => {
  const existing = usePlayList.getState().list.find(i => i.source === "netease" && i.neteaseId === songId);
  if (existing) return existing.id;

  const tracks = await window.electron?.netease?.trackDetail?.([songId]);
  const track = tracks?.[0];
  if (!track) return null;

  // 追加到列表尾部而不是重建整份 —— 不打断用户已有的队列
  usePlayList.getState().addList([
    {
      type: "audio",
      source: "netease",
      neteaseId: track.id,
      title: track.name,
      cover: track.cover,
      ownerName: track.artists,
      duration: Math.round(track.duration / 1000),
    },
  ]);

  return usePlayList.getState().list.find(i => i.source === "netease" && i.neteaseId === songId)?.id ?? null;
};

const applyRemoteCommand = async (command: NeteaseTogetherCommand) => {
  if (!command.songId) return;

  const key = `${command.userId}:${command.commandType}:${command.songId}:${command.serverSeq}`;
  if (key === appliedKey) return;
  appliedKey = key;

  applyingRemote = true;
  lastRemoteApplyAt = Date.now();

  try {
    if (!sameSong(command.songId)) {
      const id = await ensureLocalTrack(command.songId);
      if (!id) {
        log.warn("[together] 房间切到了取不到详情的歌曲:", command.songId);
        // 放掉抑制，否则 watcher 会一直哑掉
        applyingRemote = false;
        return;
      }
      // playId 一变，play-list 的订阅会负责加载地址并开播
      await usePlayList.getState().playListItem(id);
    }

    // 记下「目标状态」，交给 alignPending() 在随后的几拍里慢慢对齐 ——
    // 切歌后音频源要过一会儿才就绪，一次性对齐会漏
    pendingUntil = Date.now() + PENDING_ALIGN_MS;
    pendingPlaying = command.playing;
    pendingSeekMs = command.playing ? advancePosition(command.positionMs, true, command.serverSeq, Date.now()) : 0;

    await alignPending();
  } catch (error) {
    log.warn("[together] 套用房间命令失败:", error);
    // 出错也要放开抑制，否则 watcher 会一直哑掉
    pendingUntil = 0;
    pendingSeekMs = 0;
    applyingRemote = false;
  }
};

/**
 * 把本地往「目标状态」推。**幂等**，每拍都调。
 *
 * 位置只校正一次 —— 校正过就把 `pendingSeekMs` 清掉，
 * 否则本地正常播放推进的进度会被反复拉回去。
 *
 * 对齐完成（或超时）之前 `applyingRemote` 一直为真：这段时间里的每一次
 * `togglePlay` / `seek` 都是我们自己在动，不能被 watcher 当成用户操作报回去。
 */
const alignPending = async () => {
  if (!pendingUntil) return;

  if (Date.now() > pendingUntil) {
    pendingUntil = 0;
    pendingSeekMs = 0;
    applyingRemote = false;
    return;
  }

  const audio = usePlayList.getState().getAudio();
  if (!audio) return;

  // `audio.paused` 才是真相：`isPlaying` 是 store 里的镜像，切歌过程中会短暂不一致
  const isPlayingNow = !audio.paused;
  if (isPlayingNow !== pendingPlaying) {
    await usePlayList.getState().togglePlay();
    return;
  }

  if (pendingSeekMs > 0 && Math.abs(audio.currentTime * 1000 - pendingSeekMs) > SEEK_TOLERANCE_MS) {
    usePlayList.getState().seek(Math.max(0, pendingSeekMs / 1000));
    pendingSeekMs = 0;
  }

  if (pendingSeekMs === 0) {
    pendingUntil = 0;
    applyingRemote = false;
  }
};

// ---------------------------------------------------------------- 轮询

const poll = async () => {
  const state = useNeteaseTogether.getState();
  if (state.role === "idle" || !state.roomId) return;

  tick += 1;
  const roomId = state.roomId;

  try {
    const snapshot = await api()?.snapshot(roomId);
    if (snapshot?.command) await applyRemoteCommand(snapshot.command);
  } catch (error) {
    log.warn("[together] 读取房间状态失败:", error);
  }

  // 还有没对齐完的目标状态就继续推（切歌后音频源要过一会儿才就绪）
  if (pendingUntil) await alignPending();

  // 用户拖了进度条？—— 本地播放态是推进的，突然跳一大截就说明是人为的
  const now = Date.now();
  const progressMs = currentProgressMs();
  const playing = usePlayList.getState().isPlaying;
  if (!applyingRemote && now - lastRemoteApplyAt > REMOTE_QUIET_MS && lastProgressAt > 0 && playing) {
    const expected = lastProgressMs + (now - lastProgressAt);
    if (Math.abs(progressMs - expected) > LOCAL_SEEK_JUMP_MS) {
      void report("seek", currentSongId(), progressMs, true);
    }
  }
  lastProgressAt = now;
  lastProgressMs = progressMs;

  if (tick % HEARTBEAT_EVERY === 0) {
    try {
      await api()?.heartbeat(roomId, currentSongId(), playing, progressMs);
    } catch {
      // 心跳失败不能停轮询 —— 网络抖一下就退出房间是最糟的体验
    }
  }

  if (tick % MEMBERS_EVERY === 0) {
    try {
      const status = await api()?.status();

      if (status?.inRoom) {
        /*
         * ⚠️ 必须先「见过一次在房间里」才认「不在房间」是「房间被结束」。
         * 刚建完房的那几拍，status 可能还没把房间算进来 —— 直接拿 `!inRoom` 判结束，
         * 表现就是「建完房十几秒后房间自己关了」，而且什么都不报。
         */
        sawInRoom = true;
        if (status.members) useNeteaseTogether.setState({ members: status.members });
      } else if (sawInRoom) {
        await useNeteaseTogether.getState().leaveRoom();
        toast(t("一起听房间已结束"), "default");
        return;
      }
    } catch {
      // 同上，静默
    }
  }
};

const startPolling = () => {
  if (timer !== null) return;
  tick = 0;
  sawInRoom = false;
  lastProgressAt = Date.now();
  lastProgressMs = currentProgressMs();
  timer = window.setInterval(() => void poll(), POLL_INTERVAL);
};

const stopPolling = () => {
  if (timer === null) return;
  window.clearInterval(timer);
  timer = null;
};

// ---------------------------------------------------------------- store

/** 客人进房间时把房间队列灌进本地播放列表 */
const loadRoomQueue = async (roomId: string) => {
  const snapshot = await api()?.snapshot(roomId);
  const queue = snapshot?.queue ?? [];
  if (!queue.length) return;

  const tracks = await window.electron?.netease?.trackDetail?.(queue);
  if (!tracks?.length) return;

  await usePlayList.getState().playList(
    tracks.map(track => ({
      type: "audio" as const,
      source: "netease" as const,
      neteaseId: track.id,
      title: track.name,
      cover: track.cover,
      ownerName: track.artists,
      duration: Math.round(track.duration / 1000),
    })),
  );

  toast(t("已载入房间队列（{0} 首）", tracks.length), "success");
};

export const useNeteaseTogether = create<State>()((set, get) => ({
  role: "idle",
  roomId: "",
  inviterId: 0,
  members: [],
  invite: "",
  busy: false,
  error: "",

  createRoom: async () => {
    if (get().role !== "idle") return true;
    set({ busy: true, error: "" });

    try {
      const room = await api()?.create();
      if (!room?.roomId) throw new Error(t("没拿到房间号"));

      appliedKey = "";
      set({
        role: "host",
        roomId: room.roomId,
        inviterId: room.inviterId,
        invite: buildInvite(room.roomId, room.inviterId),
        busy: false,
      });

      bindWatcher();
      startPolling();
      // 照网易云客户端的顺序：建完房调一次 room/check，房间才算真正「在场」
      void api()
        ?.check(room.roomId)
        .catch(() => {});
      // 建完房先把当前队列推上去，对方一进来就有歌（没歌时静默跳过，别报错打扰）
      void get().pushPlaylist(true);
      void get().refreshMembers();
      toast(t("一起听房间已创建"), "success");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : t("创建房间失败");
      set({ busy: false, error: message });
      toast(message);
      return false;
    }
  },

  joinRoom: async input => {
    if (get().role !== "idle") return true;

    const parsed = parseInvite(normalizeJoinInput(input));
    if (!parsed) {
      set({ error: t("邀请码格式不对") });
      toast(t("邀请码格式不对，应形如 房间号|发起人ID"));
      return false;
    }

    set({ busy: true, error: "" });

    try {
      await api()?.accept(parsed.roomId, parsed.inviterId);

      appliedKey = "";
      set({
        role: "guest",
        roomId: parsed.roomId,
        inviterId: parsed.inviterId,
        invite: buildInvite(parsed.roomId, parsed.inviterId),
        busy: false,
      });

      bindWatcher();
      await loadRoomQueue(parsed.roomId);
      startPolling();
      void get().refreshMembers();
      toast(t("已加入一起听房间"), "success");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : t("加入房间失败");
      set({ busy: false, error: message });
      toast(message);
      return false;
    }
  },

  leaveRoom: async () => {
    const { role, roomId } = get();
    stopPolling();
    applyingRemote = false;
    pendingUntil = 0;
    pendingSeekMs = 0;
    sawInRoom = false;
    appliedKey = "";
    set({ role: "idle", roomId: "", inviterId: 0, invite: "", members: [], error: "" });

    // 房主离开 = 关掉房间；客人只是退出去
    if (role === "host" && roomId) {
      try {
        await api()?.end(roomId);
      } catch (error) {
        log.warn("[together] 关闭房间失败:", error);
      }
    }

    return true;
  },

  pushPlaylist: async silent => {
    const { role, roomId } = get();
    if (role === "idle" || !roomId) return false;

    const songIds = usePlayList
      .getState()
      .list.filter(item => item.source === "netease" && item.neteaseId)
      .map(item => item.neteaseId!) as number[];

    if (!songIds.length) {
      if (!silent) toast(t("当前播放列表里没有网易云歌曲，对方进来会是一片空白"));
      return false;
    }

    try {
      await api()?.reportPlaylist(roomId, songIds);
      toast(t("已把 {0} 首歌同步到房间", songIds.length), "success");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : t("同步播放列表失败");
      toast(message);
      return false;
    }
  },

  refreshMembers: async () => {
    const { role } = get();
    if (role === "idle") return;

    try {
      const status = await api()?.status();
      if (status?.members) set({ members: status.members });
    } catch (error) {
      log.warn("[together] 获取成员失败:", error);
    }
  },
}));
