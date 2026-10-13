type MediaDownloadStatus =
  | "waiting"
  | "downloading"
  | "downloadPaused"
  | "merging"
  | "mergePaused" // 一般因为中途退出应用而暂停
  | "converting"
  | "convertPaused" // 一般因为中途退出应用而暂停
  | "completed"
  | "failed";

type MediaDownloadOutputFileType = "audio" | "video";

interface MediaDownloadInfo {
  /** 文件类型 */
  outputFileType: MediaDownloadOutputFileType;
  /** 标题 */
  title: string;
  /** 封面 */
  cover?: string;
  /** 视频bvid */
  bvid?: string;
  /** 视频分集cid */
  cid?: string | number;
  /** 音频sid */
  sid?: string | number;
  /**
   * 直接可用的音频直链。
   *
   * 给「没有 bvid/cid/sid 的音源」用 —— 目前就是网易云：
   * 主进程没有网易云接口，直链由渲染层用 `neteaseId` 换好后带下来。
   * 带上它就跳过 `setDownloadUrl()` 的解析步骤。
   */
  audioUrl?: string;
}

interface MediaDownloadTask extends MediaDownloadInfo {
  /** 下载任务id */
  id: string;
  /** 下载状态 */
  status: MediaDownloadStatus;
  /** 创建时间 */
  createdTime?: number;
  /** 音频编码格式 */
  audioCodecs?: string;
  /** 音频带宽 */
  audioBandwidth?: number;
  /** 视频分辨率 */
  videoResolution?: string;
  /** 视频帧率 */
  videoFrameRate?: string;
  /** 保存路径 */
  savePath?: string;
  /** 文件大小 bytes */
  totalBytes?: number;
  /** 下载进度百分比 */
  downloadProgress?: number;
  /** 合并进度百分比 */
  mergeProgress?: number;
  /** 转换进度百分比 */
  convertProgress?: number;
  /** 下载错误信息 */
  error?: string;
}

interface MediaDownloadBroadcastPayload {
  type: "full" | "update";
  data: MediaDownloadTask[];
}
