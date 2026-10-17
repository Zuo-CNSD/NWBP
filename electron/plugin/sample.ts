/**
 * 示例插件的文件内容。
 *
 * 用户在设置页点「创建示例插件」时，这些字符串会被原样写进
 * `<userData>/plugins/nwbp-hello/` —— 一份能直接改、直接看效果的模板。
 * 之所以内置而不是随安装包发一个目录：打包后 resources 是只读的，
 * 用户改不了，还不如第一次用时现写一份到可写目录。
 */
export const SAMPLE_PLUGIN_FILES: Record<string, string> = {
  "manifest.json": `{
  "id": "nwbp-hello",
  "name": "示例插件 · Hello NWBP",
  "version": "1.0.0",
  "description": "演示插件能做什么：注入样式、改界面、注册命令、读播放状态、跟主进程通信。删掉这个文件夹就等于卸载。",
  "author": "NWBP",
  "apiVersion": 1,
  "main": "main.js",
  "renderer": "index.js",
  "styles": ["style.css"],
  "permissions": ["ui", "music", "fs", "store", "notification"],
  "icon": "👋"
}
`,

  "style.css": `/*
 * 注入界面的样式表。
 *
 * 不需要 ::global 之类的写法，这就是全局 CSS，选择器直接生效。
 * 建议给插件加的节点都用固定 id / 前缀，避免和本体样式打架。
 */
#nwbp-hello-badge {
  position: fixed;
  right: 16px;
  bottom: 104px;
  z-index: 50;
  max-width: 220px;
  overflow: hidden;
  padding: 6px 11px;
  border-radius: 999px;
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  text-overflow: ellipsis;
  background: linear-gradient(135deg, #7c5cff, #26d0ce);
  box-shadow: 0 6px 18px rgb(80 60 200 / 35%);
  cursor: pointer;
  user-select: none;
  transition: transform 0.18s ease;
}

#nwbp-hello-badge:hover {
  transform: translateY(-1px) scale(1.02);
}
`,

  "index.js": `/*
 * 渲染进程入口。
 *
 * 这段代码会被注入到界面里执行，作用域里有一个 \`nwbp\` 对象。
 * 不能用 import / export —— 想加什么直接操作 DOM 就行。
 */
const badge = document.createElement("div");
badge.id = "nwbp-hello-badge";
badge.textContent = "👋 Hello NWBP";
badge.title = "点一下试试";
document.body.appendChild(badge);

// 插件被关掉 / 重新加载时会被调用，该收的东西在这儿收
nwbp.onCleanup(() => badge.remove());

const render = () => {
  const track = nwbp.music.getState();
  badge.textContent = track && track.title ? "♪ " + track.title : "👋 Hello NWBP";
};

render();
nwbp.music.subscribe(render);

badge.addEventListener("click", () => {
  nwbp.toast("这条提示是插件弹的，界面已经被插件改造过了");
});

// 设置页的插件列表里会出现「运行」按钮
nwbp.commands.register("report-track", "示例插件：播报当前歌曲", () => {
  const track = nwbp.music.getState();
  nwbp.toast(track && track.title ? "正在播放：" + track.title : "现在没有在播放");
});

// 跟主进程入口通信
nwbp.ipc
  .invoke("ping", { at: Date.now() })
  .then(res => nwbp.log("主进程回话：", res))
  .catch(err => nwbp.log("主进程没接这个通道：", err));
`,

  "main.js": `/*
 * 主进程入口。
 *
 * export default 一个 activate(ctx)，要拿 Node 能力（文件、网络、通知……）
 * 就在这里拿。ctx 的完整说明见同目录 README.md。
 * 返回值是可选的卸载函数，关插件 / 退出应用时会调。
 */
export default function activate(ctx) {
  ctx.log("主进程入口已启动，插件目录：" + ctx.dir);

  // 渲染端通过 nwbp.ipc.invoke("ping", ...) 打到这儿
  ctx.handle("ping", payload => ({ pong: true, echo: payload, at: Date.now() }));

  // 设置页里会出现这个命令的「运行」按钮
  ctx.registerCommand({
    id: "notify-hello",
    title: "示例插件：弹一条系统通知",
    run: () => ctx.notify("Hello NWBP", "这条通知来自插件的主进程入口"),
  });

  return () => ctx.log("主进程入口已卸载");
}
`,

  "README.md": `# 插件怎么写

一个插件就是一个文件夹，放进 \`plugins/\` 目录即启用（设置 → 插件 → 打开插件目录）。

\`\`\`
plugins/
└─ 你的插件/
   ├─ manifest.json   ← 必须有
   ├─ main.js         ← 可选，主进程入口
   ├─ index.js        ← 可选，界面注入脚本
   └─ style.css       ← 可选，界面注入样式
\`\`\`

## manifest.json

\`\`\`json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "一句话说明",
  "author": "你",
  "apiVersion": 1,
  "main": "main.js",
  "renderer": "index.js",
  "styles": ["style.css"],
  "permissions": ["ui", "music", "fs", "store", "notification", "net", "shell"],
  "icon": "🔧"
}
\`\`\`

权限只是「装之前一眼看清碰什么」的清单，不是沙箱：插件跑在应用进程里，
能改界面也能加功能，只装你信得过的插件。

## 主进程入口（main.js）

ESM 模块，\`export default\` 一个 \`activate(ctx)\`，返回卸载函数。

| ctx 成员 | 说明 | 需要权限 |
| --- | --- | --- |
| \`ctx.id\` / \`ctx.name\` / \`ctx.version\` / \`ctx.dir\` | 身份与目录 | — |
| \`ctx.dataDir\` | 插件私有数据目录（跨版本升级不会被覆盖） | — |
| \`ctx.log(...)\` | 写日志 | — |
| \`ctx.fs.read(rel)\` / \`.write(rel, text)\` / \`.exists(rel)\` | 读插件目录、写数据目录 | fs |
| \`ctx.net.fetch(url, init)\` | 发请求 | net |
| \`ctx.shell.openExternal(url)\` / \`.openPath(rel)\` | 打开链接 / 文件 | shell |
| \`ctx.notify(title, body)\` | 系统通知 | notification |
| \`ctx.store.get(key)\` / \`.set(key, v)\` / \`.delete(key)\` | 私有键值存储 | store |
| \`ctx.handle("通道", fn)\` | 供界面 \`nwbp.ipc.invoke\` 调用 | — |
| \`ctx.broadcast("事件", data)\` | 推给界面 \`nwbp.ipc.on\` | — |
| \`ctx.registerCommand({ id, title, run })\` | 注册命令（设置页可运行） | — |

## 界面注入脚本（index.js）

普通脚本（没有 import / export），作用域里有一个 \`nwbp\`：

| \`nwbp\` 成员 | 说明 | 需要权限 |
| --- | --- | --- |
| \`nwbp.log(...)\` | 打印到控制台 | — |
| \`nwbp.css(text)\` | 运行时再塞一段 CSS | ui |
| \`nwbp.dom.query / .queryAll / .observe\` | 操作 DOM | ui |
| \`nwbp.onCleanup(fn)\` | 插件卸载时清理 | — |
| \`nwbp.commands.register(id, title, fn)\` | 注册命令 | — |
| \`nwbp.toast(text)\` | 弹一条提示 | — |
| \`nwbp.storage.get / .set\` | 界面侧键值存储 | — |
| \`nwbp.music.getState() / .subscribe(fn)\` | 读播放状态 | music |
| \`nwbp.music.play / pause / toggle / next / prev\` | 控制播放 | music |
| \`nwbp.ipc.invoke(通道, data)\` | 调主进程入口的 \`ctx.handle\` | — |
| \`nwbp.ipc.on(事件, fn)\` | 收 \`ctx.broadcast\` 推来的事件 | — |

改完文件后在设置页点「重新加载插件」即可，不用重启应用。
`,
};
