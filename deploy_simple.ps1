#!/usr/bin/env pwsh

$host_ip = "206.189.62.245"
$user = "root"
$key_path = "$env:USERPROFILE\.ssh\do_honeypot_ed25519"
$passphrase = "00pp99oo@"

Write-Host "Deploying to DigitalOcean droplet..."
Write-Host "Host: $host_ip"
Write-Host "User: $user"

# Use ssh-keyscan to add host key to known_hosts (non-interactive)
Write-Host "Adding host to known_hosts..."
ssh-keyscan -t ed25519 $host_ip 2>&1 | Out-Null

# Create a temporary script to run on the server
$deploy_cmds = @"
set -e
echo "Pulling latest code from GitHub..."
cd /root/honeypotai-system
git stash
git pull origin main

echo "Stopping old backend process..."
pkill -f uvicorn || true
sleep 2

echo "Starting backend service..."
cd /root/honeypotai-system/backend
source venv/bin/activate
nohup python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &

echo "Waiting for server to start..."
sleep 4

echo "Fetching server logs..."
tail -n 20 server.log

echo "Deployment completed!"
"@

Write-Host "Executing deployment commands..."
echo $deploy_cmds | ssh -i $key_path $user@$host_ip "bash"

Write-Host "Done!"
