#!/usr/bin/env python3
import requests
import sys
from pathlib import Path

base_url = 'http://206.189.62.245:8000'
secret = 'default-shared-secret'

# Test with the small test file first
test_files = [
    'g:/college project/proj/test_small.jsonl',
    'g:/college project/proj/dahua_logs (1).json',
]

for test_file in test_files:
    file_path = Path(test_file)
    print(f'\n{"="*60}')
    print(f'Testing: {file_path.name}')
    print(f'{"="*60}')
    print(f'File exists: {file_path.exists()}')
    if not file_path.exists():
        print(f'File not found!')
        continue
    
    print(f'File size: {file_path.stat().st_size} bytes')
    
    try:
        with open(file_path, 'rb') as f:
            files = {
                'file': (file_path.name, f, 'application/json'),
            }
            data = {
                'chunk_size': '25',
                'max_records': '10'
            }
            
            print(f'\nSending request...')
            r = requests.post(
                f'{base_url}/honeypot/events/from-file',
                files=files,
                data=data,
                headers={'X-Shared-Secret': secret},
                timeout=10
            )
            
            print(f'Status Code: {r.status_code}')
            print(f'Response Headers: {dict(r.headers)}')
            print(f'Response Body: {r.text[:500]}')
            
            if r.status_code != 202:
                print(f'\n❌ FAILED')
            else:
                print(f'\n✓ SUCCESS')
                
    except Exception as e:
        print(f'❌ Exception: {e}')
        import traceback
        traceback.print_exc()
