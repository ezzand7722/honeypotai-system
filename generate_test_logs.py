import json

with open('logs/dahua_logs (3).json', 'r') as f:
    lines = f.readlines()

new_lines = []
ips = ['10.0.0.5', '192.168.1.100', '172.16.20.10']
count = 0

for line in lines:
    try:
        d = json.loads(line)
        d['src_ip'] = ips[count % 3]
        new_lines.append(json.dumps(d))
        count += 1
    except Exception as e:
        pass

with open('logs/dahua_logs_test.json', 'w') as f:
    f.write('\n'.join(new_lines))
