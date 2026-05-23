import React, { useState, useRef, useEffect, useCallback } from 'react';
import LiveMap from './components/LiveMap';
import NetworkModule from './components/NetworkModule';
import HistoryModule from './components/HistoryModule';
import AttackOverlay from './components/AttackOverlay';
import AnalysisScreen from './components/AnalysisScreen';
import GateController from './components/GateController';

import Icons from './components/Icons';
import Header from './components/Header';
import ConfigModal from './components/ConfigModal';
import LiveThreatsModule from './components/LiveThreatsModule';
import { randomItem, generateRandomIP, createTestAttack, createDoubleAttackVectors, createLoopbackAttack } from './components/attackEngine';
import { sfx } from './logic/SFXEngine';

import './App.css';
import { initialHistoryData } from './data/attackData';

const menuItems = [
  { id: 'live', label: 'LIVE THREATS', Component: Icons.Live },
  { id: 'network', label: 'NETWORK', Component: Icons.Network },
  { id: 'history', label: 'ATTACK HISTORY', Component: Icons.History },
  { id: 'analysis', label: 'ANALYSIS', Component: Icons.Analysis },
  { id: 'config', label: 'SETTINGS', Component: Icons.Config },
];

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
  const [doubleAttackMode, setDoubleAttackMode] = useState(false);
  const [selectedAttackForDetail, setSelectedAttackForDetail] = useState(null);
  const [showMultiAttackDetail, setShowMultiAttackDetail] = useState(false);
  const [alertSuppressed, setAlertSuppressed] = useState(false);
  const [heuristicProgress, setHeuristicProgress] = useState(0);
  const [historyList, setHistoryList] = useState(initialHistoryData);
  const [liveLog, setLiveLog] = useState("SYSTEM_IDLE");
  const [serverStats, setServerStats] = useState({ cpu: "0%", ram: "0 GB / 8GB", network: "â†“ 0.0 KB/s | â†‘ 0.0 KB/s" });

  const [showLoopbackMenu, setShowLoopbackMenu] = useState(false);
  const [lastAttackForAlert, setLastAttackForAlert] = useState(null); // Ù„ØªØªØ¨Ø¹ Ø¢Ø®Ø± Ù‡Ø¬Ù…Ø© Ù„Ù„Ø¥Ù†Ø°Ø§Ø±
  const [alarmPlayedForSession, setAlarmPlayedForSession] = useState(false); // Ù„Ø¶Ù…Ø§Ù† ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø© ÙÙ‚Ø·
  const isSpeaking = useRef(false); // Ù„Ù…Ù†Ø¹ ØªØ´ØºÙŠÙ„ ÙˆØ¸ÙŠÙØªÙŠÙ† Ù†Ø·Ù‚ ÙÙŠ Ù†ÙØ³ Ø§Ù„ÙˆÙ‚Øª
  const alertShownForAttackIds = useRef(new Set()); // ØªØªØ¨Ø¹ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„ØªÙŠ ØªÙ… Ø¹Ø±Ø¶ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„Ù‡Ø§

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
      if (exists) return prev;

      // Ø§Ù„ØªØ¹Ø¯ÙŠÙ„: Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø£Ù† Ø§Ù„Ù‡Ø¬ÙˆÙ… Ø§Ù„Ø¬Ø¯ÙŠØ¯ ÙŠØ¶Ø§Ù ÙÙŠ Ø¨Ø¯Ø§ÙŠØ© Ø§Ù„Ù…ØµÙÙˆÙØ©
      return [{ ...attack, timestamp: new Date().toLocaleTimeString() }, ...prev];
    });
  }, []);

  useEffect(() => {
    if (sirenAudio.current) sirenAudio.current.volume = settings.alertVolume;
  }, [settings.alertVolume]);

  const playFemaleAlert = useCallback(() => {
    // Ø¥Ø°Ø§ ÙƒØ§Ù† Ù‡Ù†Ø§Ùƒ Ù†Ø·Ù‚ Ø¬Ø§Ø±Ù Ø£Ùˆ Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ù…ÙƒØªÙˆÙ…Ø©ØŒ Ø§Ø®Ø±Ø¬ ÙÙˆØ±Ø§Ù‹
    if (isSpeaking.current || alertSuppressed || !showOverlay) return;

    const currentAttack = lastAttackForAlert;

    // Ø¥Ø°Ø§ Ù„Ù… ÙŠÙˆØ¬Ø¯ Ù‡Ø¬ÙˆÙ… Ø£Ùˆ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù‚Ø¯ Ø¹ÙØ±Ø¶ Ø¨Ø§Ù„ÙØ¹Ù„ Ù„Ù‡Ø°Ù‡ Ø§Ù„Ù‡Ø¬Ù…Ø©ØŒ Ù„Ø§ ØªÙØ¹Ù„ Ø´ÙŠØ¦Ø§Ù‹
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
        isSpeaking.current = false; // ØªØ­Ø±ÙŠØ± Ø§Ù„Ù‚ÙÙ„ Ø¹Ù†Ø¯ Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ ØªÙ…Ø§Ù…Ø§Ù‹
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
        const res = await fetch(`${backendUrl}/report/alerts?limit=15&_t=${Date.now()}`, {
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
          data.alerts.some(a => {
            const ra = a?.details?.received_at;
            const utcRa = ra ? (ra.endsWith('Z') ? ra : ra + 'Z') : '';
            const ms = utcRa ? Date.parse(utcRa) : NaN;
            return Number.isFinite(ms) && Math.abs(nowMs - ms) <= 90_000;
          });

        if (data.status === "success" && data.alerts && data.alerts.length > 0) {
          data.alerts.forEach(alert => {
            const alertId = alert.id || ('EV-' + alert.src_ip + '-' + alert.attack_type);

            const receivedAtIso = alert?.details?.received_at;
            const utcRa = receivedAtIso ? (receivedAtIso.endsWith('Z') ? receivedAtIso : receivedAtIso + 'Z') : '';
            const receivedAtMs = utcRa ? Date.parse(utcRa) : NaN;
            const lastSeenSeconds = Number(alert.last_seen ?? alert.timestamp ?? alert.first_seen ?? 0) || 0;
            const instanceCount = Number(alert.instance_count ?? 0) || 0;

            // Token changes when the backend ingests new events for the same AGG id
            const token = String(
              Number.isFinite(receivedAtMs)
                ? receivedAtMs
                : (receivedAtIso || '')
            ) + '|' + String(instanceCount);
            const prevToken = seenAlertToken.current.get(alertId);

            // Skip duplicates after initial load
            if (!initialPoll && prevToken === token) return;
            seenAlertToken.current.set(alertId, token);

            const dateStr = Number.isFinite(receivedAtMs)
              ? new Date(receivedAtMs).toISOString().replace('T', ' ').split('.')[0]
              : (alert.timestamp
                ? new Date(alert.timestamp * 1000).toISOString().replace('T', ' ').split('.')[0]
                : new Date().toISOString().replace('T', ' ').split('.')[0]);

            const timeline = [];
            const timeStr = dateStr.split(' ')[1] || "00:00:00";
            const targetPort = alert.dest_port || alert.details?.dest_port || "Unknown";
            timeline.push(`[${timeStr}] - INBOUND CONNECTION DETECTED ON PORT ${targetPort}`);
            timeline.push(`[${timeStr}] - AI SCANNER IDENTIFIED SIGNATURE: ${alert.attack_type || 'UNKNOWN'}`);
            if (alert.details?.explanation) {
                timeline.push(`[${timeStr}] - AI ANALYSIS: ${alert.details.explanation.substring(0, 150)}...`);
            } else if (alert.details?.command) {
                timeline.push(`[${timeStr}] - MALICIOUS COMMAND EXECUTED: ${alert.details.command}`);
            } else {
                timeline.push(`[${timeStr}] - DEPLOYING VIRTUAL FILE_SYSTEM DECOY`);
            }
            timeline.push(`[${timeStr}] - ATTACKER IP ${alert.src_ip || 'Unknown'} BLACKLISTED`);
            timeline.push(`[${timeStr}] - SESSION PURGED | LOGGING INCIDENT`);

            const mappedAttack = {
              id: alertId,
              date: dateStr,
              type: alert.attack_type || 'UNKNOWN',
              attack: alert.attack_type || 'UNKNOWN',
              attack_type: alert.attack_type || 'UNKNOWN',
              ip: alert.src_ip || 'Unknown',
              src_ip: alert.src_ip || 'Unknown',
              port: alert.dest_port || 0,
              proto: alert.protocol || 'TCP',
              loc: 'Unknown, UN',
              city: 'Unknown',
              country: 'UN',
              threat: '99%',
              severity: alert.details?.severity || '99%',
              coords: { 
                lat: (Math.random() * 100 - 50), 
                lng: (Math.random() * 200 - 100) 
              },
              status: 'DETECTED',
              packetSize: '1500 MTU',
              isp: 'Unknown',
              reputation: 'MALICIOUS',
              livePayload: 'Backend Log',
              detail: JSON.stringify(alert.details || {}),
              last_seen: lastSeenSeconds,
              received_at: receivedAtIso || null,
              instance_count: instanceCount,
              startTime: Date.now(),
              duration: 60000 + Math.random() * 30000,
              progress: 0,
              eventTimeline: timeline
            };
            
            const isRecent = Number.isFinite(receivedAtMs) && Math.abs(nowMs - receivedAtMs) <= 90_000;
            
            // Only suppress parsing into Active Attacks if it's the very first page load AND the attack is old.
            // But we always allow it to be pushed if we are live testing (polling)!
            if (initialPoll && !isRecent) {
                addToHistory({ ...mappedAttack, status: 'MITIGATED' });
                fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/report/attacker-stats?src_ip=${alert.src_ip}`).then(r => r.json()).then(d => {
                  if (d?.stats) setHistoryList(curr => curr.map(h => h.id === mappedAttack.id ? { ...h, ...d.stats } : h));
                }).catch(()=>{});
                return;
            }

            setActiveAttacks(prev => {
              const next = prev.filter(a => a.id !== mappedAttack.id);
              return [{ ...mappedAttack, timestamp: new Date().toLocaleTimeString() }, ...next];
            });
            if (!initialPoll) addToHistory(mappedAttack);
            setActiveTestAttack(mappedAttack);
            setLastAttackForAlert(mappedAttack);
            
            fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/report/attacker-stats?src_ip=${alert.src_ip}`).then(r => r.json()).then(d => {
              if (d?.stats) {
                setActiveAttacks(curr => curr.map(a => a.id === mappedAttack.id ? { ...a, ...d.stats } : a));
                setActiveTestAttack(curr => curr?.id === mappedAttack.id ? { ...curr, ...d.stats } : curr);
                setHistoryList(curr => curr.map(h => h.id === mappedAttack.id ? { ...h, ...d.stats } : h));
              }
            }).catch(()=>{});

            if (!isAttacked) {
              setIsAttacked(true);
              setAlarmPlayedForSession(false); // Ø£Ø¹Ø¯ ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„Ø¬Ù„Ø³Ø© Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©
            }

            // Make new backend alerts visible immediately.
            if (!initialPoll || shouldShowOverlayOnInitial) setShowOverlay(true);
          });
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
    // Faster polling so replayed logs show up quickly.
    const interval = setInterval(fetchWrapper, 250);
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
        setLiveLog(logs[Math.floor(Math.random() * logs.length)]);

        if (activeTestAttack) {
          setActiveTestAttack(prev => prev ? ({
            ...prev,
            livePayload: (Math.random() * 500 + 100).toFixed(1) + " MB/s"
          }) : null);
        }

        if (selectedNode && !selectedNode.isAttacker) {
          setSelectedNode(prev => prev ? ({
            ...prev,
            latency: Math.floor(Math.random() * 150 + 200) + "ms"
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
        // Ø§Ø­Ø³Ø¨ Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø© (activeTestAttack + activeAttacks)
        const totalAttacks = (activeTestAttack ? 1 : 0) + activeAttacks.length;

        // Ø§Ù†ØªÙ‚Ù„ Ø¥Ù„Ù‰ Ø´Ø§Ø´Ø© Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„Ù…ØªØ¹Ø¯Ø¯Ø© Ø¥Ø°Ø§ ÙƒØ§Ù† Ù‡Ù†Ø§Ùƒ Ù‡Ø¬Ù…ØªØ§Ù† Ø£Ùˆ Ø£ÙƒØ«Ø±
        if (totalAttacks >= 2) {
          setCurrentScreen('double_attack');
        } else if (activeTestAttack || activeAttacks.length === 1) {
          setCurrentScreen('attack_details');
        }

        // Ø¹Ø±Ø¶ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰/Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ø¥Ø°Ø§ Ù„Ù… ÙŠØªÙ… Ø¹Ø±Ø¶Ù‡
        const firstAttack = activeTestAttack || (activeAttacks.length > 0 ? activeAttacks[0] : null);
        if (firstAttack && !firstAttack.alertShown) {
          playFemaleAlert();
        }
      }, 3500);
    }
    return () => clearTimeout(timer);
  }, [isAttacked, currentScreen, showOverlay, activeAttacks.length, activeTestAttack?.id, playFemaleAlert]);

  const finalizeAttackAndSave = useCallback(() => {
    if (isFinalizing.current) return;
    isFinalizing.current = true;

    attackRef.current = false;
    window.speechSynthesis.cancel();
    if (sirenAudio.current) {
      sirenAudio.current.pause();
      sirenAudio.current.currentTime = 0;
    }

    const savedAttacks = [];
    // Ø§Ø­ÙØ¸ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø© (Ø³ÙˆØ§Ø¡ ÙƒØ§Ù†Øª Ù…Ù† activeAttacks Ø£Ùˆ activeTestAttack)
    if (activeAttacks.length > 0) {
      activeAttacks.forEach(attack => savedAttacks.push({ ...attack, status: 'MITIGATED' }));
    }
    if (activeTestAttack && !activeAttacks.some(a => a.id === activeTestAttack.id)) {
      savedAttacks.push({ ...activeTestAttack, status: 'MITIGATED' });
    }

    if (savedAttacks.length > 0) savedAttacks.forEach(attack => addToHistory(attack));
    isSpeaking.current = false;
    window.speechSynthesis.cancel();

    setIsAttacked(false);
    setShowOverlay(false);
    setActiveTestAttack(null);
    setActiveAttacks([]);
    setLastAttackForAlert(null); // Ø£Ø¹Ø¯ ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
    setAlarmPlayedForSession(false); // Ø£Ø¹Ø¯ ØªØ¹ÙŠÙŠÙ† Ø¹Ù„Ù… Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„Ù„Ø¬Ù„Ø³Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©
    setDoubleAttackMode(false);
    setAlertSuppressed(false);
    setSelectedAttackForDetail(null);
    setShowMultiAttackDetail(false);
    setHeuristicProgress(0);
    setCurrentScreen('main');
    setActiveModule(null);
    // alertShownForAttackIds.current.clear(); // Ù…Ø³Ø­ Ø³Ø¬Ù„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±Ø§Øª
    // seenAlertToken.current.clear(); // Disabled to fix loop bug // Allow backend attacks to re-appear after mitigation

    setTimeout(() => { isFinalizing.current = false; }, 500);
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
        setActiveAttacks(prev => {
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
    }, 500);

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
      setActiveAttacks(prev => {
        const now = Date.now();
        // Ù…Ø¯Ø© Ø§Ù„Ù‡Ø¬Ù…Ø© Ù„ÙƒÙ„ Ù‡Ø¬Ù…Ø© (25-35 Ø«Ø§Ù†ÙŠØ©)
        const remaining = prev.filter(attack => {
          const attackStartTime = attack.startTime || Date.now();
          const attackDuration = attack.duration || (40000 + Math.random() * 20000);
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
      const newAttack = { ...createTestAttack(), startTime: Date.now(), duration: 40000 + Math.random() * 20000, progress: 0 };
      setActiveTestAttack(newAttack);
      setSelectedAttackForDetail(newAttack);
      setLastAttackForAlert(newAttack); // Ø­Ø¯Ø« Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„ÙŠÙ‚Ø±Ø£ Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©
      setActiveAttacks([]);
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
    const newAttack = { ...createTestAttack(), startTime: Date.now(), duration: 40000 + Math.random() * 20000, progress: 0 };
    setActiveAttacks(prev => [...prev, newAttack]);
    setLastAttackForAlert(newAttack); // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‡Ø¬Ù…Ø© Ù„Ù„Ø¹Ø±Ø¶ Ù„ÙƒÙ† Ø¨Ø¯ÙˆÙ† ØªØ´ØºÙŠÙ„ Ø¥Ù†Ø°Ø§Ø± Ø¬Ø¯ÙŠØ¯
    setShowOverlay(true);
    setCurrentScreen('main');
    setLiveLog(`ðŸ”´ NEW_ATTACK_VECTOR_DETECTED: ${newAttack.type}`);
    // Ù„Ø§ Ù†Ø´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù‡Ù†Ø§ - ÙÙ‚Ø· Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰ ØªØ´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
  };

  const startDoubleAttack = () => {
    if (settings.shieldActive) {
      setLiveLog("ERROR: SHIELD_ACTIVE_BLOCKING_TEST");
      return;
    }

    const [attack1, attack2] = createDoubleAttackVectors();
    const startTime = Date.now();
    setSelectedAttackForDetail(null);
    setActiveAttacks([
      { ...attack1, startTime, duration: 40000 + Math.random() * 20000, progress: 0 },
      { ...attack2, startTime, duration: 40000 + Math.random() * 20000, progress: 0 }
    ]);
    setLastAttackForAlert(attack1); // Ø­Ø¯Ø« Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„ÙŠÙ‚Ø±Ø£ Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰
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
    setActiveAttacks(prev => [...prev, { ...attack1, startTime: now, duration: 40000 + Math.random() * 20000, progress: 0 }, { ...attack2, startTime: now, duration: 40000 + Math.random() * 20000, progress: 0 }]);
    setLastAttackForAlert(attack1); // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‡Ø¬Ù…Ø© Ù„Ù„Ø¹Ø±Ø¶ Ù„ÙƒÙ† Ø¨Ø¯ÙˆÙ† ØªØ´ØºÙŠÙ„ Ø¥Ù†Ø°Ø§Ø± Ø¬Ø¯ÙŠØ¯
    setShowOverlay(true);
    setCurrentScreen('main');
    setLiveLog(`ðŸ”´ DUAL_VECTOR_ATTACK_ADDED: ${attack1.type} + ${attack2.type}`);
    // Ù„Ø§ Ù†Ø´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù‡Ù†Ø§ - ÙÙ‚Ø· Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰ ØªØ´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
  };

  const startMultiAttack = () => {
    if (settings.shieldActive) { setLiveLog("ERROR: SHIELD_ACTIVE_BLOCKING_TEST"); return; }
    const raw = window.prompt('Ø¹Ø¯Ø¯ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„Ù…Ø±Ø§Ø¯ ØªØ´ØºÙŠÙ„Ù‡Ø§ (1-10):', '3');
    const count = Math.min(10, Math.max(1, Number(raw) || 1));
    const startTime = Date.now();
    const newAttacks = [];
    for (let i = 0; i < count; i++) {
      const a = { ...createTestAttack(), startTime, duration: 40000 + Math.random() * 20000, progress: 0 };
      newAttacks.push(a);
    }

    setActiveAttacks(newAttacks);
    setDoubleAttackMode(false);
    setIsAttacked(true);
    setShowOverlay(true);
    setAlertSuppressed(false);
    setAlarmPlayedForSession(false); // Ø£Ø¹Ø¯ ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø¹Ù„Ù… Ù„ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
    setHeuristicProgress(0);
    isFinalizing.current = false;
    setCurrentScreen('main');
    setLastAttackForAlert(newAttacks[0]); // Ø­Ø¯Ø« Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù„ÙŠÙ‚Ø±Ø£ Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰
    setLiveLog(`ðŸ”´ MULTI_ATTACKS_INITIATED x${count}`);
  };

  // Ø¯Ø§Ù„Ø© Ø¬Ø¯ÙŠØ¯Ø©: Ø¥Ø¶Ø§ÙØ© multi attack Ø¬Ø¯ÙŠØ¯ Ø¨Ø¯ÙˆÙ† Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ©
  const addMultiVector = () => {
    if (!isAttacked || settings.shieldActive) return;
    const raw = window.prompt('Ø¹Ø¯Ø¯ Ø§Ù„Ù‡Ø¬Ù…Ø§Øª Ø§Ù„Ø¥Ø¶Ø§ÙÙŠØ© (1-10):', '3');
    const count = Math.min(10, Math.max(1, Number(raw) || 1));
    const addStartTime = Date.now();
    const newAttacks = [];
    for (let i = 0; i < count; i++) {
      const a = { ...createTestAttack(), startTime: addStartTime, duration: 40000 + Math.random() * 20000, progress: 0 };
      newAttacks.push(a);
    }

    setActiveAttacks(prev => [...prev, ...newAttacks]);
    setLastAttackForAlert(newAttacks[0]); // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‡Ø¬Ù…Ø© Ù„Ù„Ø¹Ø±Ø¶ Ù„ÙƒÙ† Ø¨Ø¯ÙˆÙ† ØªØ´ØºÙŠÙ„ Ø¥Ù†Ø°Ø§Ø± Ø¬Ø¯ÙŠØ¯
    setShowOverlay(true);
    setCurrentScreen('main');
    setLiveLog(`ðŸ”´ NEW_ATTACKS_ADDED x${count}`);
    // Ù„Ø§ Ù†Ø´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø± Ù‡Ù†Ø§ - ÙÙ‚Ø· Ø§Ù„Ù‡Ø¬Ù…Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰ ØªØ´ØºÙ„ Ø§Ù„Ø¥Ù†Ø°Ø§Ø±
  };

  const startLoopbackAttack = (type) => {
    if (isAttacked || settings.shieldActive) return;
    const lbAttack = { ...createLoopbackAttack(type), startTime: Date.now(), duration: 40000 + Math.random() * 20000, progress: 0 };
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
    const lbAttack = { ...createLoopbackAttack(type), startTime: Date.now(), duration: 40000 + Math.random() * 20000, progress: 0 };
    setActiveAttacks(prev => [...prev, lbAttack]);
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
      return;
    }
    if (!isAttacked) {
      setCurrentScreen('main');
      return;
    }
    finalizeAttackAndSave();
  };

  // Ø¯Ø§Ù„Ø© Ø¬Ø¯ÙŠØ¯Ø©: Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ù€ overlay ÙÙ‚Ø· Ø¨Ø¯ÙˆÙ† Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ù‡Ø¬Ù…Ø©
  const hideOverlay = () => {
    setShowOverlay(false);
  };

  const handleNodeClick = (node, event) => {
    if (node) {
      if (node.isAttacker || node.threat) {
        const attackData = node.ip ? node : (activeTestAttack || {});
        const locParts = (attackData.loc || "").split(', ');
        const derivedCity = locParts[0] || "Unknown";
        const derivedCountry = locParts[1] || "UN";

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
          latency: Math.floor(Math.random() * 50 + (isAttacked ? 150 : 10)) + "ms",
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

          <Header settings={settings} isAttacked={isAttacked} time={time} liveLog={liveLog} />

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
                  {isAttacked && (item.id === 'live' || item.id === 'network' || item.id === 'history' || item.id === 'analysis') && (
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
            position: 'fixed', top: 0, zIndex: 20000, height: '100%',
            visibility: showOverlay ? 'visible' : 'hidden'
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
              onDetailView={openAttackDetail}
              onCloseOverlay={closeOverlay}
              onHideOverlay={hideOverlay}
              setCurrentScreen={setCurrentScreen}
            />
          </div>

          {activeModule === 'live' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" onClick={() => setActiveModule(null)}>Ã—</button>
              <LiveThreatsModule isAttacked={isAttacked} doubleAttackMode={doubleAttackMode} activeAttacks={activeAttacks} activeTestAttack={activeTestAttack} onSelectAttack={openAttackDetail} />
            </div>
          )}

          {activeModule === 'network' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" onClick={() => setActiveModule(null)}>Ã—</button>
              <NetworkModule activeAttack={activeTestAttack} activeAttacks={activeAttacks} onSelectAttack={openAttackDetail} serverStats={serverStats} />
            </div>
          )}

          {activeModule === 'history' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all', background: '#020b02' }}>
              <button className="close-btn-lg" onClick={() => setActiveModule(null)}>Ã—</button>
              <HistoryModule historyList={historyList} onClearHistory={() => setHistoryList([])} />
            </div>
          )}

          {activeModule === 'analysis' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" onClick={() => setActiveModule(null)}>Ã—</button>
              <AnalysisScreen onClose={() => setActiveModule(null)} isAttacked={isAttacked} activeAttack={activeTestAttack || (historyList.length > 0 ? historyList[0] : null)} settings={settings} />
            </div>
          )}

          {activeModule === 'config' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" onClick={() => setActiveModule(null)}>Ã—</button>
              <ConfigModal settings={settings} setSettings={setSettings} activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
          )}

          {!activeModule && !showOverlay && (
            <div className="bottom-controls" style={{
              display: 'flex',
              zIndex: 100005, pointerEvents: 'all', position: 'fixed', bottom: '40px', right: '40px', gap: '15px', flexDirection: 'column', alignItems: 'flex-end'
            }}>

              {showLoopbackMenu && (
                <div className="loopback-selector-popup">
                  <div className="popup-tag">// SELECT_INTERNAL_VECTOR</div>
                  <button onClick={() => { isAttacked ? addLoopbackVector('BRUTE') : startLoopbackAttack('BRUTE'); setShowLoopbackMenu(false); }}>01_BRUTE_FORCE</button>
                  <button onClick={() => { isAttacked ? addLoopbackVector('DDOS') : startLoopbackAttack('DDOS'); setShowLoopbackMenu(false); }}>02_DDoS_FLOOD</button>
                  <button className="cancel-btn" onClick={() => setShowLoopbackMenu(false)}>CLOSE</button>
                </div>
              )}

              <button onClick={isAttacked ? addNewVector : toggleAttack} className="control-btn-pro">
                {isAttacked ? "ADD_NEW_VECTOR" : "EXTERNAL_TEST"}
              </button>

              <button
                onClick={() => setShowLoopbackMenu(!showLoopbackMenu)}
                disabled={false}
                className={`control-btn-pro loopback-btn ${showLoopbackMenu ? 'active' : ''}`}
              >
                LOOPBACK_MODE
              </button>

              <button onClick={isAttacked ? addDoubleVector : startDoubleAttack} className="control-btn-pro dual-btn" style={{ opacity: 1 }}>
                {isAttacked ? "ADD_DUAL_VECTOR" : "DUAL_ATTACK"}
              </button>

              <button onClick={isAttacked ? addMultiVector : startMultiAttack} className="control-btn-pro multi-btn" style={{ opacity: 1 }}>
                {isAttacked ? "ADD_MULTI_VECTOR" : "MULTI_ATTACK"}
              </button>
            </div>
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
            
            .loopback-selector-popup { background: rgba(0,0,0,0.95); border: 1px solid #ff00ff; padding: 10px; width: 220px; display: flex; flex-direction: column; gap: 5px; box-shadow: 0 0 30px rgba(255,0,255,0.2); margin-bottom: 5px; }
            .popup-tag { font-size: 9px; color: #ff00ff; opacity: 0.6; padding: 5px; border-bottom: 1px solid #ff00ff33; }
            .loopback-selector-popup button { background: transparent; border: 1px solid transparent; color: #ff00ff; padding: 10px; text-align: left; font-family: monospace; cursor: pointer; transition: 0.2s; }
            .loopback-selector-popup button:hover { background: rgba(255,0,255,0.1); border-color: #ff00ff; }
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
