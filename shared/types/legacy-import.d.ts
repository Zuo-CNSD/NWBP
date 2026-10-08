/** 旧版 Biu 数据同步的状态（渲染端用来显示提示与按钮） */
interface LegacyImportStatus {
  /** 本次启动是否导入了 B 站登录态 */
  loginImportedAtStartup: boolean;
  /** 本次启动导入了哪些东西 */
  importedAtStartup: string[];
  /** 找到的旧版数据目录 */
  source: string | null;
  /** 机器上是否存在可导入的旧版数据 */
  hasLegacyData: boolean;
  /** 当前是否已登录 B 站 */
  hasLogin: boolean;
}
