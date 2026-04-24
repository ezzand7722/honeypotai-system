param(
    [string]$BackendUrl = "http://127.0.0.1:8000",
    [string]$SharedSecret = "",
    [string]$LogFile = "G:\college project\proj\dahua_logs (1).json",
    [int]$DelayMs = 1000,
    [int]$MaxRecords = 0,
    [switch]$ForceHighThreat
)

if ([string]::IsNullOrWhiteSpace($SharedSecret)) {
    if (-not [string]::IsNullOrWhiteSpace($env:HONEYPOT_SHARED_SECRET)) {
        $SharedSecret = $env:HONEYPOT_SHARED_SECRET
    }
    else {
        $SharedSecret = "default-shared-secret"
    }
}

if (-not (Test-Path -Path $LogFile)) {
    Write-Error "Log file not found: $LogFile"
    exit 1
}

$headers = @{ "X-Shared-Secret" = $SharedSecret }
$sent = 0
$ipGroups = @(
        @('51.140.79.9','51.141.10.4','51.142.33.10','51.143.120.2','51.140.12.55',
            '51.145.99.20','51.140.221.45','51.141.87.19','51.142.5.200','51.143.18.70',
            '35.176.12.44','35.179.70.8','18.130.12.1','18.132.44.6','3.8.5.120'), # UK (15)
        @('34.201.32.1','34.228.1.9','34.239.7.10','54.147.22.40','52.207.88.12',
            '44.192.10.2','35.171.0.5','44.213.77.66','52.15.1.99','18.216.5.44',
            '18.221.15.7','3.91.120.4','52.90.33.1','3.12.155.7','54.67.32.9'),       # US (15)
        @('178.154.243.2','92.53.96.10','89.111.176.5','31.31.198.14','188.93.210.2',
            '95.213.200.20','5.45.112.10','95.142.40.12','188.225.24.1','185.71.76.20',
            '46.17.44.8','195.19.96.3','185.10.60.9','91.226.50.11','89.169.90.4'),     # Russia (15)
        @('84.235.77.10','188.54.32.2','213.181.74.5','212.119.64.9','46.52.120.7')   # Saudi Arabia (5)
)
$sessionIpMap = @{}

Get-Content -Path $LogFile | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) {
        return
    }

    try {
        $raw = $line | ConvertFrom-Json
    }
    catch {
        return
    }

    $attackId = if ($raw.uuid) { [string]$raw.uuid } elseif ($raw.session) { [string]$raw.session } else { "line-$($sent + 1)" }
    $srcIp = if ($raw.src_ip) { [string]$raw.src_ip } elseif ($raw.source_ip) { [string]$raw.source_ip } else { "127.0.0.1" }
    $dstIp = if ($raw.dst_ip) { [string]$raw.dst_ip } elseif ($raw.destination_ip) { [string]$raw.destination_ip } else { "127.0.0.1" }
    $dstPort = if ($raw.dst_port) { [int]$raw.dst_port } elseif ($raw.destination_port) { [int]$raw.destination_port } else { 0 }
    if ($ForceHighThreat) {
        $dstPort = 22
    }

    if ($srcIp -match '^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)' -or $srcIp -eq '::1') {
        if (-not $sessionIpMap.ContainsKey($attackId)) {
            $blockIndex = [math]::Floor($sent / 15)
            $group = $ipGroups[$blockIndex % $ipGroups.Count]
            $sessionIpMap[$attackId] = $group[$sent % $group.Count]
        }
        $srcIp = $sessionIpMap[$attackId]
    }
    $attackVector = if ($raw.eventid) { [string]$raw.eventid } elseif ($raw.attack_vector) { [string]$raw.attack_vector } elseif ($raw.protocol) { [string]$raw.protocol } else { "unknown" }

    $payloadValue = $null
    if ($raw.payload) { $payloadValue = [string]$raw.payload }
    elseif ($raw.message) { $payloadValue = [string]$raw.message }
    elseif ($raw.input) { $payloadValue = [string]$raw.input }

    $metadata = @{}
    foreach ($prop in $raw.PSObject.Properties) {
        $metadata[$prop.Name] = $prop.Value
    }
    $metadata["replay_mode"] = "live_stream"
    $metadata["replayed_at"] = (Get-Date).ToString("o")

    $eventPayload = @{
        attack_id = $attackId
        timestamp = (Get-Date).ToString("o")
        source_ip = $srcIp
        destination_ip = $dstIp
        destination_port = $dstPort
        attack_vector = $attackVector
        metadata = $metadata
        payload = $payloadValue
    }

    try {
        $response = Invoke-RestMethod -Method Post -Uri "$BackendUrl/honeypot/events" -Headers $headers -ContentType "application/json" -Body ($eventPayload | ConvertTo-Json -Depth 20)
        $sent += 1
        Write-Output "[$sent] sent event_id=$($response.event_id) vector=$attackVector src=$srcIp"
    }
    catch {
        Write-Warning "Failed to send record #$($sent + 1): $($_.Exception.Message)"
    }

    if ($MaxRecords -gt 0 -and $sent -ge $MaxRecords) {
        break
    }

    Start-Sleep -Milliseconds $DelayMs
}

Write-Output "Replay complete. Total sent: $sent"
