$ErrorActionPreference = "Stop"

$backendDir = Join-Path $PSScriptRoot "backend"
$frontendDir = Join-Path $PSScriptRoot "frontendd"
$python = Join-Path $backendDir ".venv\Scripts\python.exe"
$portableNodeDir = Join-Path $PSScriptRoot ".tools\node-v20.19.5-win-x64"
$npm = Join-Path $portableNodeDir "npm.cmd"

if (!(Test-Path $python)) {
    throw "Backend virtual environment not found. Run .\start-backend.ps1 once first."
}

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

Write-Host "Checking backend..."
Push-Location $backendDir
try {
    & $python -c "from app.main import app; print('backend ok')"
    if ($LASTEXITCODE -ne 0) {
        throw "Backend check failed."
    }
}
finally {
    Pop-Location
}

Write-Host "Building frontend..."
Push-Location $frontendDir
try {
    & $npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed."
    }
}
finally {
    Pop-Location
}

Write-Host "Local verification passed."
