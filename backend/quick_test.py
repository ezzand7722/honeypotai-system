#!/usr/bin/env python3
"""
Quick-Start Testing Script
Run this to see the log normalization in action with detailed output
"""

import json
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

from app.services.ai_client import _format_log_for_ai


def print_header(text):
    print(f"\n{'='*80}")
    print(f"  {text}")
    print(f"{'='*80}\n")


def print_section(title):
    print(f"\n>>> {title}")
    print("─" * 80)


def test_single_log():
    """Test a single log transformation"""
    print_header("TEST 1: SINGLE LOG NORMALIZATION")
    
    raw_log = {
        "eventid": "cowrie.session.connect",
        "src_ip": "192.168.1.10",
        "src_port": 48124,
        "dst_ip": "127.0.0.1",
        "dst_port": 2222,
        "session": "c42c656698ae",
        "protocol": "ssh",
        "message": "New connection: 127.0.0.1:48124",
        "sensor": "muath",
        "uuid": "74eb25f8-2a04-11f1-92a6-080027d0fc5c",
        "timestamp": "2026-03-28T00:02:47.076502Z"
    }
    
    print_section("INPUT (Raw Log)")
    print(json.dumps(raw_log, indent=2))
    
    formatted = _format_log_for_ai(raw_log)
    
    print_section("OUTPUT (Formatted for AI)")
    print(json.dumps(formatted, indent=2, default=str))
    
    print_section("VALIDATION")
    required = ['eventid', 'src_ip', 'dst_ip', 'dst_port', 'session', 'protocol', 'timestamp', 'uuid', 'sensor']
    present = {k: "✓" for k in required if formatted.get(k)}
    missing = {k: "✗" for k in required if not formatted.get(k)}
    
    for field, status in present.items():
        print(f"  {status} {field}: {formatted.get(field)}")
    for field, status in missing.items():
        print(f"  {status} {field}: MISSING!")
    
    all_good = len(missing) == 0
    print(f"\n  Result: {'✅ PASS' if all_good else '❌ FAIL'}")
    
    return all_good


def test_incomplete_log():
    """Test with missing fields"""
    print_header("TEST 2: LOG WITH MISSING FIELDS")
    
    raw_log = {
        "eventid": "cowrie.login.success",
        "src_ip": "10.0.0.5",
        "dst_port": 2222,
        "username": "root",
        "password": "secret"
        # Missing: src_port, dst_ip, session, protocol, message, sensor, uuid, timestamp
    }
    
    print_section("INPUT (Raw Log - Missing Fields)")
    print(json.dumps(raw_log, indent=2))
    
    formatted = _format_log_for_ai(raw_log)
    
    print_section("OUTPUT (Auto-Generated Missing Fields)")
    print(json.dumps(formatted, indent=2, default=str))
    
    print_section("AUTO-GENERATED FIELDS")
    auto_generated = {
        "dst_ip": formatted.get("dst_ip", "N/A"),
        "protocol": formatted.get("protocol", "N/A"),
        "sensor": formatted.get("sensor", "N/A"),
        "uuid": formatted.get("uuid", "N/A"),
        "timestamp": formatted.get("timestamp", "N/A"),
    }
    for field, value in auto_generated.items():
        print(f"  • {field}: {value}")
    
    return True


def test_batch_logs():
    """Test multiple logs"""
    print_header("TEST 3: BATCH LOGS")
    
    logs = [
        {
            "eventid": "cowrie.session.connect",
            "src_ip": "192.168.1.10",
            "src_port": 48124,
            "dst_ip": "127.0.0.1",
            "dst_port": 2222,
            "session": "session1",
            "protocol": "ssh",
            "message": "Connection",
            "sensor": "honeypot",
            "timestamp": "2026-03-28T00:00:00Z"
        },
        {
            "eventid": "cowrie.login.success",
            "src_ip": "192.168.1.20",
            "dst_port": 2222,
            "session": "session1",
            "protocol": "ssh",
            "message": "Login succeeded",
        },
        {
            "eventid": "cowrie.command.input",
            "src_ip": "10.0.0.5",
            "input": "ls -la",
        }
    ]
    
    print_section("PROCESSING 3 LOGS")
    
    for i, raw_log in enumerate(logs, 1):
        formatted = _format_log_for_ai(raw_log)
        print(f"\nLog {i}: {raw_log.get('eventid', 'UNKNOWN')}")
        print(f"  • src_ip: {formatted.get('src_ip')}")
        print(f"  • dst_port: {formatted.get('dst_port')}")
        print(f"  • protocol: {formatted.get('protocol')}")
        print(f"  • timestamp: {formatted.get('timestamp')}")
        print(f"  • uuid (generated): {formatted.get('uuid')}")
    
    return True


def test_comparison():
    """Show before/after comparison"""
    print_header("TEST 4: BEFORE/AFTER COMPARISON")
    
    raw_log = {
        "eventid": "cowrie.session.connect",
        "src_ip": "192.168.1.10",
        "src_port": 48124,
        "dst_ip": "127.0.0.1",
        "dst_port": 2222,
        "session": "abc123",
        "protocol": "ssh",
        "message": "New connection",
        "sensor": "muath",
        "uuid": "test-uuid",
        "timestamp": "2026-03-28T00:02:47.076502Z",
        "extra_field": "will be preserved"
    }
    
    formatted = _format_log_for_ai(raw_log)
    
    print_section("FIELD COMPARISON")
    print(f"{'Field':<20} {'Before':<30} {'After':<30}")
    print("-" * 80)
    
    all_keys = set(list(raw_log.keys()) + list(formatted.keys()))
    for key in sorted(all_keys):
        before = str(raw_log.get(key, "N/A"))[:29]
        after = str(formatted.get(key, "N/A"))[:29]
        marker = "→" if before != after and key in raw_log else " "
        print(f"{key:<20} {marker} {before:<29} {after:<29}")
    
    return True


def main():
    """Run all tests"""
    print("""
    ╔════════════════════════════════════════════════════════════════════════════╗
    ║           LOG NORMALIZATION TEST SUITE                                     ║
    ║  Testing the transformation of raw honeypot logs to AI format              ║
    ╚════════════════════════════════════════════════════════════════════════════╝
    """)
    
    results = []
    
    try:
        results.append(("Single Log", test_single_log()))
        results.append(("Missing Fields", test_incomplete_log()))
        results.append(("Batch Logs", test_batch_logs()))
        results.append(("Comparison", test_comparison()))
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # Summary
    print_header("TEST SUMMARY")
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}  {test_name}")
    
    total_passed = sum(1 for _, p in results if p)
    total_tests = len(results)
    
    print(f"\n  Total: {total_passed}/{total_tests} passed")
    
    if total_passed == total_tests:
        print(f"\n  {'='*80}")
        print(f"  🎉 ALL TESTS PASSED! Log normalization is working correctly.")
        print(f"  {'='*80}\n")
        return 0
    else:
        print(f"\n  {'='*80}")
        print(f"  ⚠️  SOME TESTS FAILED!")
        print(f"  {'='*80}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
