param(
    [string]$DumpPath = "C:\Users\N's Smart\Downloads\teachassist_data_20260616_183900.sql",
    [string]$DatabaseName = "teachassist",
    [string]$DbUser = "postgres",
    [string]$DbHost = "127.0.0.1",
    [int]$DbPort = 5432,
    [string]$Password = $env:PGPASSWORD,
    [switch]$Reset
)

$ErrorActionPreference = "Stop"

function Find-PostgresTool($name) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $standardPath = "C:\Program Files\PostgreSQL\18\bin\$name.exe"
    if (Test-Path $standardPath) {
        return $standardPath
    }

    $found = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Recurse -Filter "$name.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName

    if (!$found) {
        throw "$name.exe was not found. Add PostgreSQL bin to PATH or install PostgreSQL command-line tools."
    }

    return $found
}

if (!(Test-Path $DumpPath)) {
    throw "Dump file not found: $DumpPath"
}

$psql = Find-PostgresTool "psql"
$backendDir = Join-Path $PSScriptRoot "backend"
$python = Join-Path $backendDir ".venv\Scripts\python.exe"

if (!(Test-Path $python)) {
    throw "Backend virtual environment was not found. Run .\start-backend.ps1 once first, then rerun this restore script."
}

if ($Password) {
    $plainPassword = $Password
}
else {
    $securePassword = Read-Host "PostgreSQL password for user '$DbUser'" -AsSecureString
    $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
}

$env:PGPASSWORD = $plainPassword
$databaseUrl = "postgresql://${DbUser}:${plainPassword}@${DbHost}:${DbPort}/${DatabaseName}"

Write-Host "Checking PostgreSQL connection..."
& $psql -h $DbHost -p $DbPort -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c "SELECT 1;" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Could not connect to PostgreSQL."
}

if ($Reset) {
    Write-Host "Resetting database '$DatabaseName'..."
    & $psql -h $DbHost -p $DbPort -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DatabaseName' AND pid <> pg_backend_pid();" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not terminate existing database connections."
    }
    & $psql -h $DbHost -p $DbPort -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DatabaseName;" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not drop database '$DatabaseName'."
    }
}

Write-Host "Creating database '$DatabaseName' if needed..."
$databaseExists = & $psql -h $DbHost -p $DbPort -U $DbUser -d postgres -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName';"
if ($LASTEXITCODE -ne 0) {
    throw "Could not check whether database '$DatabaseName' exists."
}
if (($databaseExists -as [string]).Trim() -ne "1") {
    & $psql -h $DbHost -p $DbPort -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DatabaseName;" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create database '$DatabaseName'."
    }
}

$envPath = Join-Path $backendDir ".env"
$existing = @{}
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
            $existing[$matches[1].Trim()] = $matches[2]
        }
    }
}

$existing["DATABASE_URL"] = $databaseUrl
if (!$existing.ContainsKey("ALLOWED_ORIGINS")) {
    $existing["ALLOWED_ORIGINS"] = "http://localhost:4200,http://127.0.0.1:4200"
}

$envLines = @(
    "DATABASE_URL=$($existing["DATABASE_URL"])",
    "GROQ_API_KEY=$($existing["GROQ_API_KEY"])",
    "GEMINI_API_KEY=$($existing["GEMINI_API_KEY"])",
    "ALLOWED_ORIGINS=$($existing["ALLOWED_ORIGINS"])"
)
Set-Content -Path $envPath -Value $envLines

Write-Host "Creating TeachAssist schema from the backend models..."
Push-Location $backendDir
try {
    $env:DATABASE_URL = $databaseUrl
    & $python -c "from app.main import app; print('schema ready')"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create TeachAssist schema."
    }
}
finally {
    Pop-Location
}

Write-Host "Importing dump data..."
& $psql -h $DbHost -p $DbPort -U $DbUser -d $DatabaseName -v ON_ERROR_STOP=1 -f $DumpPath
if ($LASTEXITCODE -ne 0) {
    throw "Could not import dump data."
}

Write-Host ""
Write-Host "PostgreSQL restore complete."
Write-Host "Backend now points to: postgresql://${DbUser}:***@${DbHost}:${DbPort}/${DatabaseName}"
Write-Host "Start backend:  powershell -ExecutionPolicy Bypass -File .\start-backend.ps1"
Write-Host "Start frontend: powershell -ExecutionPolicy Bypass -File .\start-frontend.ps1"
