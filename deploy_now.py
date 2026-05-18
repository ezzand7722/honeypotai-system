"""
Quick deploy script for the honeypot AI system.
Uses subprocess with native ssh to avoid paramiko key issues.
"""
import subprocess
import sys
import time

HOST = "206.189.62.245"
USER = "root"
KEY_PATH = r"C:\Users\Administrator\.ssh\do_honeypot_ed25519"

DEPLOY_COMMANDS = """
set -e
echo "=== Pulling latest code from GitHub ==="
cd /root/honeypotai-system
git stash 2>/dev/null || true
git pull origin main

echo "=== Installing AI system requirements ==="
cd /root/honeypotai-system/aisystem
if [ -d "venv" ]; then
    source venv/bin/activate
    pip install -r requirements.txt --quiet 2>&1 | tail -n 5
else
    echo "No venv found in aisystem, skipping pip install"
fi

echo "=== Stopping old backend process ==="
pkill -f uvicorn || true
sleep 2

echo "=== Starting backend service ==="
cd /root/honeypotai-system/backend
if [ -d "venv" ]; then
    source venv/bin/activate
fi
pip install psutil --quiet
nohup python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &

echo "=== Waiting for server to start ==="
sleep 4

echo "=== Server logs ==="
tail -n 20 /root/honeypotai-system/backend/server.log

echo ""
echo "=== Deployment completed successfully! ==="
"""

def main():
    print(f"Deploying to {USER}@{HOST}...")
    print("NOTE: You may be prompted for your SSH key passphrase in a popup window.")
    print()

    result = subprocess.run(
        [
            "ssh",
            "-i", KEY_PATH,
            "-o", "StrictHostKeyChecking=no",
            "-o", "ConnectTimeout=10",
            f"{USER}@{HOST}",
            DEPLOY_COMMANDS
        ],
        capture_output=False,  # Show output in real-time
        text=True
    )

    if result.returncode == 0:
        print("\n✅ Deployment successful!")
    else:
        print(f"\n❌ Deployment failed with exit code {result.returncode}")
        sys.exit(1)

if __name__ == "__main__":
    main()
