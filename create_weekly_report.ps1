param(
    [string]$RootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js is required. Install from https://nodejs.org then run: npm run weekly:create"
}

$scriptPath = Join-Path $PSScriptRoot "run-weekly-full.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Missing file: $scriptPath" }

Push-Location $RootPath
try {
    & node $scriptPath
    if ($LASTEXITCODE -ne 0) { throw "run-weekly-full.mjs failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}
