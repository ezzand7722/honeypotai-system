import paramiko
import os
import sys

def deploy():
    print("Initializing Paramiko SSH Client...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    key_path = os.environ.get('USERPROFILE') + '\\.ssh\\do_honeypot_ed25519'
    print(f"Loading private SSH key from: {key_path}")
    
    try:
        mykey = paramiko.Ed25519Key.from_private_key_file(key_path, password='00pp99oo@')
    except Exception as e:
        print(f"Failed to load key: {e}")
        sys.exit(1)
        
    try:
        print("Connecting to 206.189.62.245 as root...")
        ssh.connect('206.189.62.245', username='root', pkey=mykey, timeout=10)
        print("Connected successfully!")
    except Exception as e:
        print(f"SSH Connection Failed: {e}")
        sys.exit(1)

    try:
        print("Opening SFTP session...")
        sftp = ssh.open_sftp()
        
        # Files to sync
        local_backend_dir = r"g:\college project\proj\backend\app"
        remote_backend_dir = "/root/honeypotai-system/backend/app"
        
        files_to_sync = [
            ("routers/reporting.py", "routers/reporting.py"),
            ("services/reporting.py", "services/reporting.py"),
            ("main.py", "main.py")
        ]
        
        for local_rel, remote_rel in files_to_sync:
            local_path = os.path.join(local_backend_dir, local_rel).replace('\\', '/')
            remote_path = f"{remote_backend_dir}/{remote_rel}"
            print(f"Uploading {local_path} to {remote_path}...")
            sftp.put(local_path, remote_path)
        
        sftp.close()
        print("All files uploaded successfully.")
        
    except Exception as e:
        print(f"SFTP Upload failed: {e}")
        ssh.close()
        sys.exit(1)

    print("Restarting processes via bash wrapper...")
    ssh.exec_command("systemctl restart backend")
    ssh.exec_command("systemctl restart fastapi")
    
    ssh.exec_command("pkill -f uvicorn")
    import time
    time.sleep(2)
    
    start_cmd = 'bash -c "cd /root/honeypotai-system/backend && source venv/bin/activate && nohup venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &"'
    ssh.exec_command(start_cmd)
    
    time.sleep(4)
    print("Fetching Uvicorn startup logs...")
    time.sleep(2)
    stdin, stdout, stderr = ssh.exec_command("tail -n 30 /root/honeypotai-system/backend/server.log")
    logs = stdout.read().decode()
    print("SERVER LOGS:\n" + logs)

    print("Done. Closing connection.")
    ssh.close()

if __name__ == '__main__':
    deploy()
