#!/usr/bin/env python
import requests
import json

base_url = 'http://206.189.62.245:8000'
secret = {'X-Shared-Secret': 'default-shared-secret'}

print('Test 1: JSONL Format')
print('=' * 50)
jsonl_data = '{"eventid":"test1","src_ip":"10.0.0.1","dst_ip":"127.0.0.1","dst_port":443,"protocol":"https","timestamp":"2026-05-02T10:02:00Z"}\n{"eventid":"test2","src_ip":"10.0.0.2","dst_ip":"127.0.0.1","dst_port":80,"protocol":"http","timestamp":"2026-05-02T10:03:00Z"}'

r = requests.post(
    f'{base_url}/honeypot/events/batch',
    data=jsonl_data,
    headers=secret,
    timeout=10
)

print(f'Status: {r.status_code}')
data = r.json()
print(f'Events: {data["events_received"]}')
print(f'Format: {data.get("format", "unknown")}')
print()

print('Test 2: JSON Array Format')
print('=' * 50)
batch = [
    {'eventid': 'test3', 'src_ip': '192.168.1.1', 'dst_ip': '127.0.0.1', 'dst_port': 22, 'protocol': 'ssh', 'timestamp': '2026-05-02T10:00:00Z'},
    {'eventid': 'test4', 'src_ip': '192.168.1.2', 'dst_ip': '127.0.0.1', 'dst_port': 3306, 'protocol': 'mysql', 'timestamp': '2026-05-02T10:01:00Z'}
]

r = requests.post(
    f'{base_url}/honeypot/events/batch',
    json=batch,
    headers=secret,
    timeout=10
)

print(f'Status: {r.status_code}')
data = r.json()
print(f'Events: {data["events_received"]}')
print(f'Format: {data.get("format", "unknown")}')
