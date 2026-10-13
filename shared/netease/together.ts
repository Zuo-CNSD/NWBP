/**
 * 「一起听」的纯规则。
 *
 * 单独拆出来是为了**能脱离网络单测** —— 这里每一条都是踩过或者查证过的，
 * 随手改掉就会退化成「房间建好了但两边各播各的」。
 *
 * 三个必须记住的点：
 *
 *  1. **邀请码是一对，不是一坨。** 网易云的 roomId 是 43 个字符的服务端串
 *     （形如 `6be6cda6f9b0ff91233f42baf6c79d5d_1790909976`），
 *     光有它**加不进房间** —— `play/invitation/accept` 还要发起人的 uid。
 *     所以码是 `roomId|inviterId`。
 *
 *  2. **命令里的 progress 是「下发那一刻」的快照，不是实时进度。**
 *     当成实时值用的话，对方播了一分钟就永远读慢一分钟，每一轮轮询都去追赶一次
 *     —— 这就是大多数草率实现里那种「一卡一卡地追进度」的根源。
 *
 *  3. **PLAY / GOTO / NEXT / PREV 都算「在播放」。** 只看 `playStatus` 会漏掉 GOTO
 *     （切歌命令往往带着上一拍的 PAUSE 状态过来），表现是「对方在播我这边却停着」。
 */

/** 邀请码里连接两半的分隔符。是**数据**，不是标点 —— 不要「美化」它 */
export const INVITE_SEP = "|";

/** 服务端 roomId 的形状：16 位以上十六进制 + 下划线 + 秒级时间戳 */
const ROOM_ID_PATTERN = "[0-9a-f]{16,}_\\d{6,}";

const ROOM_ID_RE = new RegExp(`^${ROOM_ID_PATTERN}$`, "i");

/**
 * 在任意文本里找邀请码。
 *
 * 分享时给出去的是**一整句话**（「和我一起听歌吧，房间码：xxx|yyy」），
 * 对方很可能连着这句话一起粘回来。所以是「找」而不是「当作整体」，
 * 否则前半段会被当成 roomId，accept 出去的是一个根本不存在的房间。
 */
const INVITE_PATTERN = new RegExp(`${ROOM_ID_PATTERN}\\|\\d{5,}`, "i");

export const buildInvite = (roomId: string, inviterId: number) => `${roomId}${INVITE_SEP}${inviterId}`;

/** 从任意文本里抠出邀请码，没有就返回 null */
export const extractInvite = (text: string): string | null => INVITE_PATTERN.exec(String(text ?? ""))?.[0] ?? null;

/** 把邀请码拆成两半；形状不对返回 null */
export const parseInvite = (code: string): { roomId: string; inviterId: number } | null => {
  const parts = String(code ?? "")
    .trim()
    .split(INVITE_SEP);
  if (parts.length !== 2) return null;

  const roomId = parts[0].trim();
  const inviterId = Number(parts[1].trim());
  // roomId 必须先过形状检查再发出去 —— 拆错了只会拿到一个「房间不存在」，比直接拒绝更难查
  if (!ROOM_ID_RE.test(roomId)) return null;
  if (!Number.isFinite(inviterId) || inviterId <= 0) return null;

  return { roomId, inviterId };
};

/**
 * 归一化用户粘贴进来的内容。
 *
 * 注意**不要**做大小写转换 —— roomId 是小写十六进制，分隔符是数据。
 * 要修正的是分隔符本身：分享面板或聊天软件可能把 `|` 换成空格、冒号或换行。
 * 不接受 `-` 当分隔符：roomId 里不会有连字符，误拆出来的是一个不存在的房间，比报错更难查。
 */
export const normalizeJoinInput = (input: string): string => {
  const found = extractInvite(input);
  if (found) return found;

  const trimmed = String(input ?? "").trim();
  if (trimmed.includes(INVITE_SEP)) return trimmed;

  const parts = trimmed
    .split(/[\s:：\n\r\t]+/)
    .map(part => part.trim())
    .filter(Boolean);

  return parts.length === 2 ? parts.join(INVITE_SEP) : trimmed;
};

/**
 * 收到命令的那一刻，这首歌实际播到哪里了。
 *
 * `serverSeq` 在网易云那边同时被用作**命令的毫秒时间戳**，所以它能用来给快照「老化」。
 * 低于 `EPOCH_MS_FLOOR` 的值（0、小计数之类）不可信 —— 拿它当时间戳会算出差了几十年的偏移。
 */
export const EPOCH_MS_FLOOR = 1_000_000_000_000;
/** 最多往前补一小时，比任何单曲都长；防止服务端给个怪值把进度顶飞 */
export const MAX_ADVANCE_MS = 3_600_000;

export const advancePosition = (positionMs: number, playing: boolean, serverSeq: number, nowMs: number): number => {
  // 暂停中的命令位置是不动的，再往前推就是凭空造漂移
  if (!playing) return positionMs;
  if (!Number.isFinite(serverSeq) || serverSeq < EPOCH_MS_FLOOR) return positionMs;

  const elapsed = Math.min(Math.max(nowMs - serverSeq, 0), MAX_ADVANCE_MS);
  return positionMs + elapsed;
};

/** 这条命令意味着「在播放」吗（见文件头第 3 点） */
export const isCommandPlaying = (commandType: string, playStatus: string): boolean => {
  const type = String(commandType ?? "").toUpperCase();
  if (type === "PLAY" || type === "GOTO" || type === "NEXT" || type === "PREV") return true;

  const status = String(playStatus ?? "").toUpperCase();
  return status === "PLAY" || status === "PLAYING";
};

/** 播放位置偏差超过这个值才去校正 —— 小抖动不管，免得反复 seek 出噪音 */
export const SEEK_TOLERANCE_MS = 3000;
