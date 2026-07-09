"""
Quick deploy script for the honeypot AI system.
Uses subprocess with native ssh to avoid paramiko key issues.
"""
import os
import subprocess
import sys

HOST = "206.189.62.245"
USER = "root"
KEY_PATH = os.path.expanduser(r"~/.ssh/do_honeypot_ed25519_nopass")

DEPLOY_COMMANDS = """
set -e

echo "=== Pulling latest code from GitHub ==="
cd /root/honeypotai-system
git stash 2>/dev/null || true
git pull origin main

echo "=== (Optional) Installing AI system requirements (non-fatal) ==="
set +e
cd /root/honeypotai-system/aisystem
if [ -d "venv" ]; then
    . venv/bin/activate
    (python3 -m pip install -r requirements.txt --quiet 2>&1 || true) | tail -n 15
else
    echo "No venv found in aisystem, skipping pip install"
fi
set -e

echo "=== Stopping old backend process ==="
PIDS=$(pgrep -f "uvicorn" 2>/dev/null || true)
for PID in $PIDS; do
    if [ "$PID" != "$$" ]; then
        kill "$PID" 2>/dev/null || true
    fi
done
sleep 2

echo "=== Preparing backend virtualenv ==="
cd /root/honeypotai-system/backend
if [ -d "venv" ]; then
    VENV_DIR="venv"
elif [ -d ".venv" ]; then
    VENV_DIR=".venv"
else
    VENV_DIR="venv"
    python3 -m venv "$VENV_DIR" || python -m venv "$VENV_DIR"
fi

. "$VENV_DIR/bin/activate"

echo "=== Installing backend deps (inside venv) ==="
python -m pip install --upgrade pip --quiet
if [ -f "requirements.txt" ]; then
    python -m pip install -r requirements.txt --quiet 2>&1 | tail -n 15
fi
python -m pip install psutil --quiet

echo "=== Starting backend service ==="
nohup python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &

echo "=== Waiting for server to start ==="
sleep 4

echo "=== Server logs ==="
tail -n 30 /root/honeypotai-system/backend/server.log

echo ""
echo "=== Deployment completed successfully! ==="
"""

def main():
    print(f"Deploying to {USER}@{HOST}...")
    print("NOTE: If this key is passphrase-protected, you may be prompted for it.")
    print("TIP: To avoid prompts, start ssh-agent and run: ssh-add <key>")
    print()

    ssh_args = [
        "ssh",
        "-i",
        KEY_PATH,
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "PreferredAuthentications=publickey",
        "-o",
        "PubkeyAuthentication=yes",
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ServerAliveCountMax=3",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "ConnectTimeout=10",
    ]

    if os.environ.get("DEPLOY_SSH_VERBOSE"):
        ssh_args.append("-vvv")

    result = subprocess.run(
        [
            *ssh_args,
            f"{USER}@{HOST}",
            DEPLOY_COMMANDS,
        ],
        capture_output=False,  # Show output in real-time
        text=True
    )

    if result.returncode == 0:
        print("\n✅ Deployment successful!")
    else:
        print(f"\n❌ Deployment failed with exit code {result.returncode}")
        if result.returncode == 255:
            print("\nCommon causes for exit code 255:")
            print("- SSH key passphrase prompt could not be satisfied")
            print("- Wrong key/user, or server MaxAuthTries hit")
            print("- Firewall/security group blocks SSH")
            print("\nTry:")
            print(f"  ssh -i \"{KEY_PATH}\" -o IdentitiesOnly=yes {USER}@{HOST} \"echo ok\"")
            print("  (If prompted, enter passphrase; if it works, rerun deploy.)")
        sys.exit(1)

if __name__ == "__main__":
    main()
