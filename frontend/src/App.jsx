import React, { useState, useRef, useEffect, useCallback } from 'react';
import LiveMap from './components/LiveMap';
import NetworkModule from './components/NetworkModule';
import HistoryModule from './components/HistoryModule';
import AttackOverlay from './components/AttackOverlay';
import AnalysisScreen from './components/AnalysisScreen';
import GateController from './components/GateController';
import LogUploadModal from './components/LogUploadModal';

import Icons from './components/Icons';
import Header from './components/Header';
import ConfigModal from './components/ConfigModal';
import LiveThreatsModule from './components/LiveThreatsModule';
import RawAIModule from './components/RawAIModule';
import { createTestAttack, createDoubleAttackVectors, createLoopbackAttack } from './components/attackEngine';
import { sfx } from './logic/SFXEngine';
import { getActiveAttackCount, getCombinedActiveAttacks, splitPrimaryAndSecondaryAttacks } from './logic/attackState';

import './App.css';
import { initialHistoryData } from './data/attackData';

const menuItems = [
  { id: 'live', label: 'LIVE THREATS', Component: Icons.Live },
  { id: 'network', label: 'NETWORK', Component: Icons.Network },
  { id: 'history', label: 'ATTACK HISTORY', Component: Icons.History },
  // { id: 'analysis', label: 'ANALYSIS', Component: Icons.Analysis },
  { id: 'raw_ai', label: 'RAW AI OUTPUT', Component: Icons.RawData },
  { id: 'config', label: 'SETTINGS', Component: Icons.Config },
];

/**
 * Maps an AI v2 attack_context record to the internal attack card format
 * used by the frontend dashboard.
 */
function mapAttackContextToCard(ctx) {
  const severityMap = {
    'Extreme': 'EXTREME', 'High': 'HIGH',
    'Medium': 'MEDIUM', 'Mild': 'LOW', 'Low': 'LOW',
    'Missing': 'MISSING'
  };

  // Convert an attack_context record to the format needed by the UI
  return {
    id: ctx.attack_id,
    attack_context_id: ctx.attack_id,
    ip: ctx.src_ip,
    type: ctx.attack_type || 'Missing',
    severity: severityMap[ctx.severity] || (ctx.severity ? String(ctx.severity).toUpperCase() : 'MISSING'),
    severityRaw: ctx.severity || 'Missing',
    status: ctx.attack_status === 'ended' ? 'MITIGATED' :
            ctx.attack_status === 'renewed' ? 'RENEWED' :
            ctx.attack_status === 'ongoing' ? 'ACTIVE' : 'DETECTED',
    attack_status: ctx.attack_status,
    connectionCount: ctx.connection_count || 0,
    failedCount: ctx.failed_count || 0,
    successCount: ctx.success_count || 0,
    uniquePasswords: ctx.unique_passwords || 0,
    commandCount: ctx.command_count || 0,
    suspiciousCmds: ctx.suspicious_cmds || 0,
    port: ctx.destination_port || 0,
    durationSeconds: ctx.duration_seconds || 0,
    severityScore: ctx.severity_score || 50,
    threat: severityMap[ctx.severity] || (ctx.severity ? String(ctx.severity).toUpperCase() : 'MISSING'),
    severityColor: ctx.severity_color || '#ffd60a',
    isActive: ctx.is_active !== false,
    date: ctx.last_seen_time ? new Date(ctx.last_seen_time).toLocaleString() : new Date().toLocaleString(),

    timestamp: ctx.last_seen_time || ctx.start_time || new Date().toISOString(),
    signal: ctx.signal || '',

    // Geo mapping for LiveMap — static Amman, Jordan
    loc: ctx.location || 'Amman, Jordan',
    city: (ctx.location || 'Amman, Jordan').split(',')[0] || 'Amman',
    country: (ctx.location || 'Amman, Jordan').split(',')[1]?.trim() || 'Jordan',
    coords: (ctx.latitude != null && ctx.longitude != null) ? { lat: ctx.latitude, lng: ctx.longitude } : { lat: 31.9454, lng: 35.9284 },
    
    // Legacy fields for compatibility with existing components
    eventTimeline: [],
    source: ctx.src_ip,
    vector: ctx.attack_type,
    details: {
      attack_type: ctx.attack_type,
      attack_status: ctx.attack_status,
      severity: ctx.severity,
      src_ip: ctx.src_ip,
      connection_count: ctx.connection_count,
      success_count: ctx.success_count,
      failed_count: ctx.failed_count,
      unique_passwords: ctx.unique_passwords,
      command_count: ctx.command_count,
      suspicious_cmds: ctx.suspicious_cmds,
      destination_port: ctx.destination_port,
      duration_seconds: ctx.duration_seconds,
    },
    // Real attacker commands captured by the AI from the logs
    attacker_commands: ctx.attacker_commands || [],
    commands_used: ctx.attacker_commands || []
  };
}

