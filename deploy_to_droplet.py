#!/usr/bin/env python3
"""
deploy_to_droplet.py
====================
Deploys the HoneypotAI backend to the DigitalOcean droplet via SSH/SCP.

Usage:
    python deploy_to_droplet.py --host 206.189.62.245 --key ~/.ssh/id_rsa

Requirements:
    pip install paramiko scp
"""
import argparse
import os
import sys
import tarfile
import tempfile
from pathlib import Path

try:
    import paramiko
    from scp import SCPClient
except ImportError:
    print("Install deps first: pip install paramiko scp")
    sys.exit(1)

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
AI_DIR = ROOT / "aisystem"

# Files / dirs to include in the backend tarball
BACKEND_INCLUDE = [
    "app", "requirements.txt", ".env",
]

# Files / dirs to include in the aisystem tarball
AI_INCLUDE = [
    "ai_v2.py", "requirements.txt",
]

REMOTE_BASE = "/opt/honeypotai"
REMOTE_BACKEND = f"{REMOTE_BASE}/backend"
REMOTE_AI = f"{REMOTE_BASE}/aisystem"


def make_tarball(src_dir: Path, includes: list[str], output: Path) -> None:
    with tarfile.open(output, "w:gz") as tar:
        for name in includes:
            full = src_dir / name
            if full.exists():
                tar.add(full, arcname=name)
            else:
                print(f"  [WARN] {full} not found, skipping")


def run_remote(ssh: paramiko.SSHClient, cmd: str) -> None:
    print(f"  $ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print(f"    {out.strip()}")
    if err:
        print(f"    [stderr] {err.strip()}")


def deploy(host: str, user: str, key_file: str | None, password: str | None) -> None:
    print(f"\n🚀 Deploying to {user}@{host} …\n")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connect_kwargs: dict = {"hostname": host, "username": user, "timeout": 30}
    if key_file:
        connect_kwargs["key_filename"] = key_file
    elif password:
        connect_kwargs["password"] = password
    else:
        raise ValueError("Provide --key or --password")

    ssh.connect(**connect_kwargs)

    with tempfile.TemporaryDirectory() as tmp:
        # 1. Build tarballs
        backend_tar = Path(tmp) / "backend.tar.gz"
        ai_tar = Path(tmp) / "aisystem.tar.gz"
        print("📦 Building tarballs …")
        make_tarball(BACKEND_DIR, BACKEND_INCLUDE, backend_tar)
        make_tarball(AI_DIR, AI_INCLUDE, ai_tar)

        # 2. Create remote dirs
        print("📁 Ensuring remote directories …")
        run_remote(ssh, f"mkdir -p {REMOTE_BACKEND} {REMOTE_AI}")

        # 3. Upload
        print("⬆️  Uploading …")
        with SCPClient(ssh.get_transport()) as scp:
            scp.put(str(backend_tar), f"{REMOTE_BACKEND}/backend.tar.gz")
            scp.put(str(ai_tar), f"{REMOTE_AI}/aisystem.tar.gz")

        # 4. Extract
        print("📂 Extracting …")
        run_remote(ssh, f"cd {REMOTE_BACKEND} && tar -xzf backend.tar.gz && rm backend.tar.gz")
        run_remote(ssh, f"cd {REMOTE_AI} && tar -xzf aisystem.tar.gz && rm aisystem.tar.gz")

        # 5. Install Python deps
        print("🐍 Installing Python deps …")
        run_remote(ssh, f"cd {REMOTE_BACKEND} && pip install -r requirements.txt --quiet")
        run_remote(ssh, f"cd {REMOTE_AI} && pip install -r requirements.txt --quiet")

        # 6. Restart backend service
        print("🔄 Restarting backend service …")
        run_remote(ssh, "systemctl restart honeypotai-backend || true")
        run_remote(ssh, "systemctl status honeypotai-backend --no-pager | tail -5 || true")

    ssh.close()
    print("\n✅ Deployment complete!\n")
    print(f"   Backend API:  http://{host}:8000/docs")
    print(f"   Health:       http://{host}:8000/health")
    print(f"   AttackCtx:    http://{host}:8000/ai/attack-context")


def main():
    ap = argparse.ArgumentParser(description="Deploy HoneypotAI to DigitalOcean droplet")
    ap.add_argument("--host", default="206.189.62.245", help="Droplet IP")
    ap.add_argument("--user", default="root", help="SSH user")
    ap.add_argument("--key", default=None, help="Path to SSH private key")
    ap.add_argument("--password", default=None, help="SSH password (less secure)")
    args = ap.parse_args()

    deploy(args.host, args.user, args.key, args.password)


if __name__ == "__main__":
    main()
