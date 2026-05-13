#!/usr/bin/env python
import requests
from pathlib import Path

base_url = 'http://206.189.62.245:8000'
file_path = Path('test_small.jsonl')

print('Test 1: File upload with chunk_size as form parameter')

try:
    with open(file_path, 'rb') as f:
        # Send only the file, let chunk_size use its default
        files = {'file': f}
        headers = {'X-Shared-Secret': 'default-shared-secret'}
        
        r = requests.post(
            f'{base_url}/honeypot/events/from-file',
            files=files,
            headers=headers,
            timeout=10
        )
        
        print(f'Status: {r.status_code}')
        print(f'Response: {r.text}')
        print()
        
except Exception as e:
    print(f'Exception: {e}\n')

print('Test 2: File upload with chunk_size form data')

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
        
        print(f'Status: {r.status_code}')
        print(f'Response: {r.text}')
        
except Exception as e:
    print(f'Exception: {e}')
