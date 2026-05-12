param(
    [string]$TaskName = "K12WeeklyIndustryUpdate"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$scriptPath = (Resolve-Path (Join-Path $PSScriptRoot "create_weekly_report.ps1")).Path

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -RootPath `"$rootPath`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "10:00"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Auto-create weekly K12 report and update index" -Force | Out-Null

Write-Host ("Scheduled task registered: {0}" -f $TaskName)
Write-Host "Run time: every Monday 10:00"
Write-Host ("Script: {0}" -f $scriptPath)
