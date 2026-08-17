// Deterministic unique id (no Math.random) — time-based prefix + monotonic counter.
let _seq = 0;
const nextId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${String(++_seq).padStart(3, '0')}`;

// Fixed external attacker used by the demo/test generators.
const EXTERNAL_ATTACKER_IP = '185.220.101.45';

// دالة لإنشاء timeline الأحداث للهجمة
export const generateEventTimeline = () => {
  const baseTime = new Date();
  const events = [
    { time: new Date(baseTime.getTime()).toLocaleTimeString(), event: 'ATTACK_VECTOR_DETECTED', status: 'critical' },
    { time: new Date(baseTime.getTime() + 2000).toLocaleTimeString(), event: 'INITIAL_RECONNAISSANCE', status: 'warning' },
    { time: new Date(baseTime.getTime() + 5000).toLocaleTimeString(), event: 'PORT_SCANNING_INITIATED', status: 'warning' },
    { time: new Date(baseTime.getTime() + 8000).toLocaleTimeString(), event: 'PAYLOAD_INJECTION_ATTEMPT', status: 'critical' },
    { time: new Date(baseTime.getTime() + 12000).toLocaleTimeString(), event: 'AUTHENTICATION_BYPASS_DETECTED', status: 'critical' },
    { time: new Date(baseTime.getTime() + 16000).toLocaleTimeString(), event: 'PRIVILEGE_ESCALATION_BLOCKED', status: 'success' },
    { time: new Date(baseTime.getTime() + 20000).toLocaleTimeString(), event: 'LATERAL_MOVEMENT_CONTAINED', status: 'success' },
    { time: new Date(baseTime.getTime() + 24000).toLocaleTimeString(), event: 'THREAT_NEUTRALIZED', status: 'success' }
  ];
  return events;
};

// --- هجوم خارجي ثابت (SSH brute force) — بيانات واقعية وثابتة بدون عشوائية ---
export const createTestAttack = () => {
  const attackId = nextId('EV');
  return {
    id: attackId,
    sfxId: `SFX-${attackId}`, // معرف صوت منفصل لكل هجمة
    counterId: `COUNTER-${attackId}`, // عداد منفصل لكل هجمة
    date: new Date().toISOString().replace('T', ' ').split('.')[0],
    type: 'SSH BRUTE FORCE',
    attack: 'SSH BRUTE FORCE',
    attack_type: 'SSH BRUTE FORCE',
    src_ip: EXTERNAL_ATTACKER_IP,
    ip: EXTERNAL_ATTACKER_IP,
    port: '2222',
    proto: 'TCP/SSH',
    loc: 'Amman, Jordan',
    city: 'Amman',
    country: 'JO',
    threat: '92%',
    severity: 'HIGH',
    severityScore: 80,
    coords: { lat: 31.9454, lng: 35.9284 },
    status: 'DETECTED & LOGGED',
    packetSize: '1500 MTU',
    isp: 'TOR_EXIT_NODE',
    reputation: 'MALICIOUS',
    livePayload: '124.5 MB/s',
    // حقول ثابتة واقعية
    connection_count: 120,
    success_count: 1,
    failed_count: 118,
    unique_passwords: 45,
    command_count: 3,
    suspicious_commands: 2,
    // timeline الأحداث
    eventTimeline: generateEventTimeline()
  };
};

// --- هجوم الـ Loopback ببيانات ثابتة (بدون عشوائية) ---
export const createLoopbackAttack = (typeKey) => {
  const configs = {
    'BRUTE': {
      type: 'BRUTE_FORCE_AUTH', port: '2222', desc: 'SSH_MANAGEMENT_ATTEMPT',
      threat: '92%', severity: 'HIGH', severityScore: 80,
      connection_count: 85, success_count: 0, failed_count: 85,
      unique_passwords: 40, command_count: 0, suspicious_commands: 0
    },
    'DDOS': {
      type: 'DDoS_UDP_FLOOD', port: '2223', desc: 'INTERNAL_BACKDOOR_OVERLOAD',
      threat: '99%', severity: 'EXTREME', severityScore: 99,
      connection_count: 5000, success_count: 0, failed_count: 0,
      unique_passwords: 0, command_count: 0, suspicious_commands: 0
    },
  };

  const selected = configs[typeKey];
  const attackId = nextId('LB');
  return {
    id: attackId,
    date: new Date().toISOString().replace('T', ' ').split('.')[0],
    type: selected.type,
    attack: selected.type,
    attack_type: selected.type,
    src_ip: 'MISSING',
    ip: 'MISSING',
    port: selected.port,
    proto: 'TCP/UDP',
    loc: 'Amman, Jordan',
    city: 'Amman',
    country: 'JO',
    threat: selected.threat,
    severity: selected.severity,
    severityScore: selected.severityScore,
    coords: { lat: 31.9454, lng: 35.9284 },
    status: 'INTERNAL_BREACH_DETECTED',
    packetSize: '65535 MTU',
    isp: 'INTERNAL_LOOPBACK',
    reputation: 'SYSTEM_OWNED',
    livePayload: 'INTERNAL_BUS',
    detail: selected.desc,
    connection_count: selected.connection_count,
    success_count: selected.success_count,
    failed_count: selected.failed_count,
    unique_passwords: selected.unique_passwords,
    command_count: selected.command_count,
    suspicious_commands: selected.suspicious_commands,
    eventTimeline: generateEventTimeline()
  };
};

export const createDoubleAttackVectors = () => {
  const attack1 = createTestAttack();
  const attack2 = createLoopbackAttack('DDOS');
  return [
    { ...attack1, id: nextId('EV-VECTOR-1') },
    { ...attack2, id: nextId('EV-VECTOR-2') }
  ];
};
