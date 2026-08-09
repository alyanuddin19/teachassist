param(
    [string]$DatabaseName = "teachassist",
    [string]$DbUser = "postgres",
    [string]$DbHost = "127.0.0.1",
    [int]$DbPort = 5432,
    [string]$Password = $env:PGPASSWORD,
    [string]$OutputDir = "backups"
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

if (!$Password) {
    $securePassword = Read-Host "PostgreSQL password for user '$DbUser'" -AsSecureString
    $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
}

$pgDump = Find-PostgresTool "pg_dump"
$backupDir = Join-Path $PSScriptRoot $OutputDir
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outputPath = Join-Path $backupDir "${DatabaseName}_${timestamp}.sql"

$env:PGPASSWORD = $Password
& $pgDump -h $DbHost -p $DbPort -U $DbUser -d $DatabaseName --format=plain --no-owner --no-privileges --file $outputPath
if ($LASTEXITCODE -ne 0) {
    throw "Backup failed."
}

Write-Host "Backup created: $outputPath"
