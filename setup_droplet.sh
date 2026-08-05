#!/bin/bash
# ============================================================
# HoneypotAI — Full Droplet Setup Script
# Run this once on a fresh Ubuntu 22.04 DigitalOcean droplet
# Usage: bash setup_droplet.sh
# ============================================================

set -e

echo "=== [1/8] Updating system packages ==="
apt-get update -qq && apt-get upgrade -y -qq

echo "=== [2/8] Installing Python 3.11, pip, venv ==="
apt-get install -y python3.11 python3.11-venv python3-pip git curl -qq

echo "=== [3/8] Creating app directories ==="
mkdir -p /opt/honeypotai/backend
mkdir -p /opt/honeypotai/aisystem

echo "=== [4/8] Creating Python virtual environment for backend ==="
python3.11 -m venv /opt/honeypotai/backend/venv

echo "=== [5/8] Creating Python virtual environment for aisystem ==="
python3.11 -m venv /opt/honeypotai/aisystem/venv

echo "=== [6/8] Installing backend dependencies ==="
/opt/honeypotai/backend/venv/bin/pip install --quiet \
    fastapi uvicorn pydantic pydantic-settings psycopg psycopg-binary \
    python-multipart python-dateutil psutil aiofiles

echo "=== [7/8] Installing AI system dependencies ==="
/opt/honeypotai/aisystem/venv/bin/pip install --quiet \
    pandas scikit-learn numpy

echo "=== [8/8] Setting up systemd service ==="
cat > /etc/systemd/system/honeypotai-backend.service << 'EOF'
[Unit]
Description=HoneypotAI Backend (FastAPI)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/honeypotai/backend
EnvironmentFile=/opt/honeypotai/backend/.env
ExecStart=/opt/honeypotai/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=honeypotai-backend

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable honeypotai-backend

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Upload your backend code to /opt/honeypotai/backend/"
echo "  2. Create /opt/honeypotai/backend/.env with your DATABASE_URL"
echo "  3. Run: systemctl start honeypotai-backend"
echo "  4. Check: systemctl status honeypotai-backend"
echo "  5. Logs: journalctl -u honeypotai-backend -f"
echo ""
echo "  API will be available at: http://$(curl -s ifconfig.me):8000"
