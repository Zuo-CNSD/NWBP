/**
 * 界面模式（`sourceMode`）到「侧栏怎么排」的唯一换算处。
 *
 * 这套判断原先散在三个地方各写一遍 —— 侧栏、通用菜单的「我喜欢的音乐」、
 * 搜索页的音源切换器 —— 只要有一处漏改，就会出现「侧栏只剩网易云、
 * 但搜索页还能切到哔哩哔哩」这类互相矛盾的状态。抽成纯函数之后，
 * 三处走同一份逻辑，也能直接被单测钉住。
 *
 * 三种模式：
 *  - `netease`  网易云模式：只留通用组 + 网易云
 *  - `bilibili` 哔哩哔哩模式：只留通用组 + 哔哩哔哩（含收藏夹）
 *  - `mixed`    融合模式：两家都在，谁在前看 `musicSource`
 */
export interface SourceVisibility {
  /** 侧栏要不要画网易云那一组 */
  showNetease: boolean;
  /** 侧栏要不要画哔哩哔哩那一组（收藏夹跟着它，不能拆开） */
  showBilibili: boolean;
  /** 融合模式下网易云排在上面 */
  neteaseFirst: boolean;
  /**
   * 当前实际生效的音源。
   *
   * 单选模式下由模式本身决定 —— 界面里只剩这一家，
   * 「我喜欢的音乐」要是还按 `musicSource` 跳到被藏起来的那一家，
   * 用户点进去就是一片看不见的页面。
   */
  activeSource: MusicSource;
  /** 搜索页要不要显示音源切换器（只有融合模式才有"切"的意义） */
  showSourceSwitch: boolean;
}

export const resolveSourceVisibility = (
  mode: SourceMode | undefined,
  preferred: MusicSource | undefined,
): SourceVisibility => {
  // 老存档没有 sourceMode，按融合处理 —— 那是 Beta 8 之前的行为，升级后不该变样
  const sourceMode: SourceMode = mode ?? "mixed";
  const preferredSource: MusicSource = preferred ?? "bilibili";

  const showNetease = sourceMode !== "bilibili";
  const showBilibili = sourceMode !== "netease";

  return {
    showNetease,
    showBilibili,
    neteaseFirst: sourceMode === "mixed" && preferredSource === "netease",
    activeSource: sourceMode === "mixed" ? preferredSource : sourceMode,
    showSourceSwitch: sourceMode === "mixed",
  };
};
