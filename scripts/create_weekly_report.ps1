param(
    [string]$RootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js is required. Install from https://nodejs.org then run: npm run weekly:create"
}

$scriptPath = Join-Path $PSScriptRoot "create-weekly-report.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Missing file: $scriptPath" }

Push-Location $RootPath
try {
    & node $scriptPath
    if ($LASTEXITCODE -ne 0) { throw "create-weekly-report.mjs failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}
