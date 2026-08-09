$ErrorActionPreference = "Stop"

$frontendDir = Join-Path $PSScriptRoot "frontendd"
$portableNodeDir = Join-Path $PSScriptRoot ".tools\node-v20.19.5-win-x64"
$npm = Join-Path $portableNodeDir "npm.cmd"

if (Test-Path $npm) {
    $env:PATH = "$portableNodeDir;$env:PATH"
}
else {
    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
    if (!$npmCommand) {
        throw "npm was not found. Install Node.js 20+ or keep the portable Node runtime in .tools."
    }
    $npm = $npmCommand.Source
}

Push-Location $frontendDir
try {
    if (!(Test-Path "node_modules")) {
        & $npm ci --cache (Join-Path $PSScriptRoot ".npm-cache")
    }

    & $npm start -- --host 127.0.0.1 --port 4200
}
finally {
    Pop-Location
}
