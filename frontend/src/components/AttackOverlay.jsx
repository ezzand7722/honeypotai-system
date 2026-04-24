import React, { useState, useEffect, useRef } from 'react';
import LiveMap from './LiveMap';

// مكون فرعي لعرض النص حرفاً بحرف (تأثير النوع السينمائي)
const Typewriter = ({ text, delay = 40, startDelay = 0 }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), startDelay);
    return () => clearTimeout(startTimer);
  }, [startDelay]);

  useEffect(() => {
    if (!started || !text) return;
    let i = 0;
    const timer = setInterval(() => {
      setDisplayedText(text.substring(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(timer);
    }, delay);
    return () => clearInterval(timer);
  }, [started, text, delay]);

  return <span>{displayedText}</span>;
};

const AttackOverlay = ({ 
  isAttacked, 
  currentScreen, 
  activeTestAttack, 
  activeAttacks = [],
  doubleAttackMode,
  detailAttack,
  onDetailView,
  onCloseOverlay,
  toggleAttack, 
  setCurrentScreen,
  alertSuppressed,
  heuristicProgress
}) => {
  
  const attackToShow = detailAttack || activeTestAttack;
  const handleMainAlertClick = (alertSuppressed || doubleAttackMode) ? undefined : toggleAttack;
  const mainAlertIp = activeTestAttack?.ip || (doubleAttackMode && activeAttacks.length > 0 ? activeAttacks[0].ip : "UNKNOWN");

  // --- حالات البيانات المباشرة (Metrics) ---
  const [liveMetrics, setLiveMetrics] = useState({
    packets: 0,
    threatLevel: 92,
    bandwidth: "0 KB/s",
  });

  const [showBars, setShowBars] = useState(false);
  const scrollRef = useRef(null);

  // --- الحل الجذري: استخدام Ref كقفل (Lock) لضمان الإنهاء التام ---
  const hasTerminated = useRef(false);

  // وظيفة الإغلاق الصارم: توقف الهجمة، الصوت، وتمنع العودة
  const handleHardClose = (e) => {
    if (e) e.stopPropagation();
    console.log("System: Manual override - Terminating all attack vectors and audio.");
    hasTerminated.current = true; // تفعيل قفل الإنهاء
    
    // استدعاء وظيفة الإغلاق في App.jsx (التي يجب أن تغلق audio وتضبط isAttacked لـ false)
    onCloseOverlay(); 
  };

  useEffect(() => {
    // التحقق من وصول العداد لـ 100 وضمان تنفيذ الإغلاق التلقائي مرة واحدة فقط
    if (isAttacked && heuristicProgress >= 100 && !hasTerminated.current) {
      hasTerminated.current = true; 
      
      console.log("System: Heuristic 100% reached. Initializing secure termination...");
      
      const terminateSession = setTimeout(() => {
        onCloseOverlay();
      }, 1500); 

      return () => clearTimeout(terminateSession);
    }

    // إعادة تصفير القفل فقط إذا انتهت حالة الهجوم فعلياً من المصدر (App.jsx)
    if (!isAttacked) {
      hasTerminated.current = false;
    }
  }, [heuristicProgress, isAttacked, onCloseOverlay]);

  // التحكم في السكرول التلقائي للتيم لاين
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [heuristicProgress]);

  // محاكي البيانات (Metrics)
  useEffect(() => {
    let interval;
    if (isAttacked && !hasTerminated.current) {
      const timer = setTimeout(() => setShowBars(true), 100);
      interval = setInterval(() => {
        setLiveMetrics(prev => ({
          packets: prev.packets + Math.floor(Math.random() * 150),
          threatLevel: Math.min(99.9, 90 + Math.random() * 9.9),
          bandwidth: (Math.random() * 800 + 200).toFixed(1) + " MB/s",
        }));
      }, 500);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    } else {
      setShowBars(false);
    }
  }, [isAttacked, currentScreen]);

  if (!isAttacked) return null;

  return (
    <>
      <style>
        {`
          @keyframes pulse-red-bg {
            0% { background-color: rgba(255, 0, 0, 0.1); }
            50% { background-color: rgba(255, 0, 0, 0.25); }
            100% { background-color: rgba(255, 0, 0, 0.1); }
          }
          @keyframes pulse-green-glow {
            0% { box-shadow: 0 0 5px #00ff41; }
            50% { box-shadow: 0 0 15px #00ff41; }
            100% { box-shadow: 0 0 5px #00ff41; }
          }
          .green-scroll::-webkit-scrollbar { width: 6px; display: block !important; }
          .green-scroll::-webkit-scrollbar-track { background: rgba(0, 40, 0, 0.3); }
          .green-scroll::-webkit-scrollbar-thumb { background: #00ff41; border-radius: 10px; }
          .green-scroll { overflow-y: auto !important; height: 100%; }
          .glitch-red { text-shadow: 0 0 10px #ff0000; }
          
          .full-screen-alert {
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.85);
            z-index: 9999;
          }

          .alert-content {
            text-align: center;
            color: #ff0000;
            font-family: 'Courier New', Courier, monospace;
          }

          .sub-screen-overlay {
            position: fixed;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 90vw; height: 85vh;
            background: rgba(0, 5, 0, 0.98);
            border: 1px solid #ff0000;
            z-index: 10001;
            padding: 25px;
            overflow: hidden;
          }

          .close-btn-lg {
            position: absolute; top: 20px; right: 20px;
            background: none; border: 1px solid #ff0000;
            color: #ff0000; font-size: 30px; cursor: pointer;
            width: 45px; height: 45px; z-index: 10005;
            display: flex; align-items: center; justify-content: center;
          }
          
          .red-txt { color: #ff0000; }
          .yellow-txt { color: #ffaa00; }
          .action-btn {
            border: 1px solid #ff0000; color: #ff0000;
            background: none; padding: 10px 20px; cursor: pointer;
            font-weight: bold; font-family: monospace;
          }
          .action-btn:hover { background: rgba(255, 0, 0, 0.1); }
        `}
      </style>

      {/* --- الشاشة 1: التنبيه الكلي (Full Red Alert) --- */}
      {currentScreen === 'main' && !alertSuppressed && (
        <>
          <div style={{ 
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(255, 0, 0, 0.15)', zIndex: 9000,
            pointerEvents: 'none', animation: 'pulse-red-bg 1s infinite'
          }}></div>
          <div className="full-screen-alert" onClick={handleMainAlertClick} style={{ cursor: doubleAttackMode ? 'default' : 'pointer' }}>
            {/* زر الإغلاق X هنا ينهي كل شيء */}
            <button onClick={handleHardClose} style={{ position: 'absolute', top: '18px', right: '18px', width: '38px', height: '38px', background: 'rgba(0,0,0,0.7)', border: '1px solid #ff4444', color: '#ff4444', fontSize: '24px', cursor: 'pointer', zIndex: 10000 }}>×</button>
            <div className="alert-content">
              <div className="alert-header" style={{ letterSpacing: '5px' }}>
                {" >>> CRITICAL_SYSTEM_BREACH <<< "}
              </div>
              <div className="alert-main-box" style={{ fontSize: '4rem', fontWeight: '900', margin: '20px 0' }}>
                ATTACK_DETECTED
              </div>
              <div className="alert-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', padding: '0 20px' }}>
                <span>SOURCE_IP: {mainAlertIp}</span>
                {doubleAttackMode && (
                  <span style={{ color: '#00ff41', opacity: 0.85, fontSize: '12px' }}>DUAL VECTOR ATTACK STILL ACTIVE</span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* --- الشاشة 2A: لوحة Double Attack المنقسمة --- */}
      {currentScreen === 'double_attack' && doubleAttackMode && activeAttacks.length === 2 && (
        <div className="sub-screen-overlay" style={{ overflowY: 'auto', paddingBottom: '40px' }}>
          <button className="close-btn-lg" onClick={handleHardClose}>×</button>
          <div className="screen-header">
            <h2 className="glitch-red" style={{ color: '#ff0000', textAlign: 'center', marginBottom: '30px' }}>
              {" >>> DUAL VECTOR ANALYSIS <<< "}
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', padding: '20px' }}>
            {activeAttacks.map((attack, idx) => (
              <div key={attack.id} style={{ background: 'rgba(0,0,0,0.95)', border: '1px solid rgba(255,0,0,0.35)', padding: '20px', minHeight: '650px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                  <span style={{ color: '#ff4444', fontWeight: 'bold', letterSpacing: '2px' }}>VECTOR_{idx + 1}</span>
                  <span style={{ color: '#00ff41', fontSize: '12px', opacity: 0.8 }}>{attack.threat} THREAT</span>
                </div>

                <div style={{ border: '1px solid #ff4444', height: '320px', overflow: 'hidden', marginBottom: '20px' }}>
                  <LiveMap 
                    key={attack.id} 
                    isAttacked={true} 
                    attackerCoords={attack.coords} 
                    customWidth={460} 
                    customHeight={320} 
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ background: '#070707', padding: '12px', border: '1px solid rgba(255,0,0,0.12)' }}>
                    <div style={{ opacity: 0.7, fontSize: '11px', color: '#aaa' }}>SOURCE_IP</div>
                    <div style={{ color: '#fff', fontWeight: 'bold' }}>{attack.ip}</div>
                  </div>
                  <div style={{ background: '#070707', padding: '12px', border: '1px solid rgba(255,0,0,0.12)' }}>
                    <div style={{ opacity: 0.7, fontSize: '11px', color: '#aaa' }}>LOCATION</div>
                    <div style={{ color: '#fff', fontWeight: 'bold' }}>{attack.loc}</div>
                  </div>
                  <div style={{ background: '#070707', padding: '12px', border: '1px solid rgba(255,0,0,0.12)' }}>
                    <div style={{ opacity: 0.7, fontSize: '11px', color: '#aaa' }}>PROTOCOL</div>
                    <div style={{ color: '#fff' }}>{attack.proto}</div>
                  </div>
                  <div style={{ background: '#070707', padding: '12px', border: '1px solid rgba(255,0,0,0.12)' }}>
                    <div style={{ opacity: 0.7, fontSize: '11px', color: '#aaa' }}>PAYLOAD</div>
                    <div style={{ color: '#ff5555', fontWeight: 'bold' }}>{attack.livePayload}</div>
                  </div>
                </div>

                <div style={{ background: 'rgba(255,0,0,0.05)', padding: '15px', border: '1px solid rgba(255,0,0,0.15)', marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', color: '#00ff41', opacity: 0.8, marginBottom: '10px' }}>ATTACK PROFILE</div>
                  <div style={{ lineHeight: '1.8', fontSize: '13px', color: '#fff' }}>
                    <div><strong>VECTOR:</strong> <span style={{ color: '#ff4444' }}>{attack.type}</span></div>
                    <div><strong>THREAT:</strong> <span style={{ color: '#ff4444' }}>{attack.threat}</span></div>
                    <div><strong>STATUS:</strong> <span style={{ color: '#00ff41' }}>{attack.status}</span></div>
                    <div><strong>ISP:</strong> <span>{attack.isp || 'Unknown'}</span></div>
                    <div><strong>REPUTATION:</strong> <span style={{ color: '#ff4444' }}>{attack.reputation || 'MALICIOUS'}</span></div>
                  </div>
                </div>

                <button 
                  onClick={() => onDetailView?.(attack)}
                  style={{
                    width: '100%', padding: '14px', background: '#00ff41', border: '1px solid #00ff41',
                    color: '#000', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '1px'
                  }}
                >
                  OPEN VECTOR_{idx + 1} DETAILS
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', padding: '0 20px 20px' }}>
            <button onClick={() => setCurrentScreen('attack_summary')} style={{ padding: '14px 25px', background: 'rgba(0,255,65,0.1)', border: '1px solid #00ff41', color: '#00ff41', fontWeight: 'bold', cursor: 'pointer' }}>
              GENERATE INCIDENT SUMMARY
            </button>
          </div>
        </div>
      )}

      {/* --- الشاشة 2: تحليل الاختراق المباشر --- */}
      {currentScreen === 'attack_details' && attackToShow && (
        <div className="sub-screen-overlay">
          <button className="close-btn-lg" onClick={handleHardClose}>×</button>
          
          <div className="screen-header">
            <h2 className="glitch-red" style={{ color: '#ff0000', textAlign: 'center' }}>
              {" >>> LIVE BREACH ANALYSIS <<< "}
            </h2>
          </div>

          {doubleAttackMode && activeAttacks.length === 2 && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '20px 0 20px 0' }}>
              {activeAttacks.map((attack, idx) => (
                <button
                  key={attack.id}
                  onClick={() => onDetailView?.(attack)}
                  style={{
                    padding: '12px 18px',
                    color: attack.id === attackToShow.id ? '#000' : '#fff',
                    background: attack.id === attackToShow.id ? '#00ff41' : 'rgba(255,255,255,0.08)',
                    border: attack.id === attackToShow.id ? '1px solid #00ff41' : '1px solid rgba(255,255,255,0.12)',
                    cursor: 'pointer', fontWeight: 'bold', letterSpacing: '1px'
                  }}
                >
                  VECTOR_{idx + 1} DETAILS
                </button>
              ))}
              <button
                onClick={() => setCurrentScreen('double_attack')}
                style={{
                  padding: '12px 18px', color: '#00ff41', background: 'rgba(0,255,65,0.08)',
                  border: '1px solid #00ff41', cursor: 'pointer', fontWeight: 'bold',
                  letterSpacing: '1px', marginLeft: 'auto'
                }}
              >
                RETURN TO DUAL DASHBOARD
              </button>
            </div>
          )}

          <div className="split-layout" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '30px' }}>
            <div className="map-panel" style={{ border: '1px solid #ff0000', boxShadow: '0 0 15px rgba(255,0,0,0.2)' }}>
              <LiveMap 
                key={attackToShow.id} 
                isAttacked={true} 
                attackerCoords={attackToShow.coords} 
                customWidth={650} 
                customHeight={500} 
              />
            </div>

            <div className="data-panel" style={{ background: 'rgba(20, 0, 0, 0.9)', border: '1px solid #ff0000', padding: '20px' }}>
              <h3 style={{ color: '#ff0000', textTransform: 'uppercase', marginBottom: '20px', borderBottom: '1px solid #ff0000', fontSize: '1.2rem' }}>
                // THREAT_ACTOR_PROFILE
              </h3>
              
              <table className="cyber-table" style={{ width: '100%', color: '#fff' }}>
                <tbody style={{ fontSize: '16px' }}>
                  <tr><td style={{ padding: '10px 0' }}>EVENT_ID</td><td className="yellow-txt"><Typewriter text={attackToShow.id} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>SOURCE_IP</td><td className="red-txt" style={{ fontWeight: 'bold', fontSize: '18px' }}><Typewriter text={attackToShow.ip} startDelay={500} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>ISP_ORIGIN</td><td><Typewriter text={attackToShow.isp || "Global Telecom"} startDelay={1000} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>PROTOCOL</td><td><Typewriter text={`${attackToShow.proto} (PORT: ${attackToShow.port})`} startDelay={1500} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>LOCATION</td><td><Typewriter text={attackToShow.loc?.toUpperCase()} startDelay={2000} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>METHOD</td><td style={{ color: '#ffaa00' }}><Typewriter text={attackToShow.type} startDelay={2500} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>LIVE_LOAD</td><td className="red-txt" style={{fontFamily: 'monospace'}}>{liveMetrics.bandwidth}</td></tr>
                  <tr><td style={{ padding: '10px 0' }}>REPUTATION</td><td className="red-txt" style={{ fontWeight: 'bold' }}><Typewriter text={attackToShow.reputation || "MALICIOUS"} startDelay={3000} /></td></tr>
                </tbody>
              </table>

              <h3 style={{ marginTop: '30px', fontSize: '16px', color: '#fff' }}>TRAFFIC ANOMALY DETECTION</h3>
              <div className="bar-chart" style={{ marginTop: '10px' }}>
                <div className="bar" style={{ marginBottom: '15px' }}>
                  <div className="fill red" style={{ 
                    width: showBars ? `${liveMetrics.threatLevel}%` : '0%', 
                    height: '12px', background: '#ff0000', transition: 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 0 10px rgba(255, 0, 0, 0.5)'
                  }}></div>
                  <span style={{ fontSize: '12px', display: 'block', marginTop: '5px', color: '#ccc' }}>INBOUND MALICIOUS PACKETS ({liveMetrics.threatLevel.toFixed(1)}%)</span>
                </div>
                <div className="bar">
                  <div className="fill green" style={{ 
                    width: showBars ? '8%' : '0%', height: '12px', background: '#00ff41', transition: 'width 2s ease-out',
                    boxShadow: '0 0 10px rgba(0, 255, 65, 0.5)', animation: 'pulse-green-glow 2s infinite'
                  }}></div>
                  <span style={{ fontSize: '12px', display: 'block', marginTop: '5px', color: '#ccc' }}>OUTBOUND RESPONSES (8% - FIREWALL_BLOCKED)</span>
                </div>
              </div>

              <div style={{marginTop: '15px', color: '#ff0000', fontSize: '12px', fontFamily: 'monospace'}}>
                  {`>> PACKETS_INTERCEPTED: ${liveMetrics.packets.toLocaleString()}`}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button className="action-btn" style={{ marginTop: '30px' }} onClick={() => setCurrentScreen('attack_summary')}>
                  {" GENERATE INCIDENT SUMMARY REPORT >> "}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- الشاشة 3: ملخص ما بعد الحادث (الشاشة الخضراء) --- */}
      {currentScreen === 'attack_summary' && (
        <div className="sub-screen-overlay" style={{ 
          display: 'flex', flexDirection: 'column', border: '2px solid #00ff41' 
        }}>
          <button className="close-btn-lg" onClick={handleHardClose} style={{ color: '#00ff41', borderColor: '#00ff41' }}>×</button>
          
          <div className="screen-header" style={{ flexShrink: 0, marginBottom: '20px' }}>
            <h2 className="glitch" style={{ margin: 0, color: '#00ff41', textAlign: 'center' }}>POST-INCIDENT COMPARISON</h2>
          </div>

          <div style={{ display: 'flex', gap: '20px', height: '420px', flexShrink: 0, marginBottom: '20px' }}>
            <div style={{ flex: '1', display: 'flex', flexDirection: 'column', border: '1px solid #00ff41', background: '#000', padding: '10px' }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <LiveMap isAttacked={true} attackerCoords={attackToShow?.coords} customWidth={450} customHeight={330} />
              </div>
              <div style={{ marginTop: '15px', padding: '0 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#00ff41', marginBottom: '5px' }}>
                  <span>TOTAL_HEURISTIC_PROGRESS</span>
                  <span>{Math.floor(heuristicProgress)}%</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(0,255,65,0.1)' }}>
                  <div style={{ 
                    width: `${heuristicProgress}%`, height: '100%', background: '#00ff41', 
                    boxShadow: '0 0 10px #00ff41', transition: 'width 0.5s ease-out' 
                  }}></div>
                </div>
              </div>
            </div>

            <div style={{ flex: '1.2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="half-panel attacker" style={{ padding: '20px', border: '1px dashed #ff0000', background: 'rgba(255,0,0,0.05)' }}>
                <h4 style={{ color: '#ff0000', marginBottom: '15px', borderBottom: '1px solid #ff0000' }}>[!] ATTACKER_TRACE_LOG</h4>
                <div style={{ fontSize: '14px', color: '#ccc', lineHeight: '1.7' }}>
                  <p>IP: <span style={{ color: '#fff' }}>{attackToShow?.ip}</span></p>
                  <p>ASN: AS15169 (CLOUD_EDGE)</p>
                  <p>VECTOR: {attackToShow?.type}</p>
                  <p>PAYLOAD: {attackToShow?.packetSize || "1500 MTU"}</p>
                  <p className="red-txt" style={{ marginTop: '20px', fontWeight: 'bold' }}>RESULT: CONNECTION_TERMINATED</p>
                </div>
              </div>

              <div className="half-panel defender" style={{ padding: '20px', border: '1px dashed #00ff41', background: 'rgba(0,255,0,0.05)' }}>
                <h4 style={{ color: '#00ff41', marginBottom: '15px', borderBottom: '1px solid #00ff41' }}>[✓] AI_DEFENSE_RESPONSE</h4>
                <div style={{ fontSize: '14px', color: '#ccc', lineHeight: '1.7' }}>
                  <p>MITIGATION: <span style={{ color: '#00ff41' }}>42ms (ULTRA_FAST)</span></p>
                  <p>SHIELD: BGP_FLOW_SPEC</p>
                  <p>HONEYPOT: ACTIVE</p>
                  <p>INTEGRITY: <span style={{ color: '#00ff41' }}>100% SECURE</span></p>
                  <p style={{ color: '#00ff41', marginTop: '20px', fontWeight: 'bold' }}>RESULT: SYSTEM_SECURED</p>
                </div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0, 20, 0, 0.9)', border: '1px solid #00ff41', padding: '15px', minHeight: 0 }}>
              <h4 style={{ color: '#00ff41', fontSize: '14px', marginBottom: '10px' }}>DIGITAL_FORENSIC_TIMELINE</h4>
              <div className="green-scroll" ref={scrollRef}>
                  <div style={{ marginBottom: '6px', color: '#00ff41' }}><Typewriter text={`[22:05:22] - INBOUND CONNECTION DETECTED ON PORT ${attackToShow?.port}`} startDelay={1000} /></div>
                  <div style={{ marginBottom: '6px', color: '#00ff41' }}><Typewriter text={`[22:05:23] - AI SCANNER IDENTIFIED MALICIOUS SIGNATURE: ${attackToShow?.type}`} startDelay={2000} /></div>
                  <div style={{ marginBottom: '6px', color: '#00ff41' }}><Typewriter text="[22:05:24] - DEPLOYING VIRTUAL FILE_SYSTEM DECOY" startDelay={3000} /></div>
                  <div style={{ marginBottom: '6px', color: '#00ff41' }}><Typewriter text={`[22:05:25] - ATTACKER IP ${attackToShow?.ip} BLACKLISTED`} startDelay={4000} /></div>
                  <div style={{ marginBottom: '6px', color: '#00ff41' }}><Typewriter text="[22:05:26] - SESSION PURGED | LOGGING INCIDENT" startDelay={5000} /></div>
                  <div style={{ marginBottom: '6px', color: '#00ff41' }}><Typewriter text="[22:05:28] - SYSTEM INTEGRITY VERIFIED." startDelay={6000} /></div>
                  <div style={{ marginBottom: '6px', color: '#00ff41' }}><Typewriter text="[22:05:30] - ARCHIVING FORENSIC DATA." startDelay={7000} /></div>
                  <div style={{ marginBottom: '6px', color: '#00ff41' }}><Typewriter text="[22:05:32] - MONITORING FOR RE-ENTRY ATTEMPTS..." startDelay={8000} /></div>
              </div>
          </div>

          <div style={{ flexShrink: 0, marginTop: '20px' }}>
            <div style={{ width: '100%', padding: '18px', background: 'rgba(0, 255, 65, 0.04)', border: '1px dashed rgba(0,255,65,0.2)', color: '#00ff41', textAlign: 'center', fontSize: '14px' }}>
                {heuristicProgress >= 100 ? "THREAT PURGED | AUTO-TERMINATING TEST SESSION..." : "ATTACK WILL END AUTOMATICALLY WHEN PROGRESS HITS 100%"}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AttackOverlay;