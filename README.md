# 教辅行业与 K12 动态周报

Markdown 源稿在 `weekly/`。执行 **`npm run build`** 时会运行根目录 **`build.mjs`**，它会自动调用 **`generate-html.mjs`**（根目录）或 **`scripts/generate-html.mjs`**（二选一存在即可）。生成 `weekly-html/`、`周报中心.html`、根目录 **`index.html`**。找不到脚本时可看 **`构建脚本在哪里.txt`**。

## 本地构建

需要 [Node.js](https://nodejs.org) 18+：

```bash
npm run build
```

Windows 也可运行 `scripts/generate_html.ps1`（内部调用同一 Node 脚本）。

## 部署到 GitHub + Vercel

见 **[docs/部署到GitHub与Vercel.md](docs/部署到GitHub与Vercel.md)**。

## 每周骨架（云端推荐）

GitHub Actions：`.github/workflows/weekly-autopublish.yml`（北京时间每周一 10:05 起按七类自动生成有内容的板块、提交并触发 Vercel）。首次使用请在仓库 **Settings → Actions → General** 将 **Workflow permissions** 设为 **Read and write permissions**（详见部署文档第 5 节）。

本机一键（与 CI 相同：**骨架 + RSS 自动摘录 + build**；摘录源见 `config/weekly-rss.json`）：

```bash
npm run weekly:create
```

- 仅骨架（不拉 RSS）：`npm run weekly:skeleton`
- 仅更新当周摘录并 build：`npm run weekly:digest`

公众号/服务号采集：在 `config/weekly-rss.json` 的 `wechatFeeds` 增加可访问 RSS 地址，或配置 `rssHubBase` 后填写 `biz`、`hid`、可选 `cid`。采集仍只写入标题、日期、原文链接；正文按七类板块归类，其中「七、政策解读」专收网站、公众号/服务号等公开来源对教育教辅政策的解读文章，没有本周可靠信息就不写。

## 每周骨架（Windows 计划任务，可选）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register_weekly_task.ps1
```
