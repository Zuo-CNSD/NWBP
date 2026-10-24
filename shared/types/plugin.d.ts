/**
 * 插件系统的类型定义（主进程 / 渲染进程共用）。
 *
 * 设计取向和 Fabric 一样：插件是**可信代码**，跑在应用进程里，
 * 能改界面也能加功能。权限清单不构成沙箱 —— 它的作用是
 * 「装之前一眼看清这个插件会碰什么」以及「没声明就不给对应 API」，
 * 不是用来拦恶意代码的。真正的隔离做不到（插件要能改 DOM、能拿播放器状态）。
 */

/** 权限清单。渲染端与主进程各认自己管得着的那几项。 */
type PluginPermission =
  /** 改界面：注入 CSS / 脚本、读写 DOM */
  | "ui"
  /** 播放器：读状态、上一首 / 下一首 / 播放暂停 */
  | "music"
  /** 主进程读写插件自己目录下的文件 */
  | "fs"
  /** 主进程发网络请求 */
  | "net"
  /** 调系统能力：打开链接 / 打开文件管理器 */
  | "shell"
  /** 插件私有键值存储 */
  | "store"
  /** 系统通知 */
  | "notification";

/** 插件清单，即插件目录下的 `manifest.json` */
interface PluginManifest {
  /** 唯一 id，建议用小写字母加连字符，例如 `nwbp-hello` */
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  /** 主页 / 仓库地址，设置页里点得开 */
  homepage?: string;
  /** 兼容的插件 API 版本，目前只有 1；不填按 1 处理 */
  apiVersion?: number;
  /** 主进程入口（相对插件目录，ESM 模块） */
  main?: string;
  /** 渲染进程入口（相对插件目录，会被注入到界面里执行） */
  renderer?: string;
  /** 要注入界面的样式表（相对插件目录） */
  styles?: string[];
  /** 权限清单，不填等于什么主进程能力都不给 */
  permissions?: PluginPermission[];
  /** 列表里显示的图标：一个 emoji，或插件目录里的图片文件名 */
  icon?: string;
}

/** 插件状态快照（主进程 → 渲染进程） */
interface PluginInfo {
  id: string;
  /** 插件目录的绝对路径 */
  folder: string;
  /** manifest 解析成功才有；解析失败时用占位名显示 */
  manifest: PluginManifest | null;
  enabled: boolean;
  /** 主进程入口是否正在跑 */
  running: boolean;
  /** manifest 读取 / 校验失败的原因 */
  error?: string;
  /** 运行期错误（主进程入口抛错、渲染端脚本抛错都落到这里） */
  runtimeError?: string;
  hasMain: boolean;
  hasRenderer: boolean;
  /** 样式文件名列表 */
  styles: string[];
  permissions: PluginPermission[];
  /** 静态扫描结论。扫过的插件都有，解析失败时没有 */
  security?: PluginScanResult;
  /** 用户明知风险仍要启用（放行被拦的插件） */
  overridden?: boolean;
  /** 来源信息：本地放入 / 压缩包 / 链接安装 */
  source?: PluginSourceInfo;
}

/** 给渲染端跑的那一份（只有启用中的插件才会下发） */
interface PluginRenderBundle {
  id: string;
  name: string;
  version: string;
  permissions: PluginPermission[];
  /** 已经读成文本的 CSS，按 manifest 里的顺序 */
  css: string[];
  /** 渲染进程入口的源码，没有就是空 */
  code: string;
}

/** 插件注册的命令（设置页里可以手动触发） */
interface PluginCommandInfo {
  pluginId: string;
  pluginName: string;
  id: string;
  title: string;
  /** main = 主进程注册的，renderer = 界面里注册的 */
  from: "main" | "renderer";
}

/** 主进程 → 渲染进程的插件事件 */
interface PluginEventPayload {
  pluginId: string;
  event: string;
  payload?: unknown;
}
