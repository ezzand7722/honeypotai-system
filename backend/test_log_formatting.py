#!/usr/bin/env python3
"""
Test script to verify log normalization/formatting before sending to AI
Run this to see how raw logs are transformed
"""

from app.services.ai_client import _format_log_for_ai
import json
from datetime import datetime

# Sample raw honeypot logs
SAMPLE_LOGS = [
    {
        "eventid": "cowrie.session.connect",
        "src_ip": "192.168.1.10",
        "src_port": 48124,
        "dst_ip": "127.0.0.1",
        "dst_port": 2222,
        "session": "c42c656698ae",
        "protocol": "ssh",
        "message": "New connection: 127.0.0.1:48124 (127.0.0.1:2222) [session: c42c656698ae]",
        "sensor": "muath",
        "uuid": "74eb25f8-2a04-11f1-92a6-080027d0fc5c",
        "timestamp": "2026-03-28T00:02:47.076502Z"
    },
    {
        "eventid": "cowrie.login.success",
        "username": "root",
        "password": "123456789",
        "message": "login attempt [root/123456789] succeeded",
        "sensor": "muath",
        "uuid": "74eb25f8-2a04-11f1-92a6-080027d0fc5c",
        "timestamp": "2026-03-28T00:02:54.194463Z",
        "src_ip": "192.168.1.10",
        "session": "c42c656698ae",
        "protocol": "ssh"
    },
    {
        "eventid": "cowrie.command.input",
        "input": "ls -la /root",
        "message": "CMD: ls -la /root",
        "sensor": "muath",
        "uuid": "74eb25f8-2a04-11f1-92a6-080027d0fc5c",
        "timestamp": "2026-03-28T00:04:45.451250Z",
        "src_ip": "192.168.1.10",
        "session": "c42c656698ae",
        "protocol": "ssh"
    }
]


def test_log_formatting():
    """Test the log normalization function"""
    print("=" * 80)
    print("LOG NORMALIZATION TEST")
    print("=" * 80)
    
    for idx, raw_log in enumerate(SAMPLE_LOGS, 1):
        print(f"\n{'='*80}")
        print(f"TEST {idx}: {raw_log.get('eventid', 'UNKNOWN')}")
        print(f"{'='*80}")
        
        print("\n>>> RAW LOG (INPUT):")
        print(json.dumps(raw_log, indent=2))
        
        formatted = _format_log_for_ai(raw_log)
        
        print("\n>>> FORMATTED LOG (OUTPUT FOR AI):")
        print(json.dumps(formatted, indent=2, default=str))
        
        print("\n>>> TRANSFORMATION SUMMARY:")
        print(f"  ✓ eventid: {formatted.get('eventid')}")
        print(f"  ✓ src_ip: {formatted.get('src_ip')}")
        print(f"  ✓ src_port: {formatted.get('src_port')}")
        print(f"  ✓ dst_ip: {formatted.get('dst_ip')}")
        print(f"  ✓ dst_port: {formatted.get('dst_port')}")
        print(f"  ✓ session: {formatted.get('session')}")
        print(f"  ✓ protocol: {formatted.get('protocol')}")
        print(f"  ✓ timestamp: {formatted.get('timestamp')}")
        print(f"  ✓ uuid: {formatted.get('uuid')}")
        print(f"  ✓ sensor: {formatted.get('sensor')}")
        
        # Check for normalization
        required_fields = ['eventid', 'src_ip', 'dst_ip', 'dst_port', 'session', 'protocol', 'timestamp', 'uuid', 'sensor']
        missing = [f for f in required_fields if not formatted.get(f)]
        
        if missing:
            print(f"\n  ⚠ WARNING: Missing fields: {missing}")
        else:
            print(f"\n  ✅ All required fields present!")
    
    print(f"\n{'='*80}")
    print("TEST COMPLETE")
    print(f"{'='*80}\n")


if __name__ == "__main__":
    test_log_formatting()
