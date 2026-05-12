param(
    [string]$RootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$buildScript = Join-Path $RootPath "build.mjs"
if (-not (Test-Path -LiteralPath $buildScript)) { throw "Missing file: $buildScript" }

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js is required. Install from https://nodejs.org then run: npm run build"
}

Push-Location $RootPath
try {
    & node $buildScript
    if ($LASTEXITCODE -ne 0) { throw "build.mjs failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}
