# NWBP 插件开发文档

> 适用版本：NWBP Beta 6 及以后（插件 API **v1**；安全扫描与安全模式自 Beta 7 起）。
> 插件系统按「像 Minecraft 的 Fabric 那样开放」设计 —— 插件不是外挂脚本，而是跑在应用进程里的**可信代码**：
> 既能改界面（注入样式与脚本、操作 DOM），也能加功能（在主进程里拿 Node 能力、注册命令、开自己的 IPC 通道）。
>
> 但**开放 ≠ 无保护**：账号凭据不在插件能碰到的范围内，命中硬性危险特征会被直接拒绝加载。
> 动手之前请先读第 11 节。

---

## 目录

1. [五分钟上手](#1-五分钟上手)
2. [插件目录与 manifest](#2-插件目录与-manifest)
3. [主进程入口（main.js）](#3-主进程入口mainjs)
4. [界面注入（index.js）](#4-界面注入indexjs)
5. [注入样式（CSS）](#5-注入样式css)
6. [命令](#6-命令)
7. [双向通信](#7-双向通信)
8. [播放器](#8-播放器)
9. [存储](#9-存储)
10. [权限](#10-权限)
11. [安全模型与扫描](#11-安全模型与扫描)
12. [调试与排错](#12-调试与排错)
13. [分发与版本](#13-分发与版本)
14. [完整示例](#14-完整示例)
15. [FAQ](#15-faq)

---

## 1. 五分钟上手

**第一步**：打开 NWBP → 设置 → **插件** → 「打开插件目录」。

目录位置：

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/NWBP/plugins/` |
| Windows | `%APPDATA%\NWBP\plugins\` |
| Linux | `~/.config/NWBP/plugins/` |
| 开发环境（dev） | `~/Library/Application Support/nwbp-dev/plugins/` |

**第二步**：在目录里新建一个文件夹，例如 `hello/`，放进两个文件：

`hello/manifest.json`

```json
{
  "id": "hello",
  "name": "Hello",
  "version": "1.0.0",
  "styles": ["style.css"]
}
```

`hello/style.css`

```css
/* 只是改界面的话，一个 CSS 就够了 */
.side-bar {
  background: linear-gradient(180deg, #1ed760 0%, transparent 40%);
}
```

**第三步**：回设置页点「重新加载」→ 侧栏立刻出现绿色渐变。

想改功能？再加一个 `index.js`（见[第 4 节](#4-界面注入indexjs)）。
懒得自己写？设置 → 插件 → 空状态里的「**创建示例插件**」会写一份带注释、能直接改的模板，
里面同目录还有一份 `README.md`，是本文的速查版。

> **放进目录即启用**，不需要安装、不需要重启。关掉在设置页点开关，卸载就是删文件夹。

---

## 2. 插件目录与 manifest

```
plugins/
└─ 你的插件目录/            ← 目录名随意，id 以 manifest 里的为准
   ├─ manifest.json        ← 必须
   ├─ main.js              ← 可选：主进程入口（ESM）
   ├─ index.js             ← 可选：界面注入脚本
   ├─ style.css            ← 可选：界面注入样式
   └─ data/                ← 你自己放素材的地方，随插件目录一起走
```

### manifest 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 唯一标识，建议 `小写字母-连字符`。非法字符会被替换成 `-` |
| `name` | string | ✅ | 显示名 |
| `version` | string | ✅ | 插件自己的版本，建议 semver |
| `description` | string | | 一句话说明，显示在插件卡片上 |
| `author` | string | | 作者 |
| `homepage` | string | | 主页 / 仓库地址 |
| `apiVersion` | number | | 兼容的插件 API 版本，目前只有 `1`；写了更高的版本应用会拒绝加载并提示升级 NWBP |
| `main` | string | | 主进程入口，相对插件目录 |
| `renderer` | string | | 界面注入脚本，相对插件目录 |
| `styles` | string[] | | 要注入的样式表，按数组顺序注入 |
| `permissions` | string[] | | 权限清单，见[第 10 节](#10-权限)；不写等于什么主进程能力都不给 |
| `icon` | string | | 列表图标：一个 emoji（`"🎵"`），或插件目录里的图片文件名 |

`main` / `renderer` / `styles` 三个**至少得有一样**，否则插件什么都不做（设置页会提示）。

---

## 3. 主进程入口（main.js）

主进程入口是一个 **ESM 模块**，`export default` 一个 `activate(ctx)` 函数。返回值（可选）是卸载函数。

```js
export default function activate(ctx) {
  ctx.log("启动了，目录是 " + ctx.dir);

  // 供界面调用
  ctx.handle("ping", payload => ({ pong: true, echo: payload }));

  // 注册一个命令（设置页的「插件命令」里会出现「运行」按钮）
  ctx.registerCommand({
    id: "notify",
    title: "弹一条系统通知",
    run: () => ctx.notify("Hello", "来自插件"),
  });

  // 卸载时收尾
  return () => ctx.log("卸载了");
}
```

> 为什么是 ESM 而不是 `module.exports`：应用本身是 `"type": "module"`，插件里的 `.js` 会被当作 ESM。
> 用 `export default` 最省事，不需要额外加 `package.json`。

### ctx 一览

| 成员 | 说明 | 需要权限 |
| --- | --- | --- |
| `ctx.id` / `ctx.name` / `ctx.version` | 身份信息（来自 manifest） | — |
| `ctx.dir` | 插件目录的绝对路径 | — |
| `ctx.dataDir` | 插件私有数据目录（跨版本升级不会被覆盖） | — |
| `ctx.permissions` | 已声明的权限数组 | — |
| `ctx.log(...args)` | 写日志（`electron-log`，同时进 dev 控制台） | — |
| `ctx.fs.read(rel)` | 读插件目录里的文本文件，失败返回 `null` | `fs` |
| `ctx.fs.write(rel, text)` | 写文件，**只能写进 `dataDir`** | `fs` |
| `ctx.fs.exists(rel)` | 文件是否存在 | `fs` |
| `ctx.net.fetch(url, init)` | 发 HTTP 请求（返回标准 `Response`） | `net` |
| `ctx.shell.openExternal(url)` | 用系统浏览器打开链接 | `shell` |
| `ctx.shell.openPath(rel)` | 用系统程序打开插件目录里的路径 | `shell` |
| `ctx.notify(title, body?)` | 系统通知 | `notification` |
| `ctx.store.get(key)` | 读私有键值存储 | `store` |
| `ctx.store.set(key, value)` | 写（值会被 JSON 序列化） | `store` |
| `ctx.store.delete(key)` | 删 | `store` |
| `ctx.handle(channel, fn)` | 注册一个供界面调用的通道 | — |
| `ctx.broadcast(event, payload)` | 往界面推事件 | — |
| `ctx.registerCommand({ id, title, run })` | 注册命令 | — |

**生命周期**：应用启动 → 扫描目录 → 对每个启用中的插件执行 `activate`（异步、互不阻塞）→
关闭插件 / 重新加载 / 退出应用时调用返回值（卸载函数）。
插件抛错不会影响其它插件，错误会显示在设置页的插件卡片上。

**路径安全**：`rel` 参数只能指向插件自己的目录或数据目录（`../` 会被拒绝）。

---

## 4. 界面注入（index.js）

界面脚本是一段**普通脚本**（没有 `import` / `export`），作用域里有一个 `nwbp` 对象。

```js
const badge = document.createElement("div");
badge.id = "my-badge";
badge.textContent = "Hello";
document.body.appendChild(badge);

// 插件被关掉 / 重新加载 / 退出时调用
nwbp.onCleanup(() => badge.remove());
```

### nwbp 一览

| 成员 | 说明 | 需要权限 |
| --- | --- | --- |
| `nwbp.id` / `nwbp.name` / `nwbp.version` | 身份信息 | — |
| `nwbp.log(...args)` | 打印到控制台 | — |
| `nwbp.css(text)` | 运行时再插一段 CSS | `ui` |
| `nwbp.dom.query(sel)` | `querySelector` | `ui` |
| `nwbp.dom.queryAll(sel)` | `querySelectorAll`，返回数组 | `ui` |
| `nwbp.dom.observe(sel, cb)` | 元素出现时回调（MutationObserver 包装） | `ui` |
| `nwbp.onCleanup(fn)` | 登记清理函数（可登记多个） | — |
| `nwbp.commands.register(id, title, fn)` | 注册命令 | — |
| `nwbp.toast(text)` | 弹一条应用内提示 | — |
| `nwbp.storage.get(key)` / `.set(key, v)` | 界面侧键值存储（跟着应用数据走） | — |
| `nwbp.music.getState()` | 读当前播放状态 | `music` |
| `nwbp.music.subscribe(cb)` | 播放状态变化时回调 | `music` |
| `nwbp.music.play()` / `.pause()` / `.toggle()` | 播放控制 | `music` |
| `nwbp.music.next()` / `.prev()` | 上/下一首 | `music` |
| `nwbp.ipc.invoke(channel, data)` | 调主进程的 `ctx.handle` | — |
| `nwbp.ipc.on(event, cb)` | 收主进程 `ctx.broadcast` 推的事件 | — |

### 界面是 React 渲染的，插件怎么插进去

插件**不要**去改 React 管的节点（会被下一次渲染覆盖），而是：
**自己建节点挂到 `document.body`，用 CSS 定位到想放的位置**。

```js
// 把按钮挂进播放栏右侧
const bar = document.querySelector("[data-testid=playbar]");
const btn = document.createElement("button");
btn.textContent = "★";
btn.onclick = () => nwbp.toast("点了");
bar.appendChild(btn);
nwbp.onCleanup(() => btn.remove());
```

找不到节点时用 `dom.observe` 等它出现：

```js
nwbp.dom.observe("[data-testid=playbar]", bar => {
  /* 出现了，插进去 */
});
```

> 稳定选择器：优先用语义属性（`aria-label`、`role`、`data-slot`）。
> 直接依赖 Tailwind 类名容易在改版后失效。

---

## 5. 注入样式（CSS）

`manifest.styles` 里列的文件会在插件加载时以 `<style data-nwbp-plugin="<id>">` 的形式插进 `<head>`。
它就是**全局 CSS**，不需要 `::global` 之类的写法。

> **样式注入不需要 `ui` 权限**：`styles` / `renderer` 是插件包自带的静态内容，
> 装之前就能在设置页看到「注入界面」标签。`ui` 权限管的是**运行时**的
> `nwbp.css()` 和 `nwbp.dom`（能读能改任意页面内容的那部分）。

约定（不是强制，但强烈建议）：

1. 自己加的节点都用固定 id 或统一前缀（`#myplugin-xxx`），避免和本体样式撞车；
2. 覆盖本体样式时尽量收窄范围（`.side-bar .my-flag` 而不是 `.my-flag`）；
3. 需要跟随浅色 / 深色时，用 html 上的 `light` / `dark` 类：
   ```css
   html.dark #my-badge { color: #fff; }
   html.light #my-badge { color: #111; }
   ```
4. 需要跟随主色时，用 `--heroui-primary`（`h s% l%` 三元组）：
   ```css
   #my-badge { background: hsl(var(--heroui-primary) / 18%); }
   ```

> ⚠️ 不要依赖 `primary-50` / `primary-600` 这类**档位色**工具类 —— 本应用的主色是运行期写入的，
> Tailwind 里没有生成那几档，用了会「有没有样式全看运气」。

---

## 6. 命令

命令是给用户一个「现在执行一下」的入口，设置 → 插件 → **插件命令** 里会列出来，带一个「运行」按钮。

**主进程侧注册**（适合要碰文件 / 网络 / 通知的）：

```js
ctx.registerCommand({
  id: "export",
  title: "导出当前播放列表",
  run: () => {
    /* ... */
  },
});
```

**界面侧注册**（适合要操作 DOM / 弹提示的）：

```js
nwbp.commands.register("mark", "给当前歌曲打标记", () => {
  const track = nwbp.music.getState();
  nwbp.toast("已标记：" + track.title);
});
```

`id` 在**同一个插件内**唯一即可；设置页用 `插件 id + 命令 id` 组合区分。

---

## 7. 双向通信

```
界面 ── nwbp.ipc.invoke("channel", data) ──▶ 主进程 ctx.handle("channel", fn)
界面 ◀── nwbp.ipc.on("event", cb) ────────── 主进程 ctx.broadcast("event", data)
```

```js
// main.js
export default function activate(ctx) {
  ctx.handle("save", async payload => {
    ctx.store.set("last", payload);
    ctx.notify("已保存", JSON.stringify(payload));
    return { ok: true };
  });

  // 主进程主动推给界面
  setTimeout(() => ctx.broadcast("tick", { at: Date.now() }), 3000);
}
```

```js
// index.js
nwbp.ipc.invoke("save", { name: "abc" }).then(res => nwbp.log("主进程回了", res));
nwbp.ipc.on("tick", data => nwbp.toast("主进程说：" + data.at));
```

- `invoke` 返回 Promise，`ctx.handle` 的返回值会原样（经结构化克隆）传回；
- `ctx.handle` 抛错 → 界面侧的 Promise reject；
- 通道名、事件名都只在**你这个插件内部**有意义，不会和别的插件冲突。

---

## 8. 播放器

```js
const s = nwbp.music.getState();
// { id, title, artist, cover, duration, isPlaying, volume, isMuted, rate }

nwbp.music.subscribe(state => {
  nwbp.log("换歌了：", state.title);
});

nwbp.music.next();
```

注意：

- `subscribe` 只在**值真的变了**的时候回调（内部做了快照比对），不会因为进度条跳动而每帧触发；
- `play()` / `pause()` 是幂等的（已经在播就不会再 toggle 一次）；
- 需要更细的播放进度（当前秒数）目前没有暴露 —— 这一版只到「状态」这一层。

---

## 9. 存储

三种，按用途选：

| 方式 | 位置 | 适合 |
| --- | --- | --- |
| `ctx.store`（需 `store` 权限） | `<userData>/plugin-data/<id>/store.json` | 插件配置、缓存索引，主进程和界面都能读 |
| `nwbp.storage` | 应用 localStorage，键前缀 `nwbp:plugin:<id>:` | 界面侧的轻量状态（位置、开关） |
| `ctx.fs.write(rel, text)`（需 `fs` 权限） | `<userData>/plugin-data/<id>/` 下的任意文件 | 大块文本、导出的日志 |
| 插件目录里的 `data/` | 跟着插件目录走 | 只读素材（图标、词库） |

> `ctx.dataDir` 指向的就是 `<userData>/plugin-data/<id>`，卸载插件目录不会丢数据。

---

## 10. 权限

| 权限 | 给什么 | 主要 API |
| --- | --- | --- |
| `ui` | **运行时**读写页面：插样式、查 / 改 DOM | `nwbp.css` / `nwbp.dom` |
| `music` | 读播放状态、控制播放 | `nwbp.music` |
| `fs` | 读插件目录、写数据目录 | `ctx.fs` |
| `net` | 发网络请求 | `ctx.net.fetch` |
| `shell` | 调系统能力 | `ctx.shell` |
| `store` | 私有键值存储 | `ctx.store` |
| `notification` | 系统通知 | `ctx.notify` |

> `manifest` 里声明的 `styles` 与 `renderer` **不需要 `ui` 权限**，加载时总会注入
> （设置页会把这类插件标上「注入界面」）。`ui` 只是把「运行时任意操作 DOM」这一步单独拎出来声明。

**这不是沙箱。** 插件和应用跑在同一个进程里，能改界面也能加功能 —— 真正意义上的隔离做不到
（真实行隔离，插件就改不了 DOM 了）。权限清单的作用只有两个：

1. 装之前一眼看清这个插件会碰什么（设置页会把每项做成标签）；
2. 没声明就不给对应 API —— 调了会抛错，避免「不知不觉用了比自己声明更多的能力」。

**只装你信得过的插件。** 这是和 Fabric 装 mod 一样的前提。

---

## 11. 安全模型与扫描

这一节不是可选项。**插件开放发布，但开放不等于取消保护** —— 下面这些机制会影响你的插件能不能跑，写之前请看完。

### 11.1 先说清楚立场

插件跑在应用进程里，能改 DOM、能拿播放器状态。**这不是沙箱，也做不到沙箱。**

NWBP 做的是三件事：

1. **把凭据从插件能碰到的范围里拿走** —— 网易云 Cookie、B 站登录态都不在插件 API 里；
2. **把明显的坏行为挡在加载前** —— 静态扫描命中硬特征就不加载，不是弹个警告让你点确定；
3. **出问题时能救回来** —— 连续启动失败会自动进安全模式。

所以：**不要指望 NWBP 能发现所有恶意插件**。它提高的是作恶成本，不是给安全打包票。

### 11.2 插件拿不到什么

| 你想要的 | 实际情况 |
| --- | --- |
| 网易云 Cookie / `MUSIC_U` | 不存在于任何插件 API。要调网易云接口，请通过 `nwbp.ipc.invoke` 让你的主进程用应用自己的能力，或者自己做匿名请求 |
| B 站登录态（`SESSDATA`、`bili_jct`） | 同上。`document.cookie` 在插件作用域里被屏蔽，读到的是空串 |
| `localStorage` / `sessionStorage` | 被屏蔽。要存东西用 `nwbp.storage`（键前缀自动隔离） |
| `window.electron` | 被屏蔽。插件能力只能走 `nwbp.*` 那套 API |
| 直接 `require("node:fs")` | 会被静态扫描判定为 `node-escape` 并**拒绝加载**。要读文件用 `ctx.fs`，范围限制在插件自己目录内 |

### 11.3 权限清单

`manifest.json` 的 `permissions` 决定你拿到哪些能力。**不声明就没有**，调用时直接抛错。

| 权限 | 给的能力 | 主进程 / 界面 | 说明 |
| --- | --- | --- | --- |
| `ui` | `nwbp.css()`、`nwbp.dom.*` | 界面 | 注意：manifest 里的 `styles` 和 `renderer` **不需要** `ui` 也能生效，`ui` 管的是运行时的 DOM 操作 |
| `music` | 读播放状态、播放/暂停/切歌 | 界面 | 只读状态 + 传输控制，不涉及账号 |
| `fs` | 读写插件自己目录 / 数据目录 | 主进程 | 路径做了越界校验，`../` 出不去 |
| `net` | `ctx.net.fetch()` | 主进程 | 每个请求都过出口管控，见 11.4 |
| `shell` | 打开外链、打开文件管理器 | 主进程 | `openPath` 同样限制在插件目录内 |
| `store` | `ctx.store` 键值存储 | 主进程 | 按插件 id 隔离，落在 `plugin-data/<id>/` |
| `notification` | 系统通知 | 主进程 | 适度使用，别做成弹窗轰炸 |

### 11.4 网络出口管控

通过 `ctx.net.fetch` 发出的请求，以及界面里被替换过的 `fetch`，都会先过一遍检查。会被**直接拦下**的有三类：

- **非 http(s) 协议**：`file:`、`data:`、`blob:` —— 常见的「本地文件当外传通道」手法；
- **本机 / 内网 / 云元数据地址**：`localhost`、`127.0.0.1`、`10.x`、`192.168.x`、`169.254.169.254`、`*.local`；
- **请求里带用户凭据**：URL query、请求头（含 `Cookie` / `Authorization`）、请求体里出现 `MUSIC_U=`、`SESSDATA=`、`bili_jct=`、`DedeUserID=`、`__csrf=` 等特征。

被拦时 fetch 会抛错，同时设置页的审计里能看到一条拦截记录。**审计只记 `host + path`，不记 query** —— 免得日志本身变成泄密点。

> 想调 B 站公开接口（比如取视频信息）是完全可以的，只要别把用户 Cookie 一起带上。

### 11.5 静态扫描规则

每次启动、每次「重新加载」都会扫一遍，**只读文本、不执行你的代码**。

| 规则 | 级别 | 是否拦截 | 触发条件 |
| --- | --- | --- | --- |
| `node-escape` | 严重 | **拦截** | `require`/`import` 了 `fs`、`child_process`、`net`、`http`、`vm` 等；或用了 `process.binding` |
| `password-scrape` | 严重 | **拦截** | 读 `input[type=password]` 的值 |
| `remote-code-load` | 严重 | **拦截** | 从网络拉一段代码再 `eval` 执行 |
| `credential-exfiltration` | 严重 | **拦截** | 同一个插件里**既读凭据又往外发**（两条规则组合判定） |
| `credential-read` | 高 | 提示 | 出现 `document.cookie`、`MUSIC_U`、`SESSDATA` 等 |
| `clipboard-read` | 高 | 提示 | `navigator.clipboard.read`、`execCommand("paste")` |
| `path-traversal` | 高 | 提示 | 用 `../` 拼路径 |
| `dynamic-code` | 中 | 提示 | `eval`、`new Function`、字符串形式的 `setTimeout` |
| `obfuscation` | 中 | 提示 | 大量 `\xNN` 转义或超长 base64 块 |
| `auto-start` | 低 | 提示 | `setLoginItemSettings`、写 `LaunchAgents` |

两条设计原则，写插件时值得知道：

- **不带凭据的 `fetch` 完全正常**，不会被判为风险。单纯联网不是问题。
- **误报比对漏报更伤**：一条「改个颜色」的插件被标成高风险，用户下次就不看提示了。所以规则只抓硬特征。

被拦截的插件不会运行，用户可以在设置页看到具体命中行，并**显式放行**（放行状态会被记录）。但请别把「用户可能会放行」当成设计前提。

### 11.6 AI 检测（可选）

设置页可以填一个 OpenAI 兼容的 API 端点（DeepSeek / 智谱 / Moonshot / 本地 Ollama 都行），对单个插件做一次「这段代码到底想干什么」的判读。

- **默认关闭**，不填端点就完全不联网；
- 结果按源码指纹缓存，代码没改不重复计费；
- 只发送插件自己的入口文件与样式，**不发送任何用户数据**；
- 结论是「它读了什么、发到哪、后果是什么」，不是分数。

对你来说有一条实际影响：**把凭据拆成几段字符串拼接、或者绕一大圈再发出去，静态规则可能漏，AI 更可能看出来。** 与其想办法绕，不如别碰。

### 11.7 安全模式

- 连续两次没跑到「稳定」就崩溃，第三次启动**自动不加载任何插件**，设置页顶部会有提示；
- 也可以用 `NWBP --safe-mode` 启动；
- 设置页有「下次启动禁用全部插件」按钮。

安全模式不会改动你的 `enabled` 配置 —— 它是临时的，解除后该跑的还会跑。

### 11.8 给开发者的建议

1. **别读凭据**。真的不需要，而且会被拦。
2. **用 `ctx.*` 而不是 Node 原生模块**。要文件用 `ctx.fs`，要网络用 `ctx.net.fetch`。
3. **别混淆代码**。混淆不会让它变安全，只会让它被判为中风险，用户不敢装。
4. **权限要如实声明**。多声明一项，用户就多一分犹豫；少声明一项，调用时直接报错。
5. **出问题要能被关掉**。别在 `activate` 里写死循环或阻塞启动 —— 那会触发安全模式，用户第一反应是「这插件有毒」。

---

## 12. 调试与排错

**日志**

- 主进程：`ctx.log(...)` → `electron-log`（macOS `~/Library/Logs/NWBP/main.log`），dev 下同时进终端；
- 界面：`nwbp.log(...)` → 开发者工具控制台（macOS `⌘⌥I`，仅开发版可用）。

**最常见的四个错**

| 现象 | 原因 | 解法 |
| --- | --- | --- |
| 设置页没出现这个插件 | 目录层级不对（多套了一层）、缺 `manifest.json`、目录名以 `.` 开头 | 必须 `plugins/<目录>/manifest.json` |
| 卡片上写「缺少 manifest.json」/ 解析失败 | JSON 语法错 | 复制到 JSON 校验器里过一遍 |
| 卡片上写 `main 指向的文件不存在` | `main` 写的是 `main.js` 但文件叫 `index.js` | 对齐文件名，注意大小写 |
| 错误栏里有一串红字 | 插件脚本抛错 | 那一串就是完整堆栈，按它改 |

**改了没生效**：点设置页的「重新加载」。插件不会侦听文件变化（那样每次保存都要重跑一遍，
写一半的代码会当场炸），重新加载是有意做成手动的。

**热重载做了什么**：停掉所有插件的主进程入口 → 重新扫目录 → 重新 `activate` →
广播「插件变了」→ 界面先按反序跑完所有 `onCleanup`，再重新注入样式与脚本。
所以**清理函数请务必写**，否则旧节点会留在界面上。

---

## 13. 分发与版本

插件就是一个文件夹，打包成 zip 发出去，用户解压到 `plugins/` 里即可。

- **放进目录默认启用**（和把 mod 丢进 `mods/` 一样）；
- 开关状态存在 `plugins/.state.json`，用户关掉的插件重启后仍然是关的；
- 删掉文件夹 = 卸载；`<userData>/plugin-data/<id>` 里留下的数据不会自动删。

**没有官方审核。** 你可以把插件放在自己的仓库、网盘、论坛，随便哪里。
NWBP 不会拦截来路不明的插件，但它会在安装后把该讲清楚的都讲清楚：

- 插件列表里显示**作者、主页、权限清单**；
- 每次启动都会**重新静态扫描**，命中硬规则直接不加载；
- 用户能看到**具体命中哪一行代码**，也能看到 AI 判读的结论。

换句话说：**发布自由是你的，判断依据是用户的。** 别指望「没被官方审核」等于「没人看」。

**`apiVersion` 策略**：目前是 `1`。将来出现不兼容的改动时会升到 `2`，
届时声明 `"apiVersion": 1` 的插件仍按老行为加载；写了高于应用支持的版本，应用会拒绝加载并提示升级。

**打包建议**：zip 里直接放 `manifest.json` 和入口文件，不要多套一层目录 —— 用户解压后应该刚好是一个插件文件夹。

---

## 14. 完整示例

一个「把当前歌曲信息贴到屏幕角落 + 能一键复制歌名」的小插件，四件事都用上了。

`lyric-pin/manifest.json`

```json
{
  "id": "lyric-pin",
  "name": "角落歌名",
  "version": "1.0.0",
  "description": "在右下角常驻显示当前歌曲，点一下复制歌名",
  "author": "you",
  "apiVersion": 1,
  "main": "main.js",
  "renderer": "index.js",
  "styles": ["style.css"],
  "permissions": ["ui", "music", "shell", "store", "notification"],
  "icon": "📌"
}
```

`lyric-pin/style.css`

```css
#pin-card {
  position: fixed;
  bottom: 108px;
  right: 16px;
  z-index: 50;
  max-width: 240px;
  padding: 8px 12px;
  overflow: hidden;
  border-radius: 12px;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
  background: hsl(var(--heroui-content1) / 75%);
  border: 1px solid hsl(var(--heroui-primary) / 30%);
  backdrop-filter: blur(8px);
  cursor: pointer;
}
```

`lyric-pin/index.js`

```js
const card = document.createElement("div");
card.id = "pin-card";
document.body.appendChild(card);
nwbp.onCleanup(() => card.remove());

const render = () => {
  const s = nwbp.music.getState();
  card.textContent = s.title ? s.title + " · " + s.artist : "未在播放";
};
render();
nwbp.music.subscribe(render);

card.addEventListener("click", () => {
  const s = nwbp.music.getState();
  if (!s.title) return;
  // 交给主进程做（剪贴板 + 通知都在那边）
  nwbp.ipc.invoke("copy-title", s.title).catch(err => nwbp.toast("复制失败：" + err.message));
  nwbp.toast("已复制歌名");
});

nwbp.commands.register("pin-toggle", "切换角落歌名显示", () => {
  const hidden = card.style.display === "none";
  card.style.display = hidden ? "" : "none";
  nwbp.storage.set("hidden", !hidden);
});

if (nwbp.storage.get("hidden")) card.style.display = "none";
```

`lyric-pin/main.js`

```js
import { clipboard } from "electron";

export default function activate(ctx) {
  ctx.handle("copy-title", text => {
    clipboard.writeText(String(text));
    ctx.notify("已复制", String(text));
    ctx.store.set("lastCopied", { text, at: Date.now() });
    return true;
  });

  return () => {
    /* 没有要收的东西 */
  };
}
```

> 主进程入口可以直接 `import` Electron 与 Node 的内置模块 —— 它就是一个正常的 ESM 模块。
> 但**不要 import 应用自己的源码**（那些路径在打包后不存在），需要什么能力就走 `ctx`。

---

## 15. FAQ

**Q：能让插件出现在侧栏 / 设置里成为一等公民吗？**
这一版没有「插件注册页面 / 菜单项」的接口。可行做法是往 DOM 里插节点（侧栏、播放栏都能插），
或者注册命令、用命令触发。需要真正的页面级扩展点时，把需求提上来加进插件 API v2。

**Q：能拦截 / 修改本体的网络请求吗？**
这一版没有请求拦截的扩展点。插件要发请求请用 `ctx.net.fetch`（独立的请求，走应用代理设置）。

**Q：插件能自己开 Electron 窗口吗？**
技术上可以（主进程入口能 `new BrowserWindow()`），但**没有封装进 API**，
自己开的窗口不受应用生命周期管理，出问题请自行处理。

**Q：为什么界面脚本不能用 `import`？**
它被 `new Function("nwbp", code)` 执行，目的是把 `nwbp` 当参数直接塞进去、也不需要打包器。
想复用代码就自己拼进一个文件里。

**Q：写插件要不要装 Node / 打包器？**
不用。纯文本文件，记事本就能写，改完点「重新加载」。

**Q：出错了会拖垮应用吗？**
插件抛错会被捕获：主进程入口报错只影响自己（卡片上显示堆栈），
界面脚本报错会回传到设置页，应用本体不受影响。但**死循环、疯狂刷 DOM 这类问题拦不住** —— 又一个「只装信得过的插件」的理由。

---

*插件 API v1 · NWBP Beta 8 · 有想要的扩展点，去 GitHub Issues 提。*
