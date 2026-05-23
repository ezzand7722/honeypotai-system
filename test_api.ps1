#!/usr/bin/env pwsh

# Test script for honeypot API endpoints
$baseUrl = "http://206.189.62.245:8000"
$secret = "default-shared-secret"
$dataFile = "g:\college project\proj\dahua_logs (1).json"

Write-Host "=== Testing Honeypot API Endpoints ===" -ForegroundColor Cyan

# Test 1: Health check
Write-Host "`n[1] Testing /health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "✓ Health check passed: $($health.Content)" -ForegroundColor Green
} catch {
    Write-Host "✗ Health check failed: $($_)" -ForegroundColor Red
    exit 1
}

# Test 2: Single event
Write-Host "`n[2] Testing single event upload..." -ForegroundColor Yellow
$singleEvent = @{
    eventid = "test.event"
    src_ip = "192.168.1.100"
    dst_ip = "127.0.0.1"
    dst_port = 22
    protocol = "ssh"
    message = "Test event"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
}

try {
    $singleResp = Invoke-WebRequest -Uri "$baseUrl/honeypot/events" `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{"X-Shared-Secret" = $secret} `
        -Body (ConvertTo-Json $singleEvent) `
        -UseBasicParsing -TimeoutSec 5
    Write-Host "✓ Single event uploaded: $($singleResp.Content)" -ForegroundColor Green
} catch {
    Write-Host "✗ Single event failed: $($_)" -ForegroundColor Red
}

# Test 3: Batch events (correct format - JSON array)
Write-Host "`n[3] Testing batch event upload (JSON array format)..." -ForegroundColor Yellow
$batchEvents = @(
    @{
        eventid = "cowrie.session.connect"
        src_ip = "192.168.1.101"
        dst_ip = "127.0.0.1"
        dst_port = 2222
        protocol = "ssh"
        message = "Test connection"
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
    },
    @{
        eventid = "cowrie.login.success"
        src_ip = "192.168.1.102"
        dst_ip = "127.0.0.1"
        dst_port = 2222
        protocol = "ssh"
        username = "testuser"
        password = "testpass"
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
    }
)

try {
    $batchResp = Invoke-WebRequest -Uri "$baseUrl/honeypot/events/batch?chunk_size=25" `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{"X-Shared-Secret" = $secret} `
        -Body (ConvertTo-Json $batchEvents) `
        -UseBasicParsing -TimeoutSec 5
    Write-Host "✓ Batch events uploaded: $($batchResp.Content)" -ForegroundColor Green
} catch {
    Write-Host "✗ Batch events failed: $($_)" -ForegroundColor Red
}

# Test 4: File upload
Write-Host "`n[4] Testing file upload endpoint..." -ForegroundColor Yellow
if (Test-Path $dataFile) {
    $iwrSupportsForm = $false
    try { $iwrSupportsForm = (Get-Command Invoke-WebRequest).Parameters.ContainsKey('Form') } catch { $iwrSupportsForm = $false }

    if ($iwrSupportsForm) {
        try {
            $form = @{
                file = Get-Item $dataFile
                chunk_size = 25
                max_records = 10
            }
            
            $fileResp = Invoke-WebRequest -Uri "$baseUrl/honeypot/events/from-file" `
                -Method POST `
                -Headers @{"X-Shared-Secret" = $secret} `
                -Form $form `
                -UseBasicParsing -TimeoutSec 20
            Write-Host "✓ File uploaded: $($fileResp.Content)" -ForegroundColor Green
        }
        catch {
            Write-Host "✗ File upload failed: $($_)" -ForegroundColor Red
            if ($_.Exception.Response) {
                Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
            }
        }
    }
    elseif (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        Write-Host "(Invoke-WebRequest -Form not available; using curl.exe multipart upload)" -ForegroundColor DarkYellow
        $cmd = @(
            "curl.exe",
            "-sS",
            "-X", "POST",
            "-H", "X-Shared-Secret: $secret",
            "-F", "file=@$dataFile",
            "-F", "chunk_size=25",
            "-F", "max_records=10",
            "$baseUrl/honeypot/events/from-file"
        )
        try {
            $out = & $cmd[0] $cmd[1..($cmd.Length-1)]
            Write-Host "✓ File uploaded: $out" -ForegroundColor Green
        } catch {
            Write-Host "✗ curl.exe upload failed: $($_)" -ForegroundColor Red
        }
    }
    else {
        Write-Host "(No -Form support and curl.exe not found. Falling back to /honeypot/events/batch JSONL replay.)" -ForegroundColor DarkYellow
        try {
            $body = Get-Content -Raw -LiteralPath $dataFile
            $batchResp = Invoke-WebRequest -Uri "$baseUrl/honeypot/events/batch?chunk_size=25" `
                -Method POST `
                -ContentType "text/plain" `
                -Headers @{"X-Shared-Secret" = $secret} `
                -Body $body `
                -UseBasicParsing -TimeoutSec 30
            Write-Host "✓ Batch replay accepted: $($batchResp.Content)" -ForegroundColor Green
        } catch {
            Write-Host "✗ Batch replay failed: $($_)" -ForegroundColor Red
        }
    }
}
else {
    Write-Host "⚠ Data file not found at $dataFile" -ForegroundColor Yellow
}

Write-Host "`n=== Tests Complete ===" -ForegroundColor Cyan
