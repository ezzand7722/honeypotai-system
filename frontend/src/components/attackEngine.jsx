import { THREAT_POOL, GEO_POOL } from '../data/attackData';

export const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const generateRandomIP = () => 
  `${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}`;

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

// --- الدالة الأصلية المعدلة لتشريح الموقع ---
export const createTestAttack = () => {
  const randomThreat = randomItem(THREAT_POOL);
  const randomGeo = randomItem(GEO_POOL);
  
  // تشريح نص الموقع (مثلاً "Moscow, RU" إلى مدينة ودولة)
  const geoParts = randomGeo.loc.split(', ');
  const city = geoParts[0] || "Unknown";
  const country = geoParts[1] || "UN";

  const attackId = 'EV-' + Math.floor(Math.random() * 90000 + 10000);
  return {
    id: attackId,
    sfxId: `SFX-${attackId}`, // معرف صوت منفصل لكل هجمة
    counterId: `COUNTER-${attackId}`, // عداد منفصل لكل هجمة
    date: new Date().toISOString().replace('T', ' ').split('.')[0],
    type: randomThreat.type,
    attack: randomThreat.type,
    attack_type: randomThreat.type,
    src_ip: generateRandomIP(),
    ip: generateRandomIP(),
    port: randomThreat.port,
    proto: randomThreat.proto,
    loc: randomGeo.loc,
    city: city,      // إضافة حقل المدينة بشكل منفصل
    country: country, // إضافة حقل الدولة بشكل منفصل
    threat: (Math.floor(Math.random() * 20) + 80) + '%',
    severity: (Math.floor(Math.random() * 20) + 80) + '%',
    coords: { lat: randomGeo.lat, lng: randomGeo.lng },
    status: 'DETECTED & LOGGED',
    packetSize: '1500 MTU',
    isp: 'Global Edge Telecom',
    reputation: 'MALICIOUS (9.8/10)',
    livePayload: '124.5 MB/s',
    // إضافة الحقول الجديدة
    connection_count: Math.floor(Math.random() * 500 + 50),
    success_count: Math.floor(Math.random() * 30 + 5),
    failed_count: Math.floor(Math.random() * 100 + 20),
    unique_passwords: Math.floor(Math.random() * 150 + 30),
    command_count: Math.floor(Math.random() * 80 + 15),
    suspicious_commands: Math.floor(Math.random() * 25 + 5),
    // إضافة timeline الأحداث
    eventTimeline: generateEventTimeline()
  };
};

// --- الدالة الجديدة لهجوم الـ Loopback مع إحداثيات الأردن وحصر المنافذ ---
export const createLoopbackAttack = (typeKey) => {
  const configs = {
    // تم حصر الهجمات في نوعين وتعديل المنافذ لتكون 2222 و 2223 فقط
    'BRUTE': { type: "BRUTE_FORCE_AUTH", port: "2222", desc: "SSH_MANAGEMENT_ATTEMPT" },
    'DDOS': { type: "DDoS_UDP_FLOOD", port: "2223", desc: "INTERNAL_BACKDOOR_OVERLOAD" },
  };
  
  const selected = configs[typeKey];
  return {
    id: 'LB-' + Math.floor(Math.random() * 90000 + 10000),
    date: new Date().toISOString().replace('T', ' ').split('.')[0],
    type: selected.type,
    attack: selected.type,
    attack_type: selected.type,
    src_ip: "127.0.0.1",
    ip: "127.0.0.1",
    port: selected.port,
    proto: "TCP/UDP",
    loc: "Amman, JO", // تحديد الموقع للأردن
    city: "Amman",
    country: "JO",
    threat: "99%",
    severity: "99%",
    coords: { lat: 31.9454, lng: 35.9239 }, // إحداثيات عمان، الأردن
    status: 'INTERNAL_BREACH_DETECTED',
    packetSize: '65535 MTU',
    isp: 'INTERNAL_LOOPBACK',
    reputation: 'SYSTEM_OWNED',
    livePayload: 'INTERNAL_BUS',
    detail: selected.desc,
    // إضافة الحقول الجديدة
    connection_count: Math.floor(Math.random() * 1000 + 500),
    success_count: Math.floor(Math.random() * 100 + 50),
    failed_count: Math.floor(Math.random() * 200 + 100),
    unique_passwords: Math.floor(Math.random() * 300 + 150),
    command_count: Math.floor(Math.random() * 200 + 100),
    suspicious_commands: Math.floor(Math.random() * 80 + 40),
    // إضافة timeline الأحداث
    eventTimeline: generateEventTimeline()
  };
};

export const createDoubleAttackVectors = () => {
  const attack1 = createTestAttack();
  const attack2 = createTestAttack();
  return [
    { ...attack1, id: `EV-VECTOR-1-${Math.floor(Math.random() * 9000 + 1000)}` },
    { ...attack2, id: `EV-VECTOR-2-${Math.floor(Math.random() * 9000 + 1000)}` }
  ];
};