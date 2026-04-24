// --- قاعدة بيانات الهجمات والسجلات (Data Layer) ---

// 1. البيانات الأولية للهيستوري (تظهر عند تشغيل النظام لأول مرة)
export const initialHistoryData = [
    { id: 'EV-9901', date: '2026-03-29 18:00:13', type: 'BRUTE FORCE (PORT:554)', ip: '185.22.154.66', port: '554', proto: 'TCP/RTSP', loc: 'Moscow, RU', status: 'BLOCKED', threat: '92%', coords: { lat: 55.7558, lng: 37.6173 } },
    { id: 'EV-8842', date: '2026-03-29 20:15:44', type: 'DICTIONARY ATTACK (PORT:80)', ip: '45.12.33.102', port: '80', proto: 'HTTP', loc: 'Beijing, CN', status: 'MITIGATED', threat: '75%', coords: { lat: 39.9042, lng: 116.4074 } },
    { id: 'EV-7721', date: '2026-03-29 21:05:02', type: 'SSH TUNNEL EXPLOIT', ip: '103.44.201.12', port: '2222', proto: 'TCP/SSH', loc: 'Seoul, KR', status: 'DROPPED', threat: '98%', coords: { lat: 37.5665, lng: 126.9780 } },
    { id: 'EV-6610', date: '2026-03-29 21:44:10', type: 'MIRAI BOTNET SCAN', ip: '192.168.5.21', port: '23', proto: 'TELNET', loc: 'Tokyo, JP', status: 'LOGGED', threat: '85%', coords: { lat: 35.6762, lng: 139.6503 } },
    { id: 'EV-5509', date: '2026-03-29 22:10:05', type: 'MULTI-VECTOR FLOOD', ip: '210.10.55.88', port: 'ALL (80, 554, 23)', proto: 'TCP/UDP', loc: 'Frankfurt, DE', status: 'ISOLATED', threat: '99%', coords: { lat: 50.1109, lng: 8.6821 } }
];

// 2. مجمع أنواع التهديدات (للهجمات العشوائية)
export const THREAT_POOL = [
    { type: 'MIRAI BOTNET DDOS', port: '23', proto: 'TELNET', detail: 'Automated flood targeting IoT Telnet services.' },
    { type: 'BRUTE FORCE (PORT:554)', port: '554', proto: 'TCP/RTSP', detail: 'High-frequency password guessing on RTSP video stream.' },
    { type: 'SSH BRUTE FORCE', port: '2222', proto: 'TCP/SSH', detail: 'Aggressive credential stuffing on SSH management port.' },
    { type: 'DICTIONARY ATTACK', port: '80', proto: 'HTTP', detail: 'Rapid brute force using common credential lists on Web Interface.' },
    { type: 'REMOTE ACCESS EXPLOIT', port: '2223', proto: 'TCP', detail: 'Exploitation attempt on non-standard management interface.' },
    { type: 'FULL PORT SCAN', port: 'ALL', proto: 'TCP/UDP', detail: 'Aggressive scanning targeting ports 80, 554, 23, 2222, 2223 simultaneously.' },
    { type: 'MULTI-VECTOR SYN FLOOD', port: '80, 2222', proto: 'TCP/SYN', detail: 'Distributed flood attacking web and management ports.' }
];

// 3. مجمع المواقع الجغرافية (تمت إضافة مواقع أكثر)
export const GEO_POOL = [
    { loc: 'Amman, JO', lat: 31.9454, lng: 35.9284 }, 
    { loc: 'London, UK', lat: 51.5074, lng: -0.1278 },
    { loc: 'New York, US', lat: 40.7128, lng: -74.0060 }, 
    { loc: 'Dubai, AE', lat: 25.2048, lng: 55.2708 },
    { loc: 'Istanbul, TR', lat: 41.0082, lng: 28.9784 }, 
    { loc: 'Rio, BR', lat: -22.9068, lng: -43.1729 },
    { loc: 'Cairo, EG', lat: 30.0444, lng: 31.2357 }, 
    { loc: 'Berlin, DE', lat: 52.5200, lng: 13.4050 },
    { loc: 'Paris, FR', lat: 48.8566, lng: 2.3522 },
    { loc: 'Sydney, AU', lat: -33.8688, lng: 151.2093 },
    { loc: 'Riyadh, SA', lat: 24.7136, lng: 46.6753 },
    { loc: 'Toronto, CA', lat: 43.6532, lng: -79.3832 },
    { loc: 'Mumbai, IN', lat: 19.0760, lng: 72.8777 },
    { loc: 'Singapore, SG', lat: 1.3521, lng: 103.8198 },
    { loc: 'Mexico City, MX', lat: 19.4326, lng: -99.1332 },
    { loc: 'Cape Town, ZA', lat: -33.9249, lng: 18.4241 }
];