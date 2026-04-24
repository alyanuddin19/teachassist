# ExamForge - Startup Script (PowerShell)
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║        ExamForge - AI Exam Generator  ║" -ForegroundColor Cyan
Write-Host "  ╚═══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
$envFile = "$PSScriptRoot\backend\.env"
if (-not (Test-Path $envFile)) {
    Write-Host "  [!] .env file not found. Creating from example..." -ForegroundColor Yellow
    Copy-Item "$PSScriptRoot\backend\.env.example" $envFile
    Write-Host "  [!] Please set your GEMINI_API_KEY in backend\.env" -ForegroundColor Yellow
    Write-Host ""
}

# Load .env
Get-Content $envFile | ForEach-Object {
    if ($_ -match "^([^#][^=]*)=(.*)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

# Check Python
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  [✓] $pythonVersion detected" -ForegroundColor Green
} catch {
    Write-Host "  [✗] Python not found. Please install Python 3.9+" -ForegroundColor Red
    exit 1
}

# Install dependencies if needed
$requirementsPath = "$PSScriptRoot\backend\requirements.txt"
Write-Host ""
Write-Host "  [→] Installing/checking dependencies..." -ForegroundColor Cyan
pip install -r $requirementsPath -q

Write-Host "  [✓] Dependencies ready" -ForegroundColor Green
Write-Host ""
Write-Host "  [→] Starting Flask server on http://localhost:5000" -ForegroundColor Cyan
Write-Host "  [→] Open http://localhost:5000 in your browser" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

# Start Flask
Set-Location "$PSScriptRoot\backend"
python app.py
