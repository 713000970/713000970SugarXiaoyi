param(
    [switch]$SkipDeploy,
    [switch]$SkipPipeline
)
$ErrorActionPreference = 'Continue'
$RootPath = 'C:\Users\DELL\.cursor\行业动态'
$WharfCli = 'C:\Users\DELL\.codex\skills\wharf-deploy\scripts\wharf.mjs'
$GitUrl   = 'https://git.xkw.cn/sunxinwei/app-mukuf2w1.git'
$Project  = 'proj_mukuf8yxfinz21'
$LogPath  = Join-Path $RootPath 'weekly-sync-wharf.log'

function Log($msg) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    $line | Tee-Object -FilePath $LogPath -Append
}

Set-Location $RootPath

# 1) 尝试从 GitHub 拉取最新提交（连不上就算了）
$before = git rev-parse HEAD 2>$null
git pull origin main 2>&1 | Out-Null
$after = git rev-parse HEAD 2>$null
if ($after -ne $before) {
    Log "GitHub 有新提交，已同步：$after"
} else {
    Log 'GitHub 无更新（或不可达），走本地采集流程'
    if (-not $SkipPipeline) {
        node scripts/run-weekly-full.mjs 2>&1 | ForEach-Object { Log "  pipeline: $_" }
        if ($LASTEXITCODE -ne 0) { Log '本地采集流程失败，本次任务中止'; exit 1 }
    }
}

# 2) 提交本地改动（如有）
git add -A 2>$null
$staged = git diff --cached --quiet; $hasChanges = ($LASTEXITCODE -ne 0)
if ($hasChanges) {
    git commit -m "chore(weekly): automated weekly sync" 2>&1 | Out-Null
    Log "已提交自动改动"
}

# 3) 推送 GitHub（尽力而为，失败不影响内网）
git push origin main 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Log 'GitHub 推送成功' } else { Log 'GitHub 推送失败（不影响内网更新）' }

# 4) 推送到内网仓库
node $WharfCli push --name '教辅行业动态周报' --repo $GitUrl 2>&1 | ForEach-Object { Log "  push: $_" }
if ($LASTEXITCODE -ne 0) { Log '内网仓库推送失败，本次任务中止'; exit 1 }

# 5) 重新部署
if ($SkipDeploy) {
    Log 'SkipDeploy 已指定，跳过部署（测试模式）'
} else {
    node $WharfCli deploy --project $Project --no-watch 2>&1 | ForEach-Object { Log "  deploy: $_" }
    if ($LASTEXITCODE -eq 0) { Log '内网站点重新部署已提交' } else { Log '内网站点部署失败' }
}
Log '===== 任务结束 ====='