function App() {
  const [isGateOpen, setIsGateOpen] = useState(false);
  const [isAttacked, setIsAttacked] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [time, setTime] = useState(new Date());
  const [currentScreen, setCurrentScreen] = useState('main');
  const [activeModule, setActiveModule] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activeTestAttack, setActiveTestAttack] = useState(null);
  const [activeAttacks, setActiveAttacks] = useState([]);
  // Debug wrapper to trace unexpected additions to activeAttacks
  const setActiveAttacksWrapper = (updater) => {
    setActiveAttacks(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        const prevLen = Array.isArray(prev) ? prev.length : NaN;
        const nextLen = Array.isArray(next) ? next.length : NaN;
        if (Number.isFinite(prevLen) && Number.isFinite(nextLen) && nextLen > prevLen) {
          console.log('[DEBUG] activeAttacks increased', prevLen, '->', nextLen);
          console.trace();
        }
      } catch (e) { console.error(e); }
      return next;
    });
  };
  const [doubleAttackMode, setDoubleAttackMode] = useState(false);
  const [selectedAttackForDetail, setSelectedAttackForDetail] = useState(null);
  const [showMultiAttackDetail, setShowMultiAttackDetail] = useState(false);
  const [alertSuppressed, setAlertSuppressed] = useState(false);
  const [heuristicProgress, setHeuristicProgress] = useState(0);
  const [historyList, setHistoryList] = useState([]);
  const [liveLog, setLiveLog] = useState("SYSTEM_IDLE");
  const [serverStats, setServerStats] = useState({ cpu: "0%", ram: "0 GB / 8GB", network: "↓ 0.0 KB/s | ↑ 0.0 KB/s" });

  const [showLoopbackMenu, setShowLoopbackMenu] = useState(false);
  const [showLoopbackSubMenu, setShowLoopbackSubMenu] = useState(false);
  const [showMultiCountInput, setShowMultiCountInput] = useState(false);
  const [multiAttackCount, setMultiAttackCount] = useState('3');
  const [showLogUpload, setShowLogUpload] = useState(false);
  const [lastAttackForAlert, setLastAttackForAlert] = useState(null); // لتتبع آخر هجمة للإندار
  const [alarmPlayedForSession, setAlarmPlayedForSession] = useState(false); // لضمان تشغيل الإنذار مرة واحدة فقط
  const isSpeaking = useRef(false); // لمنع تشغيل وظيفتي نطق في نفس الوقت
  const alertShownForAttackIds = useRef(new Set()); // تتبع الهجمات التي تم عرض الإنذار لها

  const isFinalizing = useRef(false);
  const attackRef = useRef(false);
  const sirenAudio = useRef(new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg'));

  const [settings, setSettings] = useState({
    autoMitigation: false,
    stealthMode: false,
    shieldActive: false,
    scanSpeed: 'NORMAL',
    securityLevel: 'LEVEL_4',
    encryptionType: 'AES_256_GCM',
    alertVolume: 0.5
  });

  const [activeTab, setActiveTab] = useState('PROTECTION');

  const addToHistory = useCallback((attack) => {
    if (!attack || !attack.id) return;
    setHistoryList(prev => {
      const exists = prev.find(item => item.id === attack.id);
      if (exists) {
        // Update existing record in place (e.g. status change to MITIGATED)
        return prev.map(item => item.id === attack.id ? { ...item, ...attack } : item);
      }
      return [{ ...attack, timestamp: new Date().toLocaleTimeString() }, ...prev];
    });
  }, []);

  useEffect(() => {
    if (sirenAudio.current) sirenAudio.current.volume = settings.alertVolume;
  }, [settings.alertVolume]);

  const playFemaleAlert = useCallback(() => {
    // Ø¥Ø°Ø§ ÙƒØ§Ù† Ù‡Ù†Ø§Ùƒ Ù†Ø·Ù‚ Ø¬Ø§Ø±Ù  Ø£Ùˆ Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ù…ÙƒØªÙˆÙ…Ø©ØŒ Ø§Ø®Ø±Ø¬ Ù ÙˆØ±Ø§Ù‹
    if (isSpeaking.current || alertSuppressed || !showOverlay) return;

    const currentAttack = lastAttackForAlert;

    // Ø¥Ø°Ø§ Ù„Ù… ÙŠÙˆØ¬Ø¯ Ù‡Ø¬ÙˆÙ… Ø£Ùˆ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù‚Ø¯ Ø¹Ù Ø±Ø¶ Ø¨Ø§Ù„Ù Ø¹Ù„ Ù„Ù‡Ø°Ù‡ Ø§Ù„Ù‡Ø¬Ù…Ø©ØŒ Ù„Ø§ ØªÙ Ø¹Ù„ Ø´ÙŠØ¦Ø§Ù‹
    if (!currentAttack || alertShownForAttackIds.current.has(currentAttack.id)) return;

    // ÙˆØ¶Ø¹ Ø¹Ù„Ø§Ù…Ø© Ø¹Ù„Ù‰ Ø§Ù„Ù‡Ø¬Ù…Ø© Ø£Ù†Ù‡ ØªÙ… Ø¹Ø±Ø¶ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„Ù‡Ø§
    alertShownForAttackIds.current.add(currentAttack.id);

    isSpeaking.current = true;

    window.speechSynthesis.cancel();

    const alertMsg = new SpeechSynthesisUtterance("Attention! Attack Detected.");
    alertMsg.pitch = 1.4;
    alertMsg.rate = 1.1;

    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Google US English'));
    if (femaleVoice) alertMsg.voice = femaleVoice;

    alertMsg.onend = () => {
      if (!attackRef.current || alertSuppressed) {
        isSpeaking.current = false;
        return;
      }

      const ipSpelled = currentAttack.ip.split('').join(' ');
      const detailMsg = new SpeechSynthesisUtterance(`Source I P address. ${ipSpelled}. Initiating AI countermeasures.`);
      detailMsg.pitch = 1.1;
      if (femaleVoice) detailMsg.voice = femaleVoice;

      detailMsg.onend = () => {
        isSpeaking.current = false; // ØªØ­Ø±ÙŠØ± Ø§Ù„Ù‚Ù Ù„ Ø¹Ù†Ø¯ Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ ØªÙ…Ø§Ù…Ø§Ù‹
      };

      window.speechSynthesis.speak(detailMsg);
    };

    window.speechSynthesis.speak(alertMsg);
  }, [lastAttackForAlert, alertSuppressed, showOverlay]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- CONNECT TO REAL BACKEND API ---
  const fetchBackendAlertsRef = useRef(null);
  const seenAlertToken = useRef(new Map());
  const discardedAlertIds = useRef(new Set());
  const isFirstPoll = useRef(true); // First poll is silent â€” just records existing IDs
  const alertsFetchInFlight = useRef(false);
  const debugRef = useRef({ lastOkAt: null, lastError: null, lastStatus: null, lastBackendUrl: null, lastAlertsCount: null });
  const loggedBackendConfigRef = useRef(false);

  useEffect(() => {
    fetchBackendAlertsRef.current = async () => {
      if (alertsFetchInFlight.current) return;
      alertsFetchInFlight.current = true;
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        debugRef.current.lastBackendUrl = backendUrl;
        if (!loggedBackendConfigRef.current) {
          loggedBackendConfigRef.current = true;
          try {
            window.__honeypotDebug = window.__honeypotDebug || {};
            window.__honeypotDebug.backendUrl = backendUrl;
          } catch (e) { }
          console.info('[honeypot] backendUrl =', backendUrl);
        }
        const res = await fetch(`${backendUrl}/report/alerts?limit=100&_t=${Date.now()}`, {
          headers: {
            'X-Shared-Secret': 'default-shared-secret',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        debugRef.current.lastStatus = res.status;
        if (!res.ok) {
          const msg = `[honeypot] alerts fetch failed status=${res.status}`;
          debugRef.current.lastError = msg;
          try {
            window.__honeypotDebug = window.__honeypotDebug || {};
            window.__honeypotDebug.alertsLastError = msg;
            window.__honeypotDebug.alertsLastStatus = res.status;
          } catch (e) { }
          console.warn(msg);
          return;
        }
        const data = await res.json();
        debugRef.current.lastOkAt = Date.now();
        debugRef.current.lastAlertsCount = Array.isArray(data?.alerts) ? data.alerts.length : null;
        try {
          window.__honeypotDebug = window.__honeypotDebug || {};
          window.__honeypotDebug.alertsLastOkAt = debugRef.current.lastOkAt;
          window.__honeypotDebug.alertsLastCount = debugRef.current.lastAlertsCount;
          window.__honeypotDebug.alertsSample = Array.isArray(data?.alerts) ? data.alerts.slice(0, 3) : data;
          window.__honeypotDebug.alertsLastError = null;
        } catch (e) { }
        
        const initialPoll = isFirstPoll.current;
        if (isFirstPoll.current) isFirstPoll.current = false;

        const nowMs = Date.now();
        const shouldShowOverlayOnInitial =
          initialPoll &&
          Array.isArray(data?.alerts) &&
          data.alerts.length > 0;

        if (data.status === "success" && data.alerts && data.alerts.length > 0) {

            const freshAlerts = data.alerts.filter(alert => { const alertId = alert.attack_id || alert.id || ('EV-' + alert.src_ip + '-' + alert.attack_type); return !discardedAlertIds.current.has(alertId); });

            if (freshAlerts.length > 0) {

              freshAlerts.forEach(alert => {
            const alertId = alert.attack_id || alert.id || ('EV-' + alert.src_ip + '-' + alert.attack_type);

            const receivedAtRaw = alert.ingested_at || alert?.details?.received_at || alert.first_seen;
            let receivedAtMs = NaN;
            let utcRa = '';
            
            if (typeof receivedAtRaw === 'number') {
                receivedAtMs = receivedAtRaw * (receivedAtRaw < 1e12 ? 1000 : 1);
                utcRa = new Date(receivedAtMs).toISOString();
            } else if (typeof receivedAtRaw === 'string') {
                utcRa = receivedAtRaw.endsWith('Z') ? receivedAtRaw : receivedAtRaw + 'Z';
                receivedAtMs = Date.parse(utcRa);
            }
            const lastSeenSeconds = Number(alert.last_seen ?? alert.timestamp ?? alert.first_seen ?? 0) || 0;
            const instanceCount = Number(alert.instance_count ?? 0) || 0;

            const dateStr = Number.isFinite(receivedAtMs)
              ? new Date(receivedAtMs).toISOString().replace('T', ' ').split('.')[0]
              : (alert.timestamp
                ? new Date(alert.timestamp * 1000).toISOString().replace('T', ' ').split('.')[0]
                : new Date().toISOString().replace('T', ' ').split('.')[0]);

            const timeline = [];
            const timeStr = dateStr.split(' ')[1] || "00:00:00";
            const targetPort = alert.dest_port || alert.details?.dest_port || "Missing";
            
            const pipelineData = alert.pipeline || alert.details?.pipeline;

            if (pipelineData && Array.isArray(pipelineData) && pipelineData.length > 0) {
                pipelineData.forEach(item => {
                    let status = 'success';
                    const eventName = item.event || '';
                    if (eventName.includes('ATTACK') || eventName.includes('ALERT') || eventName.includes('HIGH') || eventName.includes('DETECTED') || eventName.includes('SEVERITY')) {
                        status = 'critical';
                    } else if (eventName.includes('CLEAN') || eventName.includes('RECEIVED') || eventName.includes('STARTED') || eventName.includes('EXTRACTED')) {
                        status = 'warning';
                    }
                    const eventDesc = item.message ? `${eventName}: ${item.message}` : eventName;
                    timeline.push({
                        time: item.time || timeStr,
                        event: eventDesc,
                        status: status
                    });
                });
            } else {
                timeline.push({ time: timeStr, event: `INBOUND CONNECTION DETECTED ON PORT ${targetPort}`, status: 'warning' });
                timeline.push({ time: timeStr, event: `AI SCANNER IDENTIFIED SIGNATURE: ${alert.attack_type || 'MISSING'}`, status: 'critical' });
                if (alert.details?.explanation) {
                    timeline.push({ time: timeStr, event: `AI ANALYSIS: ${alert.details.explanation.substring(0, 150)}...`, status: 'critical' });
                } else if (alert.details?.attack_type) {
                    timeline.push({ time: timeStr, event: `DEPLOYING HONEYPOT DECOY AGAINST: ${alert.details.attack_type}`, status: 'warning' });
                } else {
                    timeline.push({ time: timeStr, event: `DEPLOYING VIRTUAL FILE_SYSTEM DECOY`, status: 'warning' });
                }
                if (alert.details?.connection_count > 0) {
                    timeline.push({ time: timeStr, event: `CONNECTIONS_TRACKED: ${alert.details.connection_count} | FAILED: ${alert.details.failed_count || 0}`, status: 'critical' });
                }
                timeline.push({ time: timeStr, event: `ATTACKER IP ${alert.src_ip || 'Missing'} BLACKLISTED`, status: 'success' });
                timeline.push({ time: timeStr, event: `SESSION PURGED | LOGGING INCIDENT`, status: 'success' });
            }

            console.group(`%c[DIAGNOSTIC] Alert ID: ${alertId}`, 'color: #00ff41; font-weight: bold; background: #000; padding: 2px 6px;');
            console.log('Raw Backend Alert:', alert);
            console.log('AI Pipeline Timeline (from ai.py):', alert.details?.pipeline || 'No pipeline found in alert.details');
            console.log('Final Mapped eventTimeline:', timeline);
            console.groupEnd();

            const severityVal = alert.details?.severity || alert.severity || 'Missing';
            const severityStr = severityVal ? String(severityVal).toUpperCase() : 'Missing';

            const prediction = alert.details?.prediction || {};
            const mappedAttack = {
              id: alertId,
              date: dateStr,
              type: alert.attack_type || 'Missing',
              attack: alert.attack_type || 'Missing',
              attack_type: alert.attack_type || 'Missing',
              ip: alert.src_ip || 'Missing',
              src_ip: alert.src_ip || 'Missing',
              port: alert.dest_port || 0,
              proto: alert.protocol || 'TCP',
              loc: alert.details?.event?.metadata?.location || alert.location || 'MISSING',
              city: (alert.details?.event?.metadata?.location || alert.location || 'MISSING').split(',')[0] || 'MISSING',
              country: (alert.details?.event?.metadata?.location || alert.location || 'MISSING').split(',')[1]?.trim() || 'MISSING',
              threat: severityStr,
              severity: severityStr,
              severityScore: { 'EXTREME': 100, 'HIGH': 80, 'MEDIUM': 55, 'LOW': 30, 'MISSING': 10 }[severityStr] || 50,
              coords: { lat: alert.latitude || 0, lng: alert.longitude || 0 },
              status: 'DETECTED',
              packetSize: '1500 MTU',
              isp: 'Missing',
              reputation: 'MISSING',
              livePayload: 'Backend Log',
              detail: JSON.stringify(alert.details || {}),
              last_seen: lastSeenSeconds,
              received_at: utcRa || null,
              instance_count: instanceCount,
              startTime: Date.now(),
              duration: 60000,
              progress: 0,
              eventTimeline: timeline,
              connection_count: prediction.connection_count ?? alert.details?.connection_count ?? 0,
              success_count: prediction.success_count ?? alert.details?.success_count ?? 0,
              failed_count: prediction.failed_count ?? alert.details?.failed_count ?? 0,
              unique_passwords: prediction.unique_passwords ?? alert.details?.unique_passwords ?? 0,
              command_count: prediction.command_count ?? alert.details?.command_count ?? 0,
              suspicious_commands: prediction.suspicious_commands ?? alert.details?.suspicious_commands ?? 0
            };
            
            // addToHistory(mappedAttack); // Disabled so basic alerts don't pollute history. Only AI contexts will appear.
            
            const isNewAlert = !seenAlertToken.current.has(alertId);
            
            if (isNewAlert) {
              seenAlertToken.current.set(alertId, true);

              fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/report/attacker-stats?src_ip=${alert.src_ip}`).then(r => r.json()).then(d => {
                if (d?.stats) {
                  setHistoryList(curr => curr.map(h => h.id === mappedAttack.id ? { ...h, ...d.stats } : h));
                }
              }).catch(()=>{});

              if (!initialPoll && isNewAlert) {
                setLastAttackForAlert(mappedAttack);
              }
            }
            
            // Only treat an alert as ACTIVE if it was ingested within the last 30 seconds.
            // This prevents old history records loaded from the DB from showing up in the
            // Analysis tab as live ongoing attacks.
            const RECENT_WINDOW_MS = 30 * 1000;
            const isRecentAlert = (receivedAtMs && (nowMs - receivedAtMs) < RECENT_WINDOW_MS) ||
              (!receivedAtMs && isNewAlert); // fallback: if no timestamp, only treat as active if it's brand new

            if (!initialPoll && isRecentAlert && isNewAlert) {
              if (!isAttacked) {
                setIsAttacked(true);
                setAlarmPlayedForSession(false);
              }
              // The user hates the forced popup, so we don't call setShowOverlay(true) here anymore.
            }

            if (!initialPoll && isRecentAlert && !discardedAlertIds.current.has(alertId)) {
              setActiveTestAttack(currTest => {
                const isCurrentlyActive = (currTest && currTest.id === alertId) || activeAttacks.some(a => a.id === alertId);
                
                if (isNewAlert || isCurrentlyActive) {
                  // Fetch stats and update active lists
                  fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/report/attacker-stats?src_ip=${alert.src_ip}`).then(r => r.json()).then(d => {
                    if (d?.stats) {
                      setActiveAttacksWrapper(curr => curr.map(a => a.id === mappedAttack.id ? { ...a, ...d.stats } : a));
                      setActiveTestAttack(currT => currT?.id === mappedAttack.id ? { ...currT, ...d.stats } : currT);
                    }
                  }).catch(()=>{});

                  if (!currTest || currTest.id === mappedAttack.id) {
                    return { 
                      ...(currTest || {}), 
                      ...mappedAttack, 
                      startTime: currTest?.startTime ?? mappedAttack.startTime, 
                      duration: currTest?.duration ?? mappedAttack.duration, 
                      progress: currTest?.progress ?? mappedAttack.progress 
                    };
                  } else {
                    // Enrich existing AI contexts instead of spawning basic fake cards!
                    setActiveAttacksWrapper(prev => {
                      return prev.map(a => {
                        // Match basic alert to AI context by IP
                        if (a.ip === mappedAttack.ip || a.src_ip === mappedAttack.ip) {
                          const newTimeline = mappedAttack.eventTimeline || [];
                          const existingTimeline = a.eventTimeline || [];
                          // simple dedup by timestamp
                          const mergedTimeline = [...existingTimeline, ...newTimeline].filter((v,i,arr)=>arr.findIndex(t=>(t.timestamp===v.timestamp))===i);
                          
                          return { 
                            ...a, 
                            eventTimeline: mergedTimeline,
                          };
                        }
                        return a;
                      });
                    });
                    return currTest;
                  }
                }
                return currTest;
              });
            }
          });
        }
      }
    } catch (err) {
        const msg = `[honeypot] alerts fetch exception: ${err?.message || String(err)}`;
        debugRef.current.lastError = msg;
        try {
          window.__honeypotDebug = window.__honeypotDebug || {};
          window.__honeypotDebug.alertsLastError = msg;
        } catch (e) { }
        console.warn(msg);
      } finally {
        alertsFetchInFlight.current = false;
      }
    };
  }, [isAttacked, addToHistory]);

  // --- CONNECT TO SYSTEM STATS API ---
  useEffect(() => {
    const fetchSystemStats = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        const res = await fetch(`${backendUrl}/system/stats`);
        if (res.ok) {
          const data = await res.json();
          setServerStats({ cpu: data.cpu, ram: data.ram, network: data.network });
          setSelectedNode(prev => (prev && !prev.isAttacker) ? { ...prev, cpu: data.cpu, ram: data.ram, network: data.network } : prev);
        }
      } catch (err) {
        // Silent catch
      }
    };
    
    fetchSystemStats();
    const interval = setInterval(fetchSystemStats, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchWrapper = () => {
      if (fetchBackendAlertsRef.current) fetchBackendAlertsRef.current();
    }
    fetchWrapper();
    // Optimized polling interval to prevent server/proxy overload
    const interval = setInterval(fetchWrapper, 2000);
    return () => clearInterval(interval);
  }, []);

  // ── Poll /ai/attack-context (AI v2 normalized output) ──
  useEffect(() => {
    const fetchAttackContext = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        const res = await fetch(`${backendUrl}/ai/attack-context?limit=50&_t=${Date.now()}`, {
          headers: { 'Cache-Control': 'no-store' }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.attack_contexts)) {
          let hasActive = false;
          data.attack_contexts.forEach(ctx => {
            const mapped = mapAttackContextToCard(ctx);
            if (ctx.attack_status === 'ended') {
              setActiveAttacks(prev => prev.filter(a => a.attack_context_id !== ctx.attack_id));
            } else if (ctx.attack_status === 'new' || ctx.attack_status === 'ongoing' || ctx.attack_status === 'renewed') {
              hasActive = true;
              setActiveAttacks(prev => {
                const exists = prev.find(a => a.attack_context_id === ctx.attack_id);
                if (exists) {
                  return prev.map(a => a.attack_context_id === ctx.attack_id ? { ...a, ...mapped } : a);
                }
                return [mapped, ...prev];
              });
            }
          });

          if (hasActive) {
            setIsAttacked(true);
          } else {
            setActiveAttacks(prev => {
              const active = prev.filter(a => data.attack_contexts.some(c => c.attack_id === a.attack_context_id && c.attack_status !== 'ended'));
              if (active.length === 0 && !activeTestAttack) {
                setIsAttacked(false);
              }
              return active;
            });
          }
        }
      } catch (e) {
        console.warn('[attack-context] fetch error:', e);
      }
    };

    fetchAttackContext(); // immediate
    const interval = setInterval(fetchAttackContext, 1000);
    return () => clearInterval(interval);
  }, [addToHistory, activeTestAttack]);

  // ── Poll /ai/history (append-only archive of ENDED attacks) ──
  // History tab is fed exclusively from this table; only finalized attacks
  // (written server-side on attack end) show up here.
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        const res = await fetch(`${backendUrl}/ai/history?limit=100&_t=${Date.now()}`, {
          headers: { 'Cache-Control': 'no-store' }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.history)) {
          setHistoryList(data.history.map(mapAttackContextToCard));
        }
      } catch (e) {
        console.warn('[history] fetch error:', e);
      }
    };

    fetchHistory(); // immediate
    const interval = setInterval(fetchHistory, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let liveInterval;
    if (isAttacked) {
      liveInterval = setInterval(() => {
        const logs = [
          "DECODING_PACKETS...", "BLOCKING_IP_RANGE...", "ANALYZING_PAYLOAD...",
          "[AI]_HEURISTIC_SCANNING...", "ENCRYPTING_NODE_DATA...", "REDIRECTING_TRAFFIC...",
          "[RIPv2]_TABLE_PROTECTION_ACTIVE...", "DEPLOYING_HONEYPOT_DECOYS..."
        ];
        setLiveLog(logs[Math.floor(Date.now() / 1000) % logs.length]);

        if (activeTestAttack) {
          setActiveTestAttack(prev => prev ? ({
            ...prev,
            livePayload: '124.5 MB/s'
          }) : null);
        }

        if (selectedNode && !selectedNode.isAttacker) {
          setSelectedNode(prev => prev ? ({
            ...prev,
            latency: '250ms'
          }) : null);
        }
      }, 1000);
    }
    return () => clearInterval(liveInterval);
  }, [isAttacked, selectedNode, activeTestAttack]);

  useEffect(() => {
    if (!isAttacked) setLiveLog("SYSTEM_READY");
  }, [isAttacked]);

  useEffect(() => {
    attackRef.current = isAttacked;

    if (isAttacked && showOverlay && !alertSuppressed && !alarmPlayedForSession) {
      // ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ø§Ù„ØµÙˆØªÙŠ (Siren) Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø© ÙÙ‚Ø· Ø¹Ù†Ø¯ Ø¨Ø¯Ø¡ Ø§Ù„Ù‡Ø¬Ù…Ø©
      if (sirenAudio.current && sirenAudio.current.paused) {
        sirenAudio.current.loop = true;
        sirenAudio.current.play().catch(() => { });
      }
      // ØªØ´ØºÙŠÙ„ Ø§Ù„Ù†Ø·Ù‚
      playFemaleAlert();
      // ÙˆØ¶Ø¹ Ø¹Ù„Ø§Ù…Ø© Ø¹Ù„Ù‰ Ø£Ù† Ø§Ù„Ø¥Ù†Ø°Ø§Ø± ØªÙ… ØªØ´ØºÙŠÙ„Ù‡
      setAlarmPlayedForSession(true);
    } else if (!isAttacked) {
      // Ø¥ÙŠÙ‚Ø§Ù ÙƒÙ„ Ø´ÙŠØ¡ Ø¹Ù†Ø¯ Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„Ù‡Ø¬ÙˆÙ… Ø£Ùˆ ÙƒØªÙ… Ø§Ù„ØµÙˆØª
      window.speechSynthesis.cancel();
      isSpeaking.current = false;
      if (sirenAudio.current) {
        sirenAudio.current.pause();
        sirenAudio.current.currentTime = 0;
      }
    }
  }, [isAttacked, showOverlay, alertSuppressed, playFemaleAlert, alarmPlayedForSession]);

  const muteAlerts = () => {
    if (sirenAudio.current) {
      sirenAudio.current.pause();
      sirenAudio.current.currentTime = 0;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setAlertSuppressed(true);
  };

  useEffect(() => {
    let timer;
    if (isAttacked && currentScreen === 'main' && showOverlay) {
      timer = setTimeout(() => {
        // Disabled automatic screen changes to prevent interrupting the user's active view
        // const totalAttacks = getActiveAttackCount({ activeTestAttack, activeAttacks });
        // if (totalAttacks >= 2) {
        //   setCurrentScreen('double_attack');
        // } else if (activeTestAttack || activeAttacks.length === 1) {
        //   setCurrentScreen('attack_details');
        // }

        // Ø¹Ø±Ø¶ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰/Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ø¥Ø°Ø§ Ù„Ù… ÙŠØªÙ… Ø¹Ø±Ø¶Ù‡
        const combinedAttacks = getCombinedActiveAttacks({ activeTestAttack, activeAttacks });
        const firstAttack = combinedAttacks.length > 0 ? combinedAttacks[0] : null;
        if (firstAttack && !firstAttack.alertShown) {
          playFemaleAlert();
        }
      }, 3500);
    }
    return () => clearTimeout(timer);
  }, [isAttacked, currentScreen, showOverlay, activeAttacks.length, activeTestAttack?.id, playFemaleAlert]);

  const finalizeAttackAndSave = useCallback(async () => {
    if (isFinalizing.current) return;
    isFinalizing.current = true;

    try {
      attackRef.current = false;
      window.speechSynthesis.cancel();
      if (sirenAudio.current) {
        sirenAudio.current.pause();
        sirenAudio.current.currentTime = 0;
      }

      const savedAttacks = [];
      const endPromises = [];
      
      const endAttackOnBackend = async (id) => {
        try {
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
          await fetch(`${backendUrl}/ai/attack-context/${id}/end`, { method: 'POST' });
        } catch (err) {
          console.error('Failed to end attack on backend:', err);
        }
      };

      if (activeAttacks.length > 0) {
        activeAttacks.forEach(attack => {
          discardedAlertIds.current.add(attack.id);
          savedAttacks.push({ ...attack, status: 'MITIGATED' });
          if (attack.id) endPromises.push(endAttackOnBackend(attack.id));
        });
      }
      
      if (activeTestAttack && !activeAttacks.some(a => a.id === activeTestAttack.id)) {
        discardedAlertIds.current.add(activeTestAttack.id);
        savedAttacks.push({ ...activeTestAttack, status: 'MITIGATED' });
        if (activeTestAttack.id) endPromises.push(endAttackOnBackend(activeTestAttack.id));
      }

      await Promise.all(endPromises);

      if (savedAttacks.length > 0) savedAttacks.forEach(attack => addToHistory(attack));
      isSpeaking.current = false;
      window.speechSynthesis.cancel();

      setIsAttacked(false);
      setShowOverlay(false);
      setActiveTestAttack(null);
      setActiveAttacksWrapper([]);
      setLastAttackForAlert(null);
      setAlarmPlayedForSession(false);
      setDoubleAttackMode(false);
      setAlertSuppressed(false);
      setSelectedAttackForDetail(null);
      setShowMultiAttackDetail(false);
      setHeuristicProgress(0);
      setCurrentScreen('main');
      setActiveModule(null);
    } finally {
      setTimeout(() => { isFinalizing.current = false; }, 500);
    }
  }, [activeAttacks, activeTestAttack, addToHistory, doubleAttackMode]);

  useEffect(() => {
    if (!isAttacked || (activeAttacks.length === 0 && !activeTestAttack)) return;

    const progressInterval = setInterval(() => {
      let hasActiveAttack = false;

      // ØªØ­Ø¯ÙŠØ« progress Ù„Ù„Ù€ activeTestAttack Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ø§Ù„ÙˆÙ‚Øª Ø§Ù„Ù…Ù†Ù‚Ø¶ÙŠ ÙˆØ§Ù„Ù…Ø¯Ø© Ø§Ù„Ø¹Ø´ÙˆØ§Ø¦ÙŠØ©
      if (activeTestAttack) {
        setActiveTestAttack(prev => {
          if (!prev) return null;

          const now = Date.now();
          const startTime = prev.startTime || now;
          const duration = prev.duration || 50000;
          const elapsedTime = now - startTime;

          let speedMultiplier = 1;
          if (settings.scanSpeed === 'FAST') speedMultiplier = 2.8;
          if (settings.scanSpeed === 'SLOW') speedMultiplier = 0.5;
          if (settings.autoMitigation) speedMultiplier *= 1.5;

          const adjustedDuration = duration / speedMultiplier;
          const progress = Math.min((elapsedTime / adjustedDuration) * 100, 100);

          if (progress < 100) {
            hasActiveAttack = true;
          }

          return { ...prev, progress };
        });
      }

      // ØªØ­Ø¯ÙŠØ« progress Ù„ÙƒÙ„ Ù‡Ø¬Ù…Ø© ÙÙŠ activeAttacks ÙˆØ­Ø°Ù Ø§Ù„Ù…ÙƒØªÙ…Ù„Ø© ÙÙˆØ±Ø§Ù‹
      if (activeAttacks.length > 0) {
        setActiveAttacksWrapper(prev => {
          const updated = prev.map(attack => {
            const now = Date.now();
            const startTime = attack.startTime || now;
            const duration = attack.duration || 50000;
            const elapsedTime = now - startTime;

            let speedMultiplier = 1;
            if (settings.scanSpeed === 'FAST') speedMultiplier = 2.8;
            if (settings.scanSpeed === 'SLOW') speedMultiplier = 0.5;
            if (settings.autoMitigation) speedMultiplier *= 1.5;

            const adjustedDuration = duration / speedMultiplier;
            const progress = Math.min((elapsedTime / adjustedDuration) * 100, 100);

            if (progress < 100) {
              hasActiveAttack = true;
            }

            return { ...attack, progress };
          });

          const remaining = updated.filter(attack => {
            if ((attack.progress || 0) >= 100) {

                discardedAlertIds.current.add(attack.id);

              addToHistory({ ...attack, status: 'MITIGATED' });
              return false;
            }
            return true;
          });

          return remaining;
        });
      }

      // Ø­Ø³Ø§Ø¨ Ù…ØªÙˆØ³Ø· Ø§Ù„ØªÙ‚Ø¯Ù… Ù„ÙƒÙ„ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª
      let totalProgress = 0;
      let attackCount = 0;
      if (activeTestAttack) {
        totalProgress += activeTestAttack.progress || 0;
        attackCount++;
      }
      activeAttacks.forEach(a => {
        totalProgress += a.progress || 0;
        attackCount++;
      });

      const avgProgress = attackCount > 0 ? totalProgress / attackCount : 0;
      setHeuristicProgress(avgProgress);
    }, 100);

    return () => clearInterval(progressInterval);
  }, [isAttacked, activeTestAttack, activeAttacks, settings.scanSpeed, settings.autoMitigation]);

  // --- ØªØ£Ø«ÙŠØ± Ø¬Ø¯ÙŠØ¯: Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ù‡Ø¬Ù…Ø© Ø¹Ù†Ø¯Ù…Ø§ ØªÙ†ØªÙ‡ÙŠ Ø¢Ø®Ø± Ù‡Ø¬Ù…Ø© ---
  useEffect(() => {
    if (!isAttacked) return;

    const hasActiveAttacks = activeAttacks.length > 0;
    const hasTestAttack = activeTestAttack && (activeTestAttack.progress || 0) < 100;

    if (!hasActiveAttacks && !hasTestAttack) {
      window.speechSynthesis.cancel();
      isSpeaking.current = false;
      if (sirenAudio.current) {
        sirenAudio.current.pause();
        sirenAudio.current.currentTime = 0;
      }

      const timer = setTimeout(() => {
        finalizeAttackAndSave();
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [isAttacked, activeTestAttack, activeAttacks, finalizeAttackAndSave]);

  // --- ØªØ£Ø«ÙŠØ± Ø¬Ø¯ÙŠØ¯: Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¨Ø¹Ø¯ Ù…Ø¯Ø© Ù…Ø¹ÙŠÙ†Ø© ---
  useEffect(() => {
    if (!isAttacked || activeAttacks.length === 0) return;

    const autoRemoveInterval = setInterval(() => {
      setActiveAttacksWrapper(prev => {
        const now = Date.now();
        // Ù…Ø¯Ø© Ø§Ù„Ù‡Ø¬Ù…Ø© Ù„ÙƒÙ„ Ù‡Ø¬Ù…Ø© (25-35 Ø«Ø§Ù†ÙŠØ©)
        const remaining = prev.filter(attack => {
          const attackStartTime = attack.startTime || Date.now();
          const attackDuration = attack.duration || (45000);
          return (now - attackStartTime) < attackDuration;
        });

        // Ø¥Ø°Ø§ ØªÙ… Ø­Ø°Ù Ù‡Ø¬Ù…Ø§ØªØŒ Ø­Ø¯Ù‘Ø« Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„ÙŠÙ‚Ø±Ø£ Ø¢Ø®Ø± Ù‡Ø¬Ù…Ø© Ù…ØªØ¨Ù‚ÙŠØ©
        if (remaining.length < prev.length && remaining.length > 0) {
          setLastAttackForAlert(remaining[remaining.length - 1]);
        }

        return remaining;
      });
    }, 1000);

    return () => clearInterval(autoRemoveInterval);
  }, [isAttacked]);

  const toggleAttack = () => {
    const newState = !isAttacked;
    if (newState && settings.shieldActive) {
      setLiveLog("ERROR: SHIELD_ACTIVE_BLOCKING_TEST");
      return;
    }

    setIsAttacked(newState);
    setShowOverlay(newState);
    if (newState) {
      const newAttack = { ...createTestAttack(), startTime: Date.now(), duration: 45000, progress: 0 };
      setActiveTestAttack(newAttack);
      setSelectedAttackForDetail(newAttack);
      setLastAttackForAlert(newAttack); // Ø­Ø¯Ø« Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„ÙŠÙ‚Ø±Ø£ Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©
      setActiveAttacksWrapper([]);
      setDoubleAttackMode(false);
      setShowMultiAttackDetail(false);
      setAlertSuppressed(false);
      setAlarmPlayedForSession(false); // Ø£Ø¹Ø¯ ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø¹Ù„Ù… Ù„ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©
      setHeuristicProgress(0);
      isFinalizing.current = false;
      setCurrentScreen('main');
      setLiveLog("ðŸ”´ ATTACK_VECTORS_DETECTED");
    } else {
      finalizeAttackAndSave();
    }
  };

  // Ø¯Ø§Ù„Ø© Ø¬Ø¯ÙŠØ¯Ø©: Ø¥Ø¶Ø§ÙØ© Ù‡Ø¬Ù…Ø© Ø¬Ø¯ÙŠØ¯Ø© Ø¨Ø¯ÙˆÙ† Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ©
  const addNewVector = () => {
    if (!isAttacked || settings.shieldActive) return;
    const newAttack = { ...createTestAttack(), startTime: Date.now(), duration: 45000, progress: 0 };
    setActiveAttacksWrapper(prev => [...prev, newAttack]);
    setLastAttackForAlert(newAttack); // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‡Ø¬Ù…Ø© Ù„Ù„Ø¹Ø±Ø¶ Ù„ÙƒÙ† Ø¨Ø¯ÙˆÙ† ØªØ´ØºÙŠÙ„ Ø¥Ù†Ø°Ø§Ø± Ø¬Ø¯ÙŠØ¯
    setShowOverlay(true);
    setCurrentScreen('main');
    setLiveLog(`ðŸ”´ NEW_ATTACK_VECTOR_DETECTED: ${newAttack.type}`);
    // Ù„Ø§ Ù†Ø´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù‡Ù†Ø§ - ÙÙ‚Ø· Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰ ØªØ´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
  };

  const normalizeMultiAttackCount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 3;
    return Math.min(10, Math.max(1, Math.floor(parsed)));
  };

  const startDoubleAttack = () => {
    if (settings.shieldActive) {
      setLiveLog("ERROR: SHIELD_ACTIVE_BLOCKING_TEST");
      return;
    }

    const [attack1, attack2] = createDoubleAttackVectors();
    const startTime = Date.now();
    const attackA = { ...attack1, startTime, duration: 45000, progress: 0 };
    const attackB = { ...attack2, startTime, duration: 45000, progress: 0 };
    setSelectedAttackForDetail(null);
    setActiveTestAttack(attackA);
    setActiveAttacksWrapper([attackB]);
    setLastAttackForAlert(attackA); // Ø­Ø¯Ø« Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„ÙŠÙ‚Ø±Ø£ Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰
    setDoubleAttackMode(true);
    setIsAttacked(true);
    setShowOverlay(true);
    setAlertSuppressed(false);
    setAlarmPlayedForSession(false); // Ø£Ø¹Ø¯ ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø¹Ù„Ù… Ù„ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
    setHeuristicProgress(0);
    isFinalizing.current = false;
    setCurrentScreen('main');
    setLiveLog("ðŸ”´ DUAL_VECTOR_ATTACK_INITIATED!");
  };

  // Ø¯Ø§Ù„Ø© Ø¬Ø¯ÙŠØ¯Ø©: Ø¥Ø¶Ø§ÙØ© double attack Ø¬Ø¯ÙŠØ¯ Ø¨Ø¯ÙˆÙ† Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ©
  const addDoubleVector = () => {
    if (!isAttacked || settings.shieldActive) return;
    const [attack1, attack2] = createDoubleAttackVectors();
    const now = Date.now();
    const primaryAttack = activeTestAttack || { ...attack1, startTime: now, duration: 45000, progress: 0 };
    const secondaryAttack = { ...attack2, startTime: now, duration: 45000, progress: 0 };
    setActiveTestAttack(primaryAttack);
    setActiveAttacksWrapper(prev => {
      const next = [...prev];
      if (primaryAttack && (!activeTestAttack || primaryAttack.id !== activeTestAttack.id)) {
        next.push(primaryAttack);
      }
      next.push(secondaryAttack);
      return next.filter((attack, index, arr) => attack && arr.findIndex(item => item?.id === attack.id) === index);
    });
    setLastAttackForAlert(attack1); // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‡Ø¬Ù…Ø© Ù„Ù„Ø¹Ø±Ø¶ Ù„ÙƒÙ† Ø¨Ø¯ÙˆÙ† ØªØ´ØºÙŠÙ„ Ø¥Ù†Ø°Ø§Ø± Ø¬Ø¯ÙŠØ¯
    setShowOverlay(true);
    setCurrentScreen('main');
    setLiveLog(`ðŸ”´ DUAL_VECTOR_ATTACK_ADDED: ${attack1.type} + ${attack2.type}`);
    // Ù„Ø§ Ù†Ø´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù‡Ù†Ø§ - ÙÙ‚Ø· Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰ ØªØ´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
  };

  const startMultiAttack = (countOverride) => {
    if (settings.shieldActive) { setLiveLog("ERROR: SHIELD_ACTIVE_BLOCKING_TEST"); return; }
    const count = normalizeMultiAttackCount(countOverride ?? multiAttackCount);
    const startTime = Date.now();
    const newAttacks = [];
    for (let i = 0; i < count; i++) {
      const a = { ...createTestAttack(), startTime, duration: 45000, progress: 0 };
      newAttacks.push(a);
    }

    const [primaryAttack, ...secondaryAttacks] = newAttacks;
    setActiveTestAttack(primaryAttack);
    setActiveAttacksWrapper(secondaryAttacks);
    setDoubleAttackMode(false);
    setIsAttacked(true);
    setShowOverlay(true);
    setAlertSuppressed(false);
    setAlarmPlayedForSession(false); // Ø£Ø¹Ø¯ ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø¹Ù„Ù… Ù„ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
    setHeuristicProgress(0);
    isFinalizing.current = false;
    setCurrentScreen('main');
    setLastAttackForAlert(primaryAttack); // Ø­Ø¯Ø« Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„ÙŠÙ‚Ø±Ø£ Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰
    setLiveLog(`ðŸ”´ MULTI_ATTACKS_INITIATED x${count}`);
  };

  // Ø¯Ø§Ù„Ø© Ø¬Ø¯ÙŠØ¯Ø©: Ø¥Ø¶Ø§ÙØ© multi attack Ø¬Ø¯ÙŠØ¯ Ø¨Ø¯ÙˆÙ† Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ©
  const addMultiVector = (countOverride) => {
    if (!isAttacked || settings.shieldActive) return;
    const count = normalizeMultiAttackCount(countOverride ?? multiAttackCount);
    const addStartTime = Date.now();
    const newAttacks = [];
    for (let i = 0; i < count; i++) {
      const a = { ...createTestAttack(), startTime: addStartTime, duration: 45000, progress: 0 };
      newAttacks.push(a);
    }

    const [primaryAttack, ...secondaryAttacks] = newAttacks;
    if (!activeTestAttack) {
      setActiveTestAttack(primaryAttack);
      setActiveAttacksWrapper(secondaryAttacks);
    } else {
      setActiveAttacksWrapper(prev => [...prev, ...newAttacks]);
    }
    setLastAttackForAlert(primaryAttack); // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‡Ø¬Ù…Ø© Ù„Ù„Ø¹Ø±Ø¶ Ù„ÙƒÙ† Ø¨Ø¯ÙˆÙ† ØªØ´ØºÙŠÙ„ Ø¥Ù†Ø°Ø§Ø± Ø¬Ø¯ÙŠØ¯
    setShowOverlay(true);
    setCurrentScreen('main');
    setLiveLog(`ðŸ”´ NEW_ATTACKS_ADDED x${count}`);
    // Ù„Ø§ Ù†Ø´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù‡Ù†Ø§ - ÙÙ‚Ø· Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰ ØªØ´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
  };

  const startLoopbackAttack = (type) => {
    if (isAttacked || settings.shieldActive) return;
    const lbAttack = { ...createLoopbackAttack(type), startTime: Date.now(), duration: 45000, progress: 0 };
    setActiveTestAttack(lbAttack);
    setSelectedAttackForDetail(lbAttack);
    setLastAttackForAlert(lbAttack); // Ø­Ø¯Ø« Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„ÙŠÙ‚Ø±Ø£ Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©
    setActiveAttacks([]);
    setDoubleAttackMode(false);
    setShowMultiAttackDetail(false);
    setAlertSuppressed(false);
    setAlarmPlayedForSession(false); // Ø£Ø¹Ø¯ ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø¹Ù„Ù… Ù„ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
    setIsAttacked(true);
    setShowOverlay(true);
    setShowLoopbackMenu(false);
    setHeuristicProgress(0);
    isFinalizing.current = false;
    setCurrentScreen('main');
    setLiveLog(`âš ï¸ EXECUTING: ${lbAttack.type}`);
  };

  // Ø¯Ø§Ù„Ø© Ø¬Ø¯ÙŠØ¯Ø©: Ø¥Ø¶Ø§ÙØ© loopback attack Ø¬Ø¯ÙŠØ¯ Ø¨Ø¯ÙˆÙ† Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ©
  const addLoopbackVector = (type) => {
    if (!isAttacked || settings.shieldActive) return;
    const lbAttack = { ...createLoopbackAttack(type), startTime: Date.now(), duration: 45000, progress: 0 };
    if (!activeTestAttack) {
      setActiveTestAttack(lbAttack);
      setActiveAttacksWrapper([]);
    } else {
      setActiveAttacksWrapper(prev => [...prev, lbAttack]);
    }
    setLastAttackForAlert(lbAttack); // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‡Ø¬Ù…Ø© Ù„Ù„Ø¹Ø±Ø¶ Ù„ÙƒÙ† Ø¨Ø¯ÙˆÙ† ØªØ´ØºÙŠÙ„ Ø¥Ù†Ø°Ø§Ø± Ø¬Ø¯ÙŠØ¯
    setShowOverlay(true);
    setCurrentScreen('main');
    setLiveLog(`âš ï¸ NEW_LOOPBACK_ADDED: ${lbAttack.type}`);
    // Ù„Ø§ Ù†Ø´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù‡Ù†Ø§ - ÙÙ‚Ø· Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰ ØªØ´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
  };

  const openAttackDetail = (attack) => {
    setSelectedAttackForDetail(attack);
    setActiveTestAttack(attack);
    setLastAttackForAlert(attack); // Ø­Ø¯Ø« Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„ÙŠÙ‚Ø±Ø£ IP Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ù…Ø®ØªØ§Ø±Ø©
    setCurrentScreen('attack_details');
    setActiveModule(null);
    setShowOverlay(true);
    setShowMultiAttackDetail(false);
  };

  const closeOverlay = () => {
    window.speechSynthesis.cancel();
    if (sirenAudio.current) {
      sirenAudio.current.pause();
      sirenAudio.current.currentTime = 0;
    }
    if (heuristicProgress < 100 && isAttacked) {
      setShowOverlay(false);
      setActiveModule(prev => prev === 'post_incident' ? null : prev);
      return;
    }
    if (!isAttacked) {
      setCurrentScreen('main');
      setShowOverlay(false);
      setActiveModule(prev => prev === 'post_incident' ? null : prev);
      return;
    }
    finalizeAttackAndSave();
  };

  // Ø¯Ø§Ù„Ø© Ø¬Ø¯ÙŠØ¯Ø©: Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ù€ overlay Ù Ù‚Ø· Ø¨Ø¯ÙˆÙ† Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ù‡Ø¬Ù…Ø©
  const hideOverlay = () => {
    setShowOverlay(false);
  };

  const handleNodeClick = (node, event) => {
    if (node) {
      if (node.isAttacker || node.threat) {
        const attackData = node.ip ? node : (activeTestAttack || {});
        const locParts = (attackData.loc || "").split(', ');
        const derivedCity = locParts[0] || "MISSING";
        const derivedCountry = locParts[1] || "MISSING";

        const attackerNode = {
          ...attackData,
          isAttacker: true,
          title: "ATTACK_SOURCE",
          displayIp: attackData.ip || "UNKNOWN_IP",
          displayCity: attackData.city || derivedCity,
          displayCountry: attackData.country || derivedCountry,
          displayIsp: attackData.isp || "UNKNOWN_ISP",
          displayType: attackData.type || "UNKNOWN_VECTOR",
          displayThreat: attackData.threat || "CRITICAL",
          displayCoords: node.coords ? `${node.coords.lat.toFixed(2)}, ${node.coords.lng.toFixed(2)}` : "N/A"
        };
        setSelectedNode(attackerNode);
      } else {
        const systemNode = {
          ...node,
          isAttacker: false,
          title: `NODE_${node.node_id || "UX-99"}`,
          cpu: serverStats.cpu,
          ram: serverStats.ram,
          network: serverStats.network,
          os: "IOT-Kernel v4.2-Hardened",
          latency: (isAttacked ? 200 : 25) + "ms",
          uptime: "12d 04h 22m",
          firewall: isAttacked ? "!!! BREACHED !!!" : "ACTIVE (Encrypted)",
          security_score: isAttacked ? "CRITICAL (22%)" : "SECURE (98%)"
        };
        setSelectedNode(systemNode);
      }
      setMousePos({ x: event.clientX + 15, y: event.clientY - 80 });
    }
  };

  return (
    <>
      {!isGateOpen && <GateController onUnlock={() => setIsGateOpen(true)} />}

      {isGateOpen && (
        <div className={`hacker-theme ${settings.stealthMode ? 'stealth-active' : ''}`}>

          <main className="map-wrapper-full" style={{
            opacity: (!showOverlay && !activeModule) ? 1 : 0.4,
            filter: (!showOverlay && !activeModule) ? 'none' : 'blur(8px)',
            pointerEvents: activeModule ? 'none' : 'auto',
            transition: 'opacity 0.4s ease, filter 0.4s ease'
          }}>
            <div className="scanline"></div>
            <LiveMap
              isAttacked={isAttacked && currentScreen === 'main'}
              attackerData={activeTestAttack}
              attackerCoords={activeTestAttack?.coords}
              activeAttacks={activeAttacks}
              onNodeClick={handleNodeClick}
              shieldActive={settings.shieldActive}
            />

            {selectedNode && (
              <div className="node-info-overlay" style={{ top: mousePos.y, left: mousePos.x, pointerEvents: 'all' }}>
                <button className="close-mini" onClick={() => setSelectedNode(null)}>Ã—</button>
                <div className="overlay-header">
                  <div className={`pulse-dot ${selectedNode.isAttacker ? 'red' : (isAttacked ? 'red' : 'green')}`}></div>
                  <h4 className="neon-txt">{selectedNode.title}</h4>
                </div>
                <div className="info-grid">
                  {selectedNode.isAttacker ? (
                    <>
                      <div className="info-row"><span>COUNTRY:</span> <span className="val-red">{selectedNode.displayCountry}</span></div>
                      <div className="info-row"><span>CITY:</span> <span className="val-red">{selectedNode.displayCity}</span></div>
                      <div className="info-row"><span>IP_ADDR:</span> <span className="val-red">{selectedNode.displayIp}</span></div>
                      <div className="info-row"><span>COORDS:</span> <span className="val-yellow">{selectedNode.displayCoords}</span></div>
                      <div className="info-row"><span>THREAT:</span> <span className="val-red pulse">{selectedNode.displayThreat}</span></div>
                    </>
                  ) : (
                    <>
                      <div className="info-row"><span>OS_SYS:</span> <span className="val">{selectedNode.os}</span></div>
                      <div className="info-row"><span>IP_ADDR:</span> <span className="val-green">{selectedNode.ip || "10.0.0.105"}</span></div>
                      <div className="info-row"><span>NET_I/O:</span> <span className="val-yellow">{selectedNode.network}</span></div>
                      <div className="info-row"><span>LATENCY:</span> <span className={isAttacked ? "val-red" : "val-yellow"}>{selectedNode.latency}</span></div>
                      <div className="info-row"><span>STATUS:</span> <span className={isAttacked ? "val-red pulse" : "val-green"}>{selectedNode.security_score}</span></div>
                      <div className="info-row"><span>CPU_LOAD:</span>
                        <div className="mini-bar">
                          <div className="fill fill-glow"
                            style={{ width: selectedNode.cpu, background: isAttacked ? '#ff0000' : '#00ff41', boxShadow: isAttacked ? '0 0 10px #ff0000' : 'none' }}></div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </main>

          <Header settings={settings} isAttacked={isAttacked} time={time} liveLog={liveLog} onEndAttack={finalizeAttackAndSave} />

          <nav className="side-nav-large" style={{ zIndex: 200000, pointerEvents: 'all', position: 'fixed' }}>
            <div className="nav-items-wrapper">
              {menuItems.map(item => (
                <div key={item.id} className={`nav-item-container ${activeModule === item.id ? 'active' : ''}`}
                  onClick={() => { setActiveModule(item.id); }}>
                  <div className={`nav-icon-box ${isAttacked && item.id !== 'config' ? 'nav-icon-attack' : ''}`}
                    style={{ color: (isAttacked && item.id !== 'config') ? '#ff0000' : '#00ff41' }}>
                    <item.Component />
                  </div>
                  <span className="nav-label-text" style={{ color: (isAttacked && item.id !== 'config') ? '#ff0000' : '#00ff41' }}>
                    {item.label}
                  </span>
                  {isAttacked && (item.id === 'live' || item.id === 'network' || item.id === 'history') && (
                    <div className="mini-alert-dot pulse-red"></div>
                  )}
                </div>
              ))}
            </div>
          </nav>

          <div style={{
            marginLeft: activeModule ? '0px' : '80px',
            width: activeModule ? '100%' : 'calc(100% - 80px)',
            pointerEvents: showOverlay ? 'all' : 'none',
            opacity: showOverlay ? 1 : 0,
            visibility: showOverlay ? 'visible' : 'hidden',
            position: 'fixed', top: 0, zIndex: 20000, height: '100%'
          }}>
            <AttackOverlay
              isAttacked={isAttacked}
              currentScreen={currentScreen}
              activeTestAttack={activeTestAttack}
              activeAttacks={activeAttacks}
              doubleAttackMode={doubleAttackMode}
              detailAttack={selectedAttackForDetail}
              alertSuppressed={alertSuppressed}
              heuristicProgress={heuristicProgress}
              lastAttackForAlert={lastAttackForAlert}
              toggleAttack={toggleAttack}
              onEndAttack={finalizeAttackAndSave}
              onDetailView={openAttackDetail}
              onCloseOverlay={closeOverlay}
              onHideOverlay={hideOverlay}
              setCurrentScreen={setCurrentScreen}
            />
          </div>

          {activeModule === 'live' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" type="button" aria-label="Close" title="Close" onClick={() => setActiveModule(null)}>✕</button>
              <LiveThreatsModule
                isAttacked={isAttacked}
                doubleAttackMode={doubleAttackMode}
                activeAttacks={activeAttacks}
                activeTestAttack={activeTestAttack}
                onSelectAttack={openAttackDetail}
                onOpenMultiDashboard={() => { setShowOverlay(true); setCurrentScreen('double_attack'); }}
                onEndAttack={finalizeAttackAndSave}
              />
            </div>
          )}

          {activeModule === 'network' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" type="button" aria-label="Close" title="Close" onClick={() => setActiveModule(null)}>✕</button>
              <NetworkModule activeAttack={activeTestAttack} activeAttacks={activeAttacks} onSelectAttack={openAttackDetail} serverStats={serverStats} />
            </div>
          )}

          {activeModule === 'history' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all', background: '#020b02' }}>
              <button className="close-btn-lg" type="button" aria-label="Close" title="Close" onClick={() => setActiveModule(null)}>✕</button>
              <HistoryModule historyList={historyList} onClearHistory={() => { historyList.forEach(a => discardedAlertIds.current.add(a.id)); setHistoryList([]); }} />
            </div>
          )}

          {activeModule === 'analysis' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" type="button" aria-label="Close" title="Close" onClick={() => setActiveModule(null)}>✕</button>
              <AnalysisScreen onClose={() => setActiveModule(null)} isAttacked={isAttacked} activeAttack={activeTestAttack || null} activeAttacks={activeAttacks} settings={settings} />
            </div>
          )}

          {activeModule === 'config' && (
            <div key="config" className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" type="button" aria-label="Close" title="Close" onClick={() => setActiveModule(null)}>✕</button>
              <ConfigModal settings={settings} setSettings={setSettings} activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
          )}

          {activeModule === 'raw_ai' && (
            <div key="raw_ai" className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" type="button" aria-label="Close" title="Close" onClick={() => setActiveModule(null)}>✕</button>
              <RawAIModule />
            </div>
          )}

          {!activeModule && !showOverlay && (
            <div className="bottom-controls" style={{
              display: 'flex',
              zIndex: 100005, pointerEvents: 'all', position: 'fixed', bottom: '40px', right: '40px', gap: '15px', flexDirection: 'column', alignItems: 'flex-end'
            }}>

              {isAttacked && (
                <button
                  onClick={finalizeAttackAndSave}
                  className="control-btn-pro"
                  style={{ background: '#ff0000', borderColor: '#ff0000', color: '#ffffff', boxShadow: '0 0 20px rgba(255,0,0,0.8)', width: '220px', fontWeight: '900' }}
                >
                  🛑 END ATTACK NOW
                </button>
              )}

              {showLoopbackMenu && (
                <div className="loopback-selector-popup">
                  <div className="popup-tag">// SELECT_ATTACK_VECTOR</div>
                  <button onClick={() => { setShowLoopbackSubMenu(false); setShowMultiCountInput(false); setShowLoopbackMenu(false); if (isAttacked) { addNewVector(); } else { toggleAttack(); } }}>EXTERNAL_TEST</button>
                  <button onClick={() => { setShowLoopbackSubMenu(false); setShowMultiCountInput(false); setShowLoopbackMenu(false); if (isAttacked) { addDoubleVector(); } else { startDoubleAttack(); } }}>DUAL_ATTACK</button>

                  <button
                    onClick={() => {
                      setShowLoopbackSubMenu(prev => !prev);
                      setShowMultiCountInput(false);
                    }}
                    className="menu-group-btn"
                  >
                    LOOPBACK_MODE
                  </button>
                  {showLoopbackSubMenu && (
                    <div className="attack-submenu">
                      <button onClick={() => { setShowLoopbackMenu(false); if (isAttacked) { addLoopbackVector('BRUTE'); } else { startLoopbackAttack('BRUTE'); } }}>01_BRUTE_FORCE</button>
                      <button onClick={() => { setShowLoopbackMenu(false); if (isAttacked) { addLoopbackVector('DDOS'); } else { startLoopbackAttack('DDOS'); } }}>02_DDoS_FLOOD</button>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setShowMultiCountInput(prev => !prev);
                      setShowLoopbackSubMenu(false);
                    }}
                    className="menu-group-btn"
                  >
                    MULTI_ATTACK
                  </button>
                  {showMultiCountInput && (
                    <div className="attack-submenu">
                      <label className="submenu-label" htmlFor="multi-count">COUNT (1-10)</label>
                      <input
                        id="multi-count"
                        className="attack-count-input"
                        type="number"
                        min="1"
                        max="10"
                        value={multiAttackCount}
                        onChange={(e) => setMultiAttackCount(e.target.value)}
                      />
                      <button onClick={() => { setShowLoopbackMenu(false); if (isAttacked) { addMultiVector(multiAttackCount); } else { startMultiAttack(multiAttackCount); } }}>
                        APPLY_MULTI
                      </button>
                    </div>
                  )}

                  <button className="cancel-btn" onClick={() => { setShowLoopbackMenu(false); setShowLoopbackSubMenu(false); setShowMultiCountInput(false); }}>CLOSE</button>
                </div>
              )}

              <button
                onClick={() => {
                  setShowLoopbackMenu(prev => !prev);
                  setShowLoopbackSubMenu(false);
                  setShowMultiCountInput(false);
                }}
                className={`control-btn-pro loopback-btn ${showLoopbackMenu ? 'active' : ''}`}
              >
                ATTACK_TEST
              </button>

              {!isAttacked && (
                <button
                  onClick={() => setShowLogUpload(true)}
                  className="control-btn-pro"
                  style={{ borderColor: '#00aaff !important', color: '#00aaff', background: 'transparent', border: '1px solid #00aaff' }}
                >
                  IMPORT_LOGS
                </button>
              )}
            </div>
          )}

          {showLogUpload && (
            <LogUploadModal
              onClose={() => setShowLogUpload(false)}
              onUploadComplete={(data) => {
                setShowLogUpload(false);
                setLiveLog(`LOG_IMPORT_QUEUED: ${data.pipeline_id?.substring(0, 8)}... | AWAITING_AI_ANALYSIS`);
              }}
            />
          )}

          {showMultiAttackDetail && selectedAttackForDetail && (
            <div className="advanced-detail-overlay">
              <div className="detail-header-pro">
                <h1>{">>"} ATTACK_VECTOR_ANALYSIS_DETAILED</h1>
                <button onClick={() => setShowMultiAttackDetail(false)}>Ã—</button>
              </div>
              <div className="detail-grid-pro">
                <div className="threat-section">
                  <h2>ðŸ”´ THREAT_DETAILS</h2>
                  <p><strong>SOURCE_IP:</strong> <span>{selectedAttackForDetail.ip}</span></p>
                  <p><strong>TYPE:</strong> <span>{selectedAttackForDetail.type}</span></p>
                  <p><strong>THREAT:</strong> <span style={{ color: '#ff0000' }}>{selectedAttackForDetail.threat}</span></p>
                </div>
                <div className="analysis-section">
                  <h2>ðŸŸ¢ ANALYSIS_&_METRICS</h2>
                  <div className="risk-bar"><div style={{ width: selectedAttackForDetail.threat }}></div></div>
                  <p><strong>STATUS:</strong> <span>ACTIVE_BLOCKING</span></p>
                </div>
              </div>
              <div className="detail-footer-pro">
                <button onClick={() => setShowMultiAttackDetail(false)}>CLOSE</button>
                <button onClick={() => { addToHistory({ ...selectedAttackForDetail, status: 'LOGGED' }); setShowMultiAttackDetail(false); }} disabled={isAttacked}>SAVE_TO_HISTORY</button>
              </div>
            </div>
          )}

          <style>{`
            .control-btn-pro { background: #00ff41; border: 1px solid #00ff41; color: #000; padding: 12px 25px; cursor: pointer; font-weight: bold; font-family: monospace; letter-spacing: 2px; transition: 0.3s; width: 220px; }
            .advanced-detail-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.98); z-index: 50000; display: flex; flex-direction: column; color: #00ff41; font-family: monospace; }
            .pulse-red { animation: pulse-red-anim 1s infinite; }
            @keyframes pulse-red-anim { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
            
            .loopback-selector-popup { background: rgba(0,0,0,0.95); border: 1px solid #ff00ff; padding: 10px; width: 240px; display: flex; flex-direction: column; gap: 5px; box-shadow: 0 0 30px rgba(255,0,255,0.2); margin-bottom: 5px; }
            .popup-tag { font-size: 9px; color: #ff00ff; opacity: 0.6; padding: 5px; border-bottom: 1px solid #ff00ff33; }
            .loopback-selector-popup button { background: transparent; border: 1px solid transparent; color: #ff00ff; padding: 10px; text-align: left; font-family: monospace; cursor: pointer; transition: 0.2s; }
            .loopback-selector-popup button:hover { background: rgba(255,0,255,0.1); border-color: #ff00ff; }
            .menu-group-btn { font-weight: 700; }
            .attack-submenu { display: flex; flex-direction: column; gap: 5px; padding: 4px 0 4px 10px; border-left: 1px solid #ff00ff33; }
            .submenu-label { font-size: 9px; color: #ff00ff; opacity: 0.7; letter-spacing: 1px; }
            .attack-count-input { background: rgba(255,0,255,0.08); border: 1px solid #ff00ff55; color: #fff; padding: 8px; font-family: monospace; }
            .cancel-btn { color: #666 !important; font-size: 10px !important; text-align: center !important; }
            .loopback-btn { border-color: #ff00ff !important; color: #ff00ff !important; background: transparent !important; }
            .loopback-btn:hover:not(:disabled), .loopback-btn.active { background: #ff00ff !important; color: #000 !important; }
            .dual-btn { border-color: #ff3e3e !important; color: #ff3e3e !important; background: transparent !important; }
            .dual-btn:hover:not(:disabled) { background: #ff3e3e !important; color: #000 !important; }
            .node-info-overlay { 
                position: fixed; background: rgba(0,0,0,0.9); border: 1px solid #00ff41; padding: 15px; 
                color: #00ff41; font-family: monospace; z-index: 100000; min-width: 250px; 
                box-shadow: 0 0 20px rgba(0,255,65,0.2);
            }
            .info-grid { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
            .info-row { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(0,255,65,0.1); padding-bottom: 4px; }
            .val-red { color: #ff3e3e; }
            .val-yellow { color: #ffff00; }
            .val-green { color: #00ff41; }
            .pulse { animation: neon-pulse 1.5s infinite; }
            @keyframes neon-pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
          `}</style>
        </div>
      )}
    </>
  );
}

export default App;
