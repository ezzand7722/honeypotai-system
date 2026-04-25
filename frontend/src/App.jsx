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

  const [showLoopbackMenu, setShowLoopbackMenu] = useState(false);

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

      // التعديل المطلوب هنا:
      // تأكد أن العنصر الجديد { ...attack } يأتي قبل المصفوفة القديمة ...prev
      return [{ ...attack, timestamp: new Date().toLocaleTimeString() }, ...prev];
    });
  }, []);

  useEffect(() => {
    if (sirenAudio.current) sirenAudio.current.volume = settings.alertVolume;
  }, [settings.alertVolume]);

  const playFemaleAlert = useCallback(() => {
    window.speechSynthesis.cancel();
    const speakSequence = () => {
      if (!attackRef.current || alertSuppressed || !showOverlay) return;

      const alertMsg = new SpeechSynthesisUtterance("Attention! Attack Detected.");
      alertMsg.pitch = 1.4;
      alertMsg.rate = 1.1;
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Google US English') || v.name.includes('Microsoft Zira'));
      if (femaleVoice) alertMsg.voice = femaleVoice;

      alertMsg.onend = () => {
        if (!attackRef.current || alertSuppressed || !showOverlay) return;

        const ipAddress = activeTestAttack?.ip || (activeAttacks.length > 0 ? activeAttacks[0].ip : "Unknown");
        const ipSpelled = ipAddress.split('').join(' ');

        const detailMsg = new SpeechSynthesisUtterance(`Source I P address. ${ipSpelled}. Initiating AI countermeasures.`);
        detailMsg.pitch = 1.1;
        if (femaleVoice) detailMsg.voice = femaleVoice;
        detailMsg.onend = () => {
          if (attackRef.current && !alertSuppressed && showOverlay) {
            setTimeout(speakSequence, 3000);
          }
        };
        window.speechSynthesis.speak(detailMsg);
      };
      window.speechSynthesis.speak(alertMsg);
    };
    speakSequence();
  }, [activeTestAttack?.ip, activeAttacks, alertSuppressed, showOverlay]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- CONNECT TO REAL BACKEND API ---
  const fetchBackendAlertsRef = useRef(null);

  useEffect(() => {
    fetchBackendAlertsRef.current = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        // Add cache-busting timestamp so the browser never caches this request
        const res = await fetch(`${backendUrl}/report/alerts?limit=15&_t=${Date.now()}`, {
          headers: {
            'X-Shared-Secret': 'default-shared-secret',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            // We need to safely update state by checking existing history
            setHistoryList(prev => {
              let addedNew = false;
              let detectedNewAttack = null;
              // Limit the history array size so it doesn't grow infinitely
              let newHistory = [...prev].slice(0, 50);

              data.forEach(alert => {
                const eventData = alert.event || alert;
                const predictionData = alert.prediction || {};
                const eventId = eventData.event_id || eventData.id || `EV-${Math.floor(Math.random() * 9000) + 1000}`;

                if (!newHistory.find(a => a.id === eventId)) {
                  let eventDateMs = new Date();
                  if (eventData.timestamp) {
                    const parsed = new Date(eventData.timestamp);
                    if (!isNaN(parsed.getTime())) eventDateMs = parsed;
                  }

                  const at_type = predictionData.details?.attack_type || eventData.attack_vector || 'UNKNOWN';
                  const risk = predictionData.risk_score !== undefined ? predictionData.risk_score : (alert.risk_score || 0.5);

                  const formatted = {
                    id: eventId,
                    date: eventDateMs.toISOString().replace('T', ' ').split('.')[0],
                    type: at_type,
                    ip: eventData.source_ip || 'UNKNOWN',
                    port: eventData.port || 'N/A',
                    proto: eventData.raw_log?.protocol || 'TCP/UDP',
                    loc: 'Unknown',
                    threat: Math.floor(risk * 100) + '%',
                    coords: {
                      lat: (Math.random() * 120 - 60),
                      lng: (Math.random() * 360 - 180)
                    },
                    status: 'DETECTED',
                    history: predictionData.summary || 'Attack detected',
                    livePayload: (Math.random() * 500 + 100).toFixed(1) + " MB/s"
                  };

                  newHistory = [formatted, ...newHistory];
                  addedNew = true;
                  if (!detectedNewAttack) detectedNewAttack = formatted;
                }
              });

              // Apply trigger if new items arrived
              if (addedNew && detectedNewAttack && !window.isSystemUnderAttack && !settings.shieldActive) {
                // Dispatch timeout so we don't cause React render conflict while setting another state inside setState
                setTimeout(() => {
                  setActiveTestAttack(detectedNewAttack);
                  setSelectedAttackForDetail(detectedNewAttack);
                  setActiveAttacks([]);
                  setDoubleAttackMode(false);
                  setShowMultiAttackDetail(false);
                  setAlertSuppressed(false);
                  setIsAttacked(true);
                  setShowOverlay(true);
                  setHeuristicProgress(0);
                  isFinalizing.current = false;
                  setCurrentScreen('main');
                  setLiveLog(`🔴 REAL_ATTACK_DETECTED: ${detectedNewAttack.type}`);
                }, 0);
              }

              return newHistory;
            });
          }
        }
      } catch (e) {
        // Backend not reachable, ignore
      }
    };
  }, [settings.shieldActive]);

  useEffect(() => {
    const fetchWrapper = () => {
      if (fetchBackendAlertsRef.current) fetchBackendAlertsRef.current();
    }
    fetchWrapper();
    // Decrease interval from 4000 to 1000 for instant feeling
    const interval = setInterval(fetchWrapper, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let liveInterval;
    if (isAttacked) {
      liveInterval = setInterval(() => {
        const logs = [
          "DECODING_PACKETS...",
          "BLOCKING_IP_RANGE...",
          "ANALYZING_PAYLOAD...",
          "[AI]_HEURISTIC_SCANNING...",
          "ENCRYPTING_NODE_DATA...",
          "REDIRECTING_TRAFFIC...",
          "[RIPv2]_TABLE_PROTECTION_ACTIVE...",
          "DEPLOYING_HONEYPOT_DECOYS..."
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
            cpu: (Math.random() * 20 + 75).toFixed(1) + "%",
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
    window.isSystemUnderAttack = isAttacked;

    if (isAttacked && showOverlay && !alertSuppressed) {
      playFemaleAlert();
      if (sirenAudio.current) {
        sirenAudio.current.loop = true;
        sirenAudio.current.play().catch(e => console.log("Audio Playback Blocked"));
      }
    } else {
      window.speechSynthesis.cancel();
      if (sirenAudio.current) {
        sirenAudio.current.pause();
        sirenAudio.current.currentTime = 0;
      }
    }
    return () => {
      window.speechSynthesis.cancel();
      if (sirenAudio.current) {
        sirenAudio.current.pause();
        sirenAudio.current.currentTime = 0;
      }
    };
  }, [isAttacked, showOverlay, alertSuppressed, playFemaleAlert]);

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
        if (doubleAttackMode) {
          setCurrentScreen('double_attack');
        } else {
          setCurrentScreen('attack_details');
        }
      }, 3500);
    }
    return () => clearTimeout(timer);
  }, [isAttacked, currentScreen, showOverlay, doubleAttackMode]);

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
    if (doubleAttackMode && activeAttacks.length > 0) {
      activeAttacks.forEach(attack => savedAttacks.push({ ...attack, status: 'MITIGATED' }));
      if (activeTestAttack && !activeAttacks.some(a => a.id === activeTestAttack.id)) {
        savedAttacks.push({ ...activeTestAttack, status: 'MITIGATED' });
      }
    } else if (activeTestAttack) {
      savedAttacks.push({ ...activeTestAttack, status: 'MITIGATED' });
    }

    if (savedAttacks.length > 0) savedAttacks.forEach(attack => addToHistory(attack));

    setIsAttacked(false);
    setShowOverlay(false);
    setActiveTestAttack(null);
    setActiveAttacks([]);
    setDoubleAttackMode(false);
    setAlertSuppressed(false);
    setSelectedAttackForDetail(null);
    setShowMultiAttackDetail(false);
    setHeuristicProgress(0);
    setCurrentScreen('main');
    setActiveModule(null);

    setTimeout(() => { isFinalizing.current = false; }, 500);
  }, [activeAttacks, activeTestAttack, addToHistory, doubleAttackMode]);

  useEffect(() => {
    if (!isAttacked) return;
    const progressInterval = setInterval(() => {
      setHeuristicProgress(prev => {
        let increment = 1.2;
        if (settings.scanSpeed === 'FAST') increment = 2.8;
        if (settings.scanSpeed === 'SLOW') increment = 0.5;
        if (settings.autoMitigation) increment *= 1.5;

        const nextValue = prev + increment;
        if (nextValue >= 100) {
          clearInterval(progressInterval);
          setTimeout(() => { finalizeAttackAndSave(); }, 1000);
          return 100;
        }
        return nextValue;
      });
    }, 500);
    return () => clearInterval(progressInterval);
  }, [isAttacked, finalizeAttackAndSave, settings.scanSpeed, settings.autoMitigation]);

  const toggleAttack = () => {
    const newState = !isAttacked;
    if (newState && settings.shieldActive) {
      setLiveLog("ERROR: SHIELD_ACTIVE_BLOCKING_TEST");
      return;
    }
    if (newState && isAttacked) {
      setShowOverlay(true);
      return;
    }

    setIsAttacked(newState);
    setShowOverlay(newState);
    if (newState) {
      const newAttack = createTestAttack();
      setActiveTestAttack(newAttack);
      setSelectedAttackForDetail(newAttack);
      setActiveAttacks([]);
      setDoubleAttackMode(false);
      setShowMultiAttackDetail(false);
      setAlertSuppressed(false);
      setHeuristicProgress(0);
      isFinalizing.current = false;
      setCurrentScreen('main');
      setLiveLog("🔴 ATTACK_VECTORS_DETECTED");
      if (sirenAudio.current) { sirenAudio.current.loop = true; sirenAudio.current.play(); }
    } else {
      finalizeAttackAndSave();
    }
  };

  const startDoubleAttack = () => {
    if (isAttacked) return;
    if (settings.shieldActive) {
      setLiveLog("ERROR: SHIELD_ACTIVE_BLOCKING_TEST");
      return;
    }
    const [attack1, attack2] = createDoubleAttackVectors();
    setSelectedAttackForDetail(null);
    setActiveAttacks([attack1, attack2]);
    setDoubleAttackMode(true);
    setIsAttacked(true);
    setShowOverlay(true);
    setAlertSuppressed(false);
    setHeuristicProgress(0);
    isFinalizing.current = false;
    setCurrentScreen('main');
    setLiveLog("🔴 DUAL_VECTOR_ATTACK_INITIATED!");
    if (sirenAudio.current) { sirenAudio.current.loop = true; sirenAudio.current.play(); }
  };

  const startLoopbackAttack = (type) => {
    if (isAttacked || settings.shieldActive) return;
    const lbAttack = createLoopbackAttack(type);
    setActiveTestAttack(lbAttack);
    setSelectedAttackForDetail(lbAttack);
    setActiveAttacks([]);
    setDoubleAttackMode(false);
    setShowMultiAttackDetail(false);
    setAlertSuppressed(false);
    setIsAttacked(true);
    setShowOverlay(true);
    setShowLoopbackMenu(false);
    setHeuristicProgress(0);
    isFinalizing.current = false;
    setCurrentScreen('main');
    setLiveLog(`⚠️ EXECUTING: ${lbAttack.type}`);
    if (sirenAudio.current) { sirenAudio.current.loop = true; sirenAudio.current.play(); }
  };

  const openAttackDetail = (attack) => {
    setSelectedAttackForDetail(attack);
    setActiveTestAttack(attack);
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
          cpu: (Math.random() * (isAttacked ? 40 : 15) + (isAttacked ? 55 : 5)).toFixed(1) + "%",
          ram: (Math.random() * 4 + 2).toFixed(1) + " GB / 8GB",
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
            <LiveMap isAttacked={isAttacked && currentScreen === 'main'} attackerCoords={activeTestAttack?.coords} onNodeClick={handleNodeClick} shieldActive={settings.shieldActive} />

            {selectedNode && (
              <div className="node-info-overlay" style={{ top: mousePos.y, left: mousePos.x, pointerEvents: 'all' }}>
                <button className="close-mini" onClick={() => setSelectedNode(null)}>×</button>
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
                      <div className="info-row"><span>LATENCY:</span> <span className={isAttacked ? "val-red" : "val-yellow"}>{selectedNode.latency}</span></div>
                      <div className="info-row"><span>STATUS:</span> <span className={isAttacked ? "val-red pulse" : "val-green"}>{selectedNode.security_score}</span></div>
                      <div className="info-row"><span>CPU_LOAD:</span>
                        <div className="mini-bar">
                          <div className={`fill fill-glow ${isAttacked ? 'animate-bar-red' : ''}`}
                            style={{ width: selectedNode.cpu, background: isAttacked ? '#ff0000' : '#00ff41' }}></div>
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
              isAttacked={showOverlay}
              currentScreen={currentScreen}
              activeTestAttack={activeTestAttack}
              activeAttacks={activeAttacks}
              doubleAttackMode={doubleAttackMode}
              detailAttack={selectedAttackForDetail}
              alertSuppressed={alertSuppressed}
              heuristicProgress={heuristicProgress}
              toggleAttack={toggleAttack}
              onDetailView={openAttackDetail}
              onCloseOverlay={closeOverlay}
              setCurrentScreen={setCurrentScreen}
            />
          </div>

          {activeModule === 'live' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" onClick={() => setActiveModule(null)}>×</button>
              <LiveThreatsModule isAttacked={isAttacked} doubleAttackMode={doubleAttackMode} activeAttacks={activeAttacks} activeTestAttack={activeTestAttack} onSelectAttack={openAttackDetail} />
            </div>
          )}

          {activeModule === 'network' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" onClick={() => setActiveModule(null)}>×</button>
              <NetworkModule activeAttack={activeTestAttack} activeAttacks={activeAttacks} onSelectAttack={openAttackDetail} />
            </div>
          )}

          {activeModule === 'history' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all', background: '#020b02' }}>
              <button className="close-btn-lg" onClick={() => setActiveModule(null)}>×</button>
              <HistoryModule historyList={historyList} />
            </div>
          )}

          {activeModule === 'analysis' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" onClick={() => setActiveModule(null)}>×</button>
              <AnalysisScreen onClose={() => setActiveModule(null)} isAttacked={isAttacked} activeAttack={activeTestAttack || (historyList.length > 0 ? historyList[0] : null)} settings={settings} />
            </div>
          )}

          {activeModule === 'config' && (
            <div className="sub-screen-overlay" style={{ zIndex: 10015, pointerEvents: 'all' }}>
              <button className="close-btn-lg" onClick={() => setActiveModule(null)}>×</button>
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
                  <button onClick={() => startLoopbackAttack('BRUTE')}>01_BRUTE_FORCE</button>
                  <button onClick={() => startLoopbackAttack('DDOS')}>02_DDoS_FLOOD</button>
                  <button className="cancel-btn" onClick={() => setShowLoopbackMenu(false)}>CLOSE</button>
                </div>
              )}

              <button onClick={toggleAttack} className="control-btn-pro">
                {isAttacked ? "RESUME_ANALYSIS" : "EXTERNAL_TEST"}
              </button>

              <button
                onClick={() => setShowLoopbackMenu(!showLoopbackMenu)}
                disabled={isAttacked}
                className={`control-btn-pro loopback-btn ${showLoopbackMenu ? 'active' : ''}`}
              >
                LOOPBACK_MODE
              </button>

              <button onClick={startDoubleAttack} disabled={isAttacked} className="control-btn-pro dual-btn" style={{ opacity: isAttacked ? 0.5 : 1 }}>
                {doubleAttackMode ? "DUAL_MODE_ACTIVE ◆◆" : "DUAL_ATTACK"}
              </button>
            </div>
          )}

          {showMultiAttackDetail && selectedAttackForDetail && (
            <div className="advanced-detail-overlay">
              <div className="detail-header-pro">
                <h1>{">>"} ATTACK_VECTOR_ANALYSIS_DETAILED</h1>
                <button onClick={() => setShowMultiAttackDetail(false)}>×</button>
              </div>
              <div className="detail-grid-pro">
                <div className="threat-section">
                  <h2>🔴 THREAT_DETAILS</h2>
                  <p><strong>SOURCE_IP:</strong> <span>{selectedAttackForDetail.ip}</span></p>
                  <p><strong>TYPE:</strong> <span>{selectedAttackForDetail.type}</span></p>
                  <p><strong>THREAT:</strong> <span style={{ color: '#ff0000' }}>{selectedAttackForDetail.threat}</span></p>
                </div>
                <div className="analysis-section">
                  <h2>🟢 ANALYSIS_&_METRICS</h2>
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