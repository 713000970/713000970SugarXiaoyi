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

GitHub Actions：`.github/workflows/weekly-autopublish.yml`（北京时间每周一 10:00 自动提交并触发 Vercel）。首次使用请在仓库 **Settings → Actions → General** 将 **Workflow permissions** 设为 **Read and write permissions**（详见部署文档第 5 节）。

本机一键（与 CI 相同逻辑，需 Node.js）：

```bash
npm run weekly:create
```

## 每周骨架（Windows 计划任务，可选）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register_weekly_task.ps1
```
