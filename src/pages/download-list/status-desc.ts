/**
 * 下载状态 → 人话。
 *
 * 这里存的是**中文原文（也就是词条 key）**，不是翻好的文案 ——
 * 因为这张表在模块顶层求值，写 `t()` 只会在 import 时算一次，
 * 换语言不会重算。渲染那边再 `t(StatusDesc[status])`。
 */
export const StatusDesc: Record<MediaDownloadStatus, string> = {
  waiting: "等待中",
  downloading: "下载中",
  downloadPaused: "下载暂停",
  merging: "下载完成，合并分块中",
  mergePaused: "合并暂停",
  convertPaused: "转换暂停",
  converting: "转换文件格式中",
  completed: "已完成",
  failed: "任务出错",
};
