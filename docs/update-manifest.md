# 更新清单（latest.json）

应用里的「检查更新」和「公告」都读这一个文件：仓库根目录的 `latest.json`。

## 为什么不用 GitHub Releases API

1. Release 的 tag 是 `BETA7` 这种，不是 semver，比不出大小；
2. 未登录时 API 限流 60 次/小时，「每次启动查一次」的量级迟早撞上；
3. 公告、已知问题这些内容挂在 Release body 里不好结构化。

代价是发版时多一步：**改完 `latest.json` 要跟着源码一起推上去**。

## 取哪两个地址

按顺序试，第一个成功就用它：

| 顺序 | 地址 | 说明 |
| --- | --- | --- |
| 1 | `https://cdn.jsdelivr.net/gh/Zuo-CNSD/NWBP@main/latest.json` | 国内一般比 raw 稳，带 CDN 缓存（几分钟延迟） |
| 2 | `https://raw.githubusercontent.com/Zuo-CNSD/NWBP/main/latest.json` | 兜底，实时 |

两个都失败时界面显示「检查失败」，不会误报「已是最新」。

请求走 Electron 的 `net.fetch`，也就是会带上「设置 → 代理设置」里配的代理。
单次超时 8 秒，结果在主进程缓存 30 分钟（手动点「检查更新」会跳过缓存）。

## 字段

```jsonc
{
  "release": {
    "version": "0.1.0-beta.8",     // 必填，semver，和 package.json 对齐
    "name": "NWBP BETA V8.00",     // 展示名，可省略
    "publishedAt": "2026-10-24T00:00:00Z",
    "notes": ["一条一句"],           // 更新说明
    "knownIssues": ["一条一句"],     // 单独一栏显示，别混进 notes
    "downloads": {
      "github": "https://github.com/Zuo-CNSD/NWBP/releases",
      "mirror": "https://nas.qicwken.top/@s/nwbp"   // 有 mirror 时主按钮指向它
    }
  },
  "announcements": [
    {
      "id": "beta8-2026-10",       // 必填且要稳定：已读是按 id 记的，改了 id 用户会再看一遍
      "level": "info",             // info | warning | maintenance
      "title": "BETA8 已发布",
      "body": "正文，可省略",
      "date": "2026-10-24",
      "link": "https://..."        // 只接受 https
    }
  ]
}
```

## 版本比较规则

`shared/update` 里的 `compareVersions`：

1. 先比核心三段（`0.1.0`），按数字、不按字符串 —— `0.1.10` > `0.1.9`；
2. 核心相同时，**正式版大于预发布版**（`0.1.0` > `0.1.0-beta.9`）；
3. 都是预发布时先比标记（`beta` / `rc`），再比序号（`beta.10` > `beta.9`）。

只有远端版本比本地新才会提示；本地比远端新（自己编译的包）不会。

## 发版检查清单

1. `package.json` 的 `version` 加一档（`beta.8` → `beta.9`）；
2. **改这个文件**：`release.version` 同步、`notes` / `knownIssues` 按本版重写、`publishedAt` 换成发布日期；
3. 确认 `downloads.mirror` 的国内渠道**已经传上新包**（NAS 上的目录要么是「最新」的固定链接，
   要么每版换新链接 —— 换了就必须改这里，否则用户点下去下到的是上一版）；
4. 官网 `index.html` 的版本号与 `#whats-new` 同步更新；
5. Release 建好后，把 `publishedAt` 和下载页地址再核一遍；
6. **推完之后主动清一次 jsDelivr 缓存**：

   ```bash
   curl -s "https://purge.jsdelivr.net/gh/Zuo-CNSD/NWBP@main/latest.json"
   ```

   `cdn.jsdelivr.net` 对 `@main` 的缓存默认能留 12 小时。不清的话，
   第一个取源返回的还是**上一版**清单，客户端拿到就认为「没有更新」，
   GitHub Raw 那一层根本轮不到 —— 实测发完 Beta 8-hotfix 就是这种情况：
   Raw 已经是 hotfix，CDN 还在发 beta.8，于是 Beta 8 用户查更新只会被告知「已是最新」。
   清完可以用下面这条确认两个源读到的是同一个版本：

   ```bash
   for u in "https://cdn.jsdelivr.net/gh/Zuo-CNSD/NWBP@main/latest.json" \
            "https://raw.githubusercontent.com/Zuo-CNSD/NWBP/main/latest.json"; do
     curl -s "$u" | python3 -c "import json,sys;print(json.load(sys.stdin)['release']['version'])"
   done
   ```

> 第 3 条最容易漏：应用内的下载按钮指向 `downloads.mirror`，官网的按钮却是写死在 HTML 里的，
> 两处不是同一个来源，改了一处忘了另一处，用户点到的东西就不一样了。
>
> 第 6 条是最阴的：**不清缓存不会有任何报错**，只是更新提示静悄悄地消失，
> 而 GitHub Raw 的兜底逻辑永远走不到 —— 它只在第一个源请求失败时才用。
