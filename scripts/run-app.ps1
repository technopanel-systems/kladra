# Makes sure Kladra is reachable at http://localhost:3100: Docker Desktop up,
# the db container healthy, and the app container serving the current image
# on 3100. Safe to re-run any time; it checks each step and fixes what's off.
#
# FACET runs on the same PC on 3000 / 5432. This script never touches it.

$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Write-Step($msg) { Write-Host "-> $msg" }
function Run-Quiet($exe, $argList) {
    try { & $exe @argList *>$null 2>&1 } catch {}
}

# 1. Docker Desktop
try { docker info *>$null 2>&1 } catch {}
if ($LASTEXITCODE -ne 0) {
    Write-Step "Docker is down - starting Docker Desktop..."
    Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    do {
        Start-Sleep -Seconds 2
        try { docker info *>$null 2>&1 } catch {}
    } while ($LASTEXITCODE -ne 0)
    Write-Step "Docker is up."
} else {
    Write-Step "Docker already up."
}

# 2. db container healthy
Run-Quiet "docker" @("compose", "-p", "kladra", "up", "-d", "db")
do {
    Start-Sleep -Seconds 2
    $health = & docker inspect kladra-db-1 --format '{{.State.Health.Status}}' 2>$null
} while ($health -ne "healthy")
Write-Step "db container healthy."

# 3. app container up (rebuilds the image if the source changed)
Run-Quiet "docker" @("compose", "-p", "kladra", "up", "-d", "--build", "app")
Write-Step "app container started."

# 4. wait for health on 3100
$deadline = (Get-Date).AddSeconds(90)
do {
    Start-Sleep -Seconds 2
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3100/api/health" -UseBasicParsing -TimeoutSec 3
        $ok = $resp.StatusCode -eq 200
    } catch { $ok = $false }
} until ($ok -or (Get-Date) -gt $deadline)

# 5. final check
if ($ok) {
    Write-Host ""
    Write-Host "Kladra is running: http://localhost:3100  (health $($resp.StatusCode))" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Kladra did NOT come up - run: docker compose -p kladra logs app" -ForegroundColor Red
    exit 1
}
