#!/usr/bin/env python
import requests
import json
from pathlib import Path

base_url = 'http://206.189.62.245:8000'
file_path = Path('dahua_logs (1).json')

print(f'Testing file upload: {file_path.name}')
print(f'File size: {file_path.stat().st_size} bytes\n')

with open(file_path, 'rb') as f:
    files = {'file': f}
    data = {'chunk_size': '50', 'max_records': '100'}
    headers = {'X-Shared-Secret': 'default-shared-secret'}
    
    r = requests.post(
        f'{base_url}/honeypot/events/from-file',
        files=files,
        data=data,
        headers=headers,
        timeout=30
    )
    
    print(f'Status: {r.status_code}')
    if r.status_code == 202:
        result = json.loads(r.text)
        print(f'Pipeline: {result["pipeline_id"]}')
        print(f'Events: {result["events_received"]}')
        print(f'Chunks: {result["chunks_queued"]}')
    else:
        print(f'Error: {r.text}')
