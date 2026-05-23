#!/usr/bin/env pwsh

param(
  [string]$BaseUrl = "http://206.189.62.245:8000",
  [string]$Secret = "default-shared-secret",
  [Parameter(Mandatory=$true)][string]$FilePath,
  [int]$ChunkSize = 25
)

if (-not (Test-Path -LiteralPath $FilePath)) {
  throw "File not found: $FilePath"
}

$body = Get-Content -Raw -LiteralPath $FilePath

Write-Host "Replaying JSONL via /honeypot/events/batch" -ForegroundColor Cyan
Write-Host "BaseUrl: $BaseUrl" -ForegroundColor DarkGray
Write-Host "File: $FilePath" -ForegroundColor DarkGray

$resp = Invoke-RestMethod -Uri "$BaseUrl/honeypot/events/batch?chunk_size=$ChunkSize" `
  -Method POST `
  -Headers @{ 'X-Shared-Secret' = $Secret; 'Cache-Control'='no-store' } `
  -ContentType "text/plain" `
  -Body $body

"status=$($resp.status) pipeline_id=$($resp.pipeline_id) events_received=$($resp.events_received) chunks_queued=$($resp.chunks_queued) format=$($resp.format)"

if ($resp.pipeline_id) {
  Write-Host "\nPipeline status:" -ForegroundColor Yellow
  try {
    $p = Invoke-RestMethod -Uri "$BaseUrl/report/pipelines/$($resp.pipeline_id)?_t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Headers @{ 'Cache-Control'='no-store' }
    $p | ConvertTo-Json -Depth 6
  } catch {
    Write-Host "Could not fetch pipeline status: $($_)" -ForegroundColor DarkYellow
  }
}
