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

## 5. 每周一 08:55 自动上线（GitHub Actions）

仓库已包含 **`.github/workflows/weekly-autopublish.yml`**：北京时间每周一 08:55 运行，09:10 备用（UTC 周一 00:55 / 01:10），依次执行：生成上一完整周周报骨架 → 按 `config/weekly-rss.json` 拉取上一周一到周日信息写入「附录：自动摘录」→ **AI 按七板块撰写正文**（需 Secret，见下；无 Secret 时使用兜底正文）→ 校验非空框架 → `npm run build`，若有变更则 **commit 并 push**，从而触发 Vercel 重新部署。

### 每周一自动「满篇干货」（AI 填稿）

1. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 新增其一：
   - `ANTHROPIC_API_KEY`（推荐，模型见 `config/weekly-fill.json` 的 `anthropicModel`）
   - 或 `OPENAI_API_KEY`（可选 `OPENAI_BASE_URL` 兼容网关）
2. 范例文风来自 `config/weekly-fill.json` 的 `exampleWeeklyPath`（默认 `weekly/2026-W21-周报.md`），可换成你满意的一期。
3. 本地联调：`npm run weekly:create`（= 骨架 + RSS + AI 填稿 + build）；仅重跑 AI：`npm run weekly:fill`（已有人工正文时默认跳过，强制覆盖设 `FORCE_WEEKLY_FILL=1`）。
4. **质量说明**：成稿质量取决于 RSS 是否拉得到近 21 天条目；教育部/RSSHub 在 CI 上常失败时，建议在 `config/weekly-rss.json` 配置自建 RSSHub 或稳定源。公众号/服务号请填入 `wechatFeeds`（直接 RSS URL，或 `rssHubBase + biz + hid + cid`），只采标题、日期、原文链接；正文按七个固定板块归类，其中「七、政策解读」专收网站、公众号/服务号等公开来源对教育教辅政策的解读文章，没有可靠本周信息就省略。重要发布前建议人工审阅第一章与政策条款。

1. 打开 GitHub 仓库 **Settings → Actions → General**。
2. 在 **Workflow permissions** 中选择 **Read and write permissions**，保存。
3. 在 **Actions** 页选中 **Weekly skeleton and publish**，可用 **Run workflow** 做一次联调（应出现新提交且 Vercel 出现新部署）。

若权限为只读，工作流会在 `git push` 步骤失败。

若默认分支启用了 **Branch protection** 且禁止 Actions 直接推送，需要为该仓库放宽规则或为 `github-actions[bot]` 配置允许推送，否则需在保护分支上改用 **Pull Request** 流程（可再扩展本 workflow）。

## 6. Windows 计划任务（可选）

本机 **`scripts/register_weekly_task.ps1`** 每周一 08:55 调用与云端相同的 **`create-weekly-report.mjs`**（通过 `create_weekly_report.ps1`）。**仅本机执行不会更新线上**，仍需 `git push` 才会触发 Vercel；线上自动发布以第 5 节 GitHub Actions 为准。

## 7. 故障排除（访问域名出现 `404 NOT_FOUND`）

1. **打开 Vercel → 该项目 → Deployments**，点开最近一次部署，确认状态为 **Ready**，且 **Build Logs** 里 `npm run build` 成功结束（应能看到 `Generated: ... index.html`）。若构建失败，线上不会有可用页面。
2. **Project Settings → General → Root Directory**：必须指向包含 `package.json` 与 `vercel.json` 的仓库根目录；若误设为子目录会导致构建产物不全。
3. **Project Settings → Build & Development**：**Build Command** 应为 `npm run build`，**Output Directory** 一般为 `.`（与 `vercel.json` 一致）。不要随意改成 `dist` 除非你真的把静态文件输出到 `dist`。
4. **自定义域名（如 `d6.fuxue.online`）**：在 **Domains** 中确认域名已绑定到**当前项目**，DNS 按 Vercel 提示解析（建议先访问默认的 `*.vercel.app` 域名验证站点正常，再排查自定义域名）。
5. 修改已随代码推送后，等待 **1～2 分钟** 再访问；必要时在 Deployments 里 **Redeploy** 一次。
