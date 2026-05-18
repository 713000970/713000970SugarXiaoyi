# 部署到 GitHub + Vercel

本项目为**纯静态站点**：`weekly/*.md` 为源文件，构建时由**仓库根目录**的 `generate-html.mjs` 生成 `weekly-html/*.html`、根目录 `周报中心.html` 以及 **`index.html`**（供站点根路径 `/` 访问）。脚本放在根目录是为了 GitHub 网页上传时少漏文件。

## 1. 推送到 GitHub

1. 在 GitHub 新建空仓库（可设为 **Private**）。
2. 在本机项目根目录执行（将 `YOUR_USER/YOUR_REPO` 换成你的仓库）：

```bash
git init
git add .
git commit -m "Initial import: K12 weekly reports"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

## 2. 连接 Vercel

1. 打开 [Vercel](https://vercel.com)，用 GitHub 登录。
2. **Add New Project** → **Import** 你的仓库。
3. 构建选项一般会按仓库内 **`vercel.json`** 自动识别：
   - **Install Command**：`npm install`
   - **Build Command**：`npm run build`
   - **Output Directory**：`.`（项目根目录）
4. 点击 **Deploy**。成功后会得到形如 `https://xxx.vercel.app` 的域名。

构建完成后会在项目根目录生成 **`index.html`**（内容与 `周报中心.html` 相同），以便访问根路径 **`/`** 时不会出现 `404 NOT_FOUND`。若仍遇到 404，请查看下文「故障排除」。

## 3. 本地构建（与线上一致）

需安装 [Node.js](https://nodejs.org) 18+：

```bash
npm run build
```

Windows 下沿用 **`scripts/generate_html.ps1`** 也会调用同一 Node 脚本（需已安装 `node`）。

## 4. 更新周报后的发布流程

1. 编辑或新增 `weekly/YYYY-WW-周报.md`、`周报中心.md` 索引。
2. 提交并推送到 GitHub：`git push`。
3. Vercel 会自动重新构建并上线（默认绑定 push）。

无需打开 Cursor；只要改 Markdown 并推送即可。

## 5. 每周一 10:00 自动上线（GitHub Actions）

仓库已包含 **`.github/workflows/weekly-autopublish.yml`**：北京时间每周一 10:00（UTC 周一 02:00）依次执行：生成当周周报骨架 → 按 `config/weekly-rss.json` 拉取 RSS 写入「十一、自动摘录」→ `npm run build`，若有变更则 **commit 并 push**，从而触发 Vercel 重新部署。

1. 打开 GitHub 仓库 **Settings → Actions → General**。
2. 在 **Workflow permissions** 中选择 **Read and write permissions**，保存。
3. 在 **Actions** 页选中 **Weekly skeleton and publish**，可用 **Run workflow** 做一次联调（应出现新提交且 Vercel 出现新部署）。

若权限为只读，工作流会在 `git push` 步骤失败。

若默认分支启用了 **Branch protection** 且禁止 Actions 直接推送，需要为该仓库放宽规则或为 `github-actions[bot]` 配置允许推送，否则需在保护分支上改用 **Pull Request** 流程（可再扩展本 workflow）。

## 6. Windows 计划任务（可选）

本机 **`scripts/register_weekly_task.ps1`** 每周一 10:00 调用与云端相同的 **`create-weekly-report.mjs`**（通过 `create_weekly_report.ps1`）。**仅本机执行不会更新线上**，仍需 `git push` 才会触发 Vercel；线上自动发布以第 5 节 GitHub Actions 为准。

## 7. 故障排除（访问域名出现 `404 NOT_FOUND`）

1. **打开 Vercel → 该项目 → Deployments**，点开最近一次部署，确认状态为 **Ready**，且 **Build Logs** 里 `npm run build` 成功结束（应能看到 `Generated: ... index.html`）。若构建失败，线上不会有可用页面。
2. **Project Settings → General → Root Directory**：必须指向包含 `package.json` 与 `vercel.json` 的仓库根目录；若误设为子目录会导致构建产物不全。
3. **Project Settings → Build & Development**：**Build Command** 应为 `npm run build`，**Output Directory** 一般为 `.`（与 `vercel.json` 一致）。不要随意改成 `dist` 除非你真的把静态文件输出到 `dist`。
4. **自定义域名（如 `d6.fuxue.online`）**：在 **Domains** 中确认域名已绑定到**当前项目**，DNS 按 Vercel 提示解析（建议先访问默认的 `*.vercel.app` 域名验证站点正常，再排查自定义域名）。
5. 修改已随代码推送后，等待 **1～2 分钟** 再访问；必要时在 Deployments 里 **Redeploy** 一次。
