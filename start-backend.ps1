$ErrorActionPreference = "Stop"

$backendDir = Join-Path $PSScriptRoot "backend"
$python = Join-Path $backendDir ".venv\Scripts\python.exe"

if (!(Test-Path $python)) {
    $systemPython = Get-Command python -ErrorAction SilentlyContinue
    if (!$systemPython) {
        throw "Python was not found. Install Python 3.11+ or create backend\.venv first."
    }

    Push-Location $backendDir
    try {
        & $systemPython.Source -m venv .venv
        & $python -m pip install -r requirements.txt
    }
    finally {
        Pop-Location
    }
}

Push-Location $backendDir
try {
    & $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
}
finally {
    Pop-Location
}
