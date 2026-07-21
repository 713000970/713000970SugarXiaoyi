param(
    [string]$TaskName = "K12WeeklyIndustryUpdate"
)

$scriptPath = Join-Path $PSScriptRoot "scripts\register_weekly_task.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Missing file: $scriptPath"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -TaskName $TaskName
exit $LASTEXITCODE
