#!/usr/bin/env python
import requests
from pathlib import Path

base_url = 'http://206.189.62.245:8000'
file_path = Path('test_small.jsonl')

print(f'Testing file upload endpoint')
print(f'File: {file_path}, Size: {file_path.stat().st_size} bytes\n')

try:
    with open(file_path, 'rb') as f:
        files = {'file': f}
        data = {'chunk_size': '25'}
        headers = {'X-Shared-Secret': 'default-shared-secret'}
        
        r = requests.post(
            f'{base_url}/honeypot/events/from-file',
            files=files,
            data=data,
            headers=headers,
            timeout=10
        )
        
        print(f'Status Code: {r.status_code}')
        print(f'Response: {r.text}')
        
        if r.status_code == 500:
            print('\nError is still 500 - exception handler may not be deployed yet')
        
except Exception as e:
    print(f'Exception: {e}')
    import traceback
    traceback.print_exc()
