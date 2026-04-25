import paramiko
import sys
import time

def deploy():
    print("Starting deployment...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    # Try different usernames
    host = '206.189.62.245'
    password = '00pp99oo@'
    usernames = ['root', 'ubuntu', 'ezz', 'ezzand', 'admin', 'honeypot']
    
    connected_user = None
    for user in usernames:
        try:
            print(f"Trying to connect as {user}...")
            ssh.connect(host, username=user, password=password, timeout=5)
            connected_user = user
            print(f"SUCCESS: Connected as {user}!")
            break
        except paramiko.AuthenticationException:
            print(f"Auth failed for {user}.")
        except Exception as e:
            print(f"Error for {user}: {e}")
            
    if not connected_user:
        print("Failed to connect with any username.")
        sys.exit(1)
        
    print("Finding the backend repository directory...")
    stdin, stdout, stderr = ssh.exec_command('find / -name "honeypotai-system" -type d -maxdepth 4 2>/dev/null')
    directories = stdout.read().decode().strip().split('\n')
    valid_dirs = [d for d in directories if d]
    
    if not valid_dirs:
        # Fallback to general finding
        stdin, stdout, stderr = ssh.exec_command('find / -name "main.py" -maxdepth 5 2>/dev/null | grep backend')
        files = stdout.read().decode().strip().split('\n')
        if not files or not files[0]:
            print("Could not find the project directory on the server.")
            sys.exit(1)
        proj_dir = files[0].rsplit('/backend/app/main.py', 1)[0]
    else:
        proj_dir = valid_dirs[0]
        
    print(f"Identified project directory as: {proj_dir}")
    
    print("Executing git pull and restarting service...")
    cmd = f"cd '{proj_dir}' && git pull origin main && systemctl restart honeypot_backend"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    # Wait for completion
    exit_status = stdout.channel.recv_exit_status()
    print("Exit Status:", exit_status)
    print("STDOUT:", stdout.read().decode())
    print("STDERR:", stderr.read().decode())
    
    # If systemctl restart honeypot_backend failed, try other common names or manual restart
    if exit_status != 0:
        print("Warning: default systemctl command failed. Searching for correct systemctl service...")
        stdin, stdout, stderr = ssh.exec_command("systemctl list-units | grep -i honeypot")
        services = stdout.read().decode().strip().split('\n')
        if services and services[0]:
            service_name = services[0].split()[0]
            print(f"Found service: {service_name}. Restarting it...")
            ssh.exec_command(f"systemctl restart {service_name}")
        else:
            print("No obvious systemd service found.")
            
    ssh.close()
    print("Deployment routine finished.")

if __name__ == '__main__':
    deploy()
