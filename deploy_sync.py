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
        print("Pulling latest code from GitHub on the Droplet...")
        stdin, stdout, stderr = ssh.exec_command("cd /root/honeypotai-system && git stash && git pull origin main")
        git_logs = stdout.read().decode()
        git_err = stderr.read().decode()
        print("GIT LOGS:\n" + git_logs)
        if git_err: print("GIT ERRORS:\n" + git_err)
    except Exception as e:
        print(f"Git pull failed: {e}")
        ssh.close()
        sys.exit(1)

    print("Restarting backend service...")
    
    print("Attempting to restart backend properly...")
    # Kill the previously backgrounded process
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
