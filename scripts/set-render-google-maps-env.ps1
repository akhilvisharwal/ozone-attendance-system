# Sets GOOGLE_MAPS_API_KEY and GEOCODE_PROVIDER on the Render API service.
# Requires RENDER_API_KEY (from Render Dashboard -> Account Settings -> API Keys).
#
# Usage:
#   $env:RENDER_API_KEY = "rnd_..."
#   .\scripts\set-render-google-maps-env.ps1

$ErrorActionPreference = "Stop"

$ServiceId = "srv-d9699358nd3s73b2hiag"
$ApiBase = "https://api.render.com/v1/services/$ServiceId"
$EnvFile = Join-Path $PSScriptRoot "..\backend\.env"

if (-not $env:RENDER_API_KEY) {
  Write-Error "Set RENDER_API_KEY first (Render Dashboard -> Account Settings -> API Keys)."
}

if (-not (Test-Path $EnvFile)) {
  Write-Error "Missing backend/.env — create it from backend/.env.example and set GOOGLE_MAPS_API_KEY."
}

$mapsKey = ""
Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*GOOGLE_MAPS_API_KEY\s*=\s*(.+)\s*$') {
    $mapsKey = $Matches[1].Trim().Trim('"').Trim("'")
  }
}

if (-not $mapsKey) {
  Write-Error "GOOGLE_MAPS_API_KEY is not set in backend/.env"
}

$headers = @{
  Authorization = "Bearer $($env:RENDER_API_KEY)"
  Accept        = "application/json"
  "Content-Type" = "application/json"
}

function Set-RenderEnvVar {
  param([string]$Key, [string]$Value)
  $uri = "$ApiBase/env-vars/$Key"
  $body = @{ value = $Value } | ConvertTo-Json
  Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -Body $body | Out-Null
  Write-Host "Set $Key"
}

Set-RenderEnvVar -Key "GOOGLE_MAPS_API_KEY" -Value $mapsKey
Set-RenderEnvVar -Key "GEOCODE_PROVIDER" -Value "google"

Write-Host "Triggering deploy..."
$deploy = Invoke-RestMethod -Method Post -Uri "$ApiBase/deploys" -Headers $headers -Body "{}" -ContentType "application/json"
Write-Host "Deploy started: $($deploy.id)"
Write-Host "Done. Maps key will be active after deploy completes (~2-3 min)."
