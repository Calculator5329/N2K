# Overnight bake driver: runs the arity-4 commons bake, waits for it
# to finish cleanly, then chains the arity-5 commons bake.
#
# Why a wrapper instead of `Start-Job`-ing both: arity-5 sweeps are
# CPU-heavy and would compete with arity-4's worker pool for cores.
# Sequential = each bake gets the full machine and finishes faster.
#
# Logs:
#   bake-logs/aether-arity4-commons.log   (already started)
#   bake-logs/aether-arity5-commons.log   (created here)
#
# Inspect live:
#   Get-Content -Wait bake-logs/aether-arity5-commons.log
#
# This script is called with the arity-4 PID so it can poll exit;
# usage:
#   .\scripts\bake-overnight.ps1 -Arity4Pid <pid>
param(
    [Parameter(Mandatory=$true)] [int]$Arity4Pid
)

Set-Location $PSScriptRoot\..

Write-Host "[overnight] Waiting for arity-4 bake (pid=$Arity4Pid) to finish..."
try {
    Wait-Process -Id $Arity4Pid -ErrorAction Stop
    Write-Host "[overnight] arity-4 bake exited."
} catch {
    Write-Host "[overnight] arity-4 process $Arity4Pid not found (already done?). Continuing."
}

# Sanity check: did arity-4 actually produce the file?
$arity4Out = "web/public/data/aether-arity4-commons.n2k"
if (-not (Test-Path $arity4Out)) {
    Write-Host "[overnight] WARNING: arity-4 output $arity4Out missing. Aborting arity-5 chain."
    exit 1
}
$arity4Size = (Get-Item $arity4Out).Length
Write-Host "[overnight] arity-4 file ok: $arity4Size bytes."

# Kick off arity-5. tee output so a tail-reader can follow it.
"Bake started: $(Get-Date -Format o)" | Out-File -FilePath bake-logs/aether-arity5-commons.log -Encoding utf8
Write-Host "[overnight] Starting arity-5 commons bake..."
npx tsx scripts/bake-blob.ts --mode aether --arity 5 --legality commons --out ./web/public/data 2>&1 |
    Tee-Object -FilePath bake-logs/aether-arity5-commons.log -Append

Write-Host "[overnight] arity-5 bake finished. Exit code: $LASTEXITCODE"
