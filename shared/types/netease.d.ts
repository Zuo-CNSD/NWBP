/**
 * 网易云接入层用到的类型。
 * 命名刻意避开 shared/types/lyrics.d.ts 里已有的 NeteaseSong / NeteaseAlbum
 * —— 那两个是接口原始返回，这里是归一化后的内部结构，同名的全局 interface 会被
 * TypeScript 合并成冲突声明。
 */

/** 网易云登录态（加密落盘在 electron-store 里） */
interface NeteaseAccountState {
  /** 完整 cookie 串（等同账号凭据） */
  cookie: string;
  uid: number | null;
  nickname: string;
  avatarUrl: string;
}

/** 渲染端看到的账号信息，不含 cookie 明文 */
interface NeteaseAccountInfo {
  loggedIn: boolean;
  uid: number | null;
  nickname: string;
  avatarUrl: string;
}

/** 归一化后的网易云歌曲 */
interface NeteaseTrack {
  id: number;
  name: string;
  /** 多位歌手用 " / " 连接 */
  artists: string;
  album: string;
  albumId: number | null;
  /** 已把 http 换成 https */
  cover: string;
  /** 毫秒 */
  duration: number;
  /** 版权：0 可播 / 1 VIP / 4 付费专辑 / 8 低音质免费 */
  fee?: number;
}

interface NeteasePlaylistInfo {
  id: number;
  name: string;
  cover: string;
  trackCount: number;
  /** 创建者昵称（展示用） */
  creator: string;
  /** 创建者 uid（**判断归属必须用它**，昵称会重名/改名） */
  creatorId: number | null;
  /**
   * 5 = 「我喜欢的音乐」。
   *
   * ⚠️ 光看它认不出「我的」—— **收藏（订阅）别人的「我喜欢的音乐」时，对方那个歌单同样是 5**。
   * 必须配合 `subscribed` / `creatorId`，统一走 `shared/netease/playlist.ts`。
   */
  specialType?: number;
  /** true = 收藏（订阅）来的，不是自己创建的 */
  subscribed?: boolean;
}

interface NeteaseAlbumInfo {
  id: number;
  name: string;
  cover: string;
  artist: string;
  trackCount: number;
}

/** 网易云歌词：整行 / 逐字 / 翻译 / 罗马音一次拿齐 */
interface NeteaseLyricResult {
  lrc: string;
  /** YRC 逐字歌词（网易云服务器的逐字时间轴） */
  yrc: string;
  translation: string;
  romanization: string;
}

interface NeteaseQrSession {
  unikey: string;
  /** 扫描后要打开的登录地址，渲染端用它画二维码 */
  loginUrl: string;
}

interface NeteaseQrCheckResult {
  /** 800 过期 / 801 待扫码 / 802 待确认 / 803 成功 */
  code: number;
  message: string;
  account?: NeteaseAccountInfo;
}

/** 网易云搜索参数 */
interface NeteaseSearchArgs {
  keyword: string;
  /** 1 单曲 / 10 专辑 / 1000 歌单 */
  type: 1 | 10 | 1000;
  limit?: number;
  offset?: number;
}

interface NeteasePlaylistDetail {
  id: number;
  name: string;
  cover: string;
  /** 歌单的**总**曲目数，不是 `tracks` 的条数 —— 渲染端靠它算还有没有下一页 */
  trackCount: number;
  /** 本次请求的那一页曲目（`playlistDetail(id, offset, limit)`），不是整张歌单 */
  tracks: NeteaseTrack[];
}

interface NeteaseAlbumDetail {
  id: number;
  name: string;
  cover: string;
  artist: string;
  tracks: NeteaseTrack[];
}

// ---------------------------------------------------------------- 一起听

/** 一起听房间成员 */
interface NeteaseTogetherUser {
  uid: number;
  nickname: string;
  avatarUrl: string;
}

/** 房间号 + 发起人 uid —— 两半合起来才是能分享的邀请码 */
interface NeteaseTogetherRoom {
  /** 服务端房间号，形如 `6be6cda6f9b0ff91233f42baf6c79d5d_1790909976` */
  roomId: string;
  /** 发起人 uid。**加房间必须带它**，光有 roomId 进不去 */
  inviterId: number;
}

interface NeteaseTogetherStatus {
  inRoom: boolean;
  roomId: string;
  members: NeteaseTogetherUser[];
}

/**
 * 房间里「当前那条命令」。
 *
 * ⚠️ `positionMs` 是**下发那一刻**的进度快照，不是实时值 ——
 * 要用 `serverSeq`（毫秒时间戳）补上流逝的时间，见 `shared/netease/together.ts`。
 */
interface NeteaseTogetherCommand {
  /** 谁操作的 */
  userId: number;
  songId: number;
  positionMs: number;
  playing: boolean;
  serverSeq: number;
  commandType: string;
}

/** `sync/playlist/get` 的快照。只有自己的房间里恒为 `hasCommand: false`（设计如此） */
interface NeteaseTogetherSnapshot {
  hasCommand: boolean;
  command: NeteaseTogetherCommand | null;
  /** 房间当前队列（网易云歌曲 id） */
  queue: number[];
}

/** 上报给房间的播放动作 */
interface NeteaseTogetherReportArgs {
  roomId: string;
  commandType: "PLAY" | "PAUSE" | "GOTO" | "seek" | "NEXT" | "PREV";
  songId: number;
  progressMs: number;
  playing: boolean;
  formerSongId?: number;
  clientSeq: number;
}

/** eapi 通道的原始响应外壳 */
interface NeteaseTogetherRawResponse {
  code?: number;
  message?: string;
  msg?: string;
  data?: Record<string, any>;
}
