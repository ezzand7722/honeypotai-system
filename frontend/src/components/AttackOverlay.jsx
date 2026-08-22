import React, { useState, useEffect, useRef, useMemo } from 'react';
import LiveMap from './LiveMap';
import CommandTerminal from './CommandTerminal';
import { getActiveAttackCount, getCombinedActiveAttacks } from '../logic/attackState';

// مكون فرعي لعرض النص حرفاً بحرف (تأثير النوع السينمائي)
const Typewriter = ({ text, delay = 40, startDelay = 0 }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), startDelay);
    return () => clearTimeout(startTimer);
  }, [startDelay]);

  useEffect(() => {
    if (!started || text == null) return;
    const strText = String(text);
    let i = 0;
    const timer = setInterval(() => {
      setDisplayedText(strText.substring(0, i + 1));
      i++;
      if (i >= strText.length) clearInterval(timer);
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
  onHideOverlay,
  onEndAttack,
  toggleAttack, 
  setCurrentScreen,
  alertSuppressed,
  heuristicProgress,
  lastAttackForAlert
}) => {
  const [summaryAttacks, setSummaryAttacks] = useState(null);
  const [showCommandTerminal, setShowCommandTerminal] = useState(false);
  
  const combinedAttacks = useMemo(() => getCombinedActiveAttacks({ activeTestAttack, activeAttacks }), [activeTestAttack, activeAttacks]);
  const activeAttackCount = combinedAttacks.length;
  const attackToShow = detailAttack || activeTestAttack;
  const mainAlertIp = lastAttackForAlert?.ip || activeTestAttack?.ip || (combinedAttacks.length > 0 ? combinedAttacks[combinedAttacks.length - 1].ip : "MISSING");
  const activeSummaryAttacks = summaryAttacks || combinedAttacks;

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

  // Function to immediately terminate and end the active attack
  const handleEndAttackClick = (e) => {
    if (e) e.stopPropagation();
    console.log("System: User manually triggered End Attack.");
    hasTerminated.current = true;
    if (onEndAttack) {
      onEndAttack();
    } else if (toggleAttack) {
      toggleAttack();
    } else {
      onCloseOverlay?.();
    }
  };

  // وظيفة الإغلاق الصارم: توقف الهجمة، الصوت، وتمنع العودة
  const handleHardClose = (e) => {
    if (e) e.stopPropagation();
    console.log("System: Hiding overlay - Attack continues in background.");
    hasTerminated.current = true; // تفعيل قفل الإنهاء
    
    // استدعاء وظيفة إخفاء الـ overlay فقط (الهجمة تبقى نشطة)
    if (onHideOverlay) {
      onHideOverlay();
    } else {
      onCloseOverlay(); // fallback للدالة القديمة إن وجدت
    }
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

  // Fake metrics removed
  // الانتقال التلقائي من attack_details إلى attack_summary بعد 10 ثوان
  // useEffect(() => {
  //   if (currentScreen === 'attack_details' && isAttacked) {
  //     const autoTransitionTimer = setTimeout(() => {
  //       setCurrentScreen('attack_summary');
  //     }, 10000); // 10 ثوان
  //     return () => clearTimeout(autoTransitionTimer);
  //   }
  // }, [currentScreen, isAttacked, setCurrentScreen]);

  useEffect(() => {
    if (currentScreen !== 'attack_summary') {
      setSummaryAttacks(null);
    }
  }, [currentScreen]);

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
          <div className="full-screen-alert" style={{ cursor: 'default' }}>
            <button className="close-btn-lg" onClick={handleHardClose} style={{ zIndex: 10005 }}>×</button>
            <div className="alert-content">
              <div className="alert-header" style={{ letterSpacing: '5px' }}>
                {" >>> CRITICAL_SYSTEM_BREACH <<< "}
              </div>
              <div className="alert-main-box" style={{ fontSize: '4rem', fontWeight: '900', margin: '20px 0' }}>
                ATTACK_DETECTED
              </div>
              <div className="alert-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', padding: '0 20px', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span>SOURCE_IP: {mainAlertIp}</span>
                  {doubleAttackMode && (
                    <span style={{ color: '#00ff41', opacity: 0.85, fontSize: '12px' }}>DUAL VECTOR ATTACK STILL ACTIVE</span>
                  )}
                </div>
                <button 
                  onClick={handleEndAttackClick}
                  style={{
                    padding: '16px 36px',
                    background: '#ff0000',
                    color: '#ffffff',
                    border: '2px solid #ffffff',
                    fontWeight: '900',
                    fontSize: '18px',
                    cursor: 'pointer',
                    letterSpacing: '3px',
                    boxShadow: '0 0 35px rgba(255, 0, 0, 0.95)',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    transition: 'all 0.2s ease',
                    pointerEvents: 'all'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ff3333';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#ff0000';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  🛑 END ATTACK NOW (MITIGATE BREACH)
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* --- الشاشة 2A: لوحة Double Attack المنقسمة --- */}
      {currentScreen === 'double_attack' && activeAttackCount >= 2 && (
        <div className="sub-screen-overlay" style={{ overflowY: 'auto', paddingBottom: '40px' }}>
          <button className="close-btn-lg" onClick={handleHardClose}>×</button>
          <div className="screen-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
            <h2 className="glitch-red" style={{ color: '#ff0000', textAlign: 'center', margin: 0, flex: 1 }}>
              {` >>> MULTIPLE_VECTOR_ANALYSIS (${activeAttackCount} ATTACKS) <<< `}
            </h2>
            <button
              onClick={handleEndAttackClick}
              style={{
                padding: '10px 20px',
                background: '#ff0000',
                color: '#ffffff',
                border: '2px solid #ffffff',
                fontWeight: '900',
                cursor: 'pointer',
                fontFamily: 'monospace',
                letterSpacing: '1px',
                boxShadow: '0 0 15px rgba(255,0,0,0.8)',
                borderRadius: '4px'
              }}
            >
              🛑 END ALL ATTACKS NOW
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '25px', padding: '20px' }}>
            {activeTestAttack && (
              <div key={activeTestAttack.id} style={{ background: 'rgba(0,0,0,0.95)', border: '1px solid rgba(255,0,0,0.35)', padding: '20px', minHeight: '600px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                  <span style={{ color: '#ff4444', fontWeight: 'bold', letterSpacing: '2px' }}>VECTOR_01</span>
                  <span style={{ color: '#00ff41', fontSize: '12px', opacity: 0.8 }}>{activeTestAttack.threat} THREAT</span>
                </div>

                <div style={{ border: '1px solid #ff4444', height: '280px', overflow: 'hidden', marginBottom: '20px' }}>
                  <LiveMap 
                    key={activeTestAttack.id} 
                    isAttacked={true} 
                    attackerCoords={activeTestAttack.coords} 
                    attackerData={activeTestAttack}
                    customWidth={activeAttackCount > 3 ? 350 : 460} 
                    customHeight={280} 
                  />
                </div>
                {/* --- إضافة عداد مستقل للهجمة الأولى دون حذف المعلومات القديمة --- */}
<div style={{ 
  marginBottom: '20px', 
  background: 'rgba(0,255,65,0.05)', 
  padding: '12px', 
  border: '1px solid rgba(0,255,65,0.2)',
  borderRadius: '4px' 
}}>
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#00ff41', marginBottom: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>
    <span>[SYSTEM_DEFENSE_STATUS]</span>
    <span>{(activeTestAttack.progress || 0).toFixed(1)}%</span>
  </div>
  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
    <div style={{ 
      width: `${activeTestAttack.progress || 0}%`, 
      height: '100%', 
      background: 'linear-gradient(90deg, #00ff41, #33ff00)', 
      boxShadow: '0 0 15px rgba(0, 255, 65, 0.5)',
      transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
    }}></div>
  </div>
</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ background: '#070707', padding: '12px', border: '1px solid rgba(255,0,0,0.12)' }}>
                    <div style={{ opacity: 0.7, fontSize: '11px', color: '#aaa' }}>SOURCE_IP</div>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '12px' }}>{activeTestAttack.ip}</div>
                  </div>
                  <div style={{ background: '#070707', padding: '12px', border: '1px solid rgba(255,0,0,0.12)' }}>
                    <div style={{ opacity: 0.7, fontSize: '11px', color: '#aaa' }}>LOCATION</div>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '12px' }}>{activeTestAttack.loc}</div>
                  </div>
                  <div style={{ background: '#070707', padding: '12px', border: '1px solid rgba(255,0,0,0.12)' }}>
                    <div style={{ opacity: 0.7, fontSize: '11px', color: '#aaa' }}>PROTOCOL</div>
                    <div style={{ color: '#fff', fontSize: '12px' }}>{activeTestAttack.proto || 'N/A'}</div>
                  </div>
                </div>

                <div style={{ background: 'rgba(255,0,0,0.05)', padding: '15px', border: '1px solid rgba(255,0,0,0.15)', marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', color: '#00ff41', opacity: 0.8, marginBottom: '10px' }}>ATTACK PROFILE</div>
                  <div style={{ lineHeight: '1.6', fontSize: '12px', color: '#fff' }}>
                    <div><strong>VECTOR:</strong> <span style={{ color: '#ff4444' }}>{activeTestAttack.type}</span></div>
                    <div><strong>THREAT:</strong> <span style={{ color: '#ff4444' }}>{activeTestAttack.threat}</span></div>
                    <div><strong>STATUS:</strong> <span style={{ color: '#00ff41' }}>{activeTestAttack.status}</span></div>

                  </div>
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,0,0,0.15)', fontSize: '11px', color: '#ccc' }}>
                    <div><strong>CONNECTION_COUNT:</strong> {activeTestAttack.connectionCount ?? activeTestAttack.connection_count ?? 0}</div>
                    <div><strong>SUCCESS_COUNT:</strong> {activeTestAttack.successCount ?? activeTestAttack.success_count ?? 0}</div>
                    <div><strong>FAILED_COUNT:</strong> {activeTestAttack.failedCount ?? activeTestAttack.failed_count ?? 0}</div>
                    <div><strong>UNIQUE_PASSWORDS:</strong> {activeTestAttack.uniquePasswords ?? activeTestAttack.unique_passwords ?? 0}</div>
                    <div><strong>COMMAND_COUNT:</strong> {activeTestAttack.commandCount ?? activeTestAttack.command_count ?? 0}</div>
                    <div><strong>SUSPICIOUS_CMDS:</strong> {activeTestAttack.suspiciousCmds ?? activeTestAttack.suspicious_commands ?? 0}</div>
                  </div>
                </div>

                <button 
                  onClick={() => onDetailView?.(activeTestAttack)}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    minHeight: '50px',
                    background: '#00ff41',
                    border: '2px solid #00ff41',
                    color: '#000',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    letterSpacing: '1px',
                    fontSize: '14px',
                    transition: 'all 0.3s ease',
                    borderRadius: '2px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#33ff00';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 65, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#00ff41';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  OPEN VECTOR_01 DETAILS
                </button>
              </div>
            )}
          </div>

        </div>
      )}

      {/* --- الشاشة 2: تحليل الاختراق المباشر --- */}
      {currentScreen === 'attack_details' && attackToShow && (
        <div className="sub-screen-overlay">
          <button className="close-btn-lg" onClick={handleHardClose}>×</button>
          
          <div className="screen-header">
            <h2 className="glitch-red" style={{ color: '#ff0000', textAlign: 'center' }}>
              {` >>> LIVE BREACH ANALYSIS (${activeAttackCount} ACTIVE) <<< `}
            </h2>
          </div>



          <div className="split-layout" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '30px', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
            <div className="map-panel" style={{ border: '1px solid #ff0000', boxShadow: '0 0 15px rgba(255,0,0,0.2)' }}>
              <LiveMap 
                key={attackToShow.id} 
                isAttacked={true} 
                attackerCoords={attackToShow.coords} 
                attackerData={attackToShow}
                customWidth={650} 
                customHeight={500} 
              />
            </div>

            <div className="data-panel" style={{ background: 'rgba(20, 0, 0, 0.9)', border: '1px solid #ff0000', padding: '20px', overflowY: 'auto', maxHeight: '100%' }}>
              <h3 style={{ color: '#ff0000', textTransform: 'uppercase', marginBottom: '20px', borderBottom: '1px solid #ff0000', fontSize: '1.2rem' }}>
                // THREAT_ACTOR_PROFILE
              </h3>
              
              <table className="cyber-table" style={{ width: '100%', color: '#fff' }}>
                <tbody style={{ fontSize: '16px' }}>
                  <tr><td style={{ padding: '10px 0' }}>EVENT_ID</td><td className="yellow-txt"><Typewriter text={attackToShow.id || 'MISSING'} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>SOURCE_IP (src_ip)</td><td className="red-txt" style={{ fontWeight: 'bold', fontSize: '18px' }}><Typewriter text={attackToShow.ip || attackToShow.src_ip || 'MISSING'} startDelay={500} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>PROTOCOL</td><td><Typewriter text={`${attackToShow.proto || ''} ${attackToShow.port ? `(PORT: ${attackToShow.port})` : ''}`} startDelay={1500} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>LOCATION</td><td><Typewriter text={attackToShow.loc?.toUpperCase() || 'MISSING'} startDelay={2000} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>ATTACK (attack_type)</td><td style={{ color: '#ffaa00' }}><Typewriter text={attackToShow.type || attackToShow.attack_type || 'MISSING'} startDelay={2500} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>SEVERITY (severity)</td><td className="red-txt" style={{ fontWeight: 'bold' }}><Typewriter text={attackToShow.severity || 'MISSING'} startDelay={3000} /></td></tr>
                  <tr><td style={{ padding: '10px 0' }}>REPUTATION</td><td className="red-txt" style={{ fontWeight: 'bold' }}><Typewriter text={attackToShow.reputation || 'MISSING'} startDelay={3000} /></td></tr>
                </tbody>
              </table>

              <h3 style={{ color: '#ff0000', marginTop: '20px', borderBottom: '1px solid #ff0000', paddingBottom: '10px', fontSize: '1rem' }}>
                // ATTACK_STATISTICS
              </h3>
              
              <table className="cyber-table" style={{ width: '100%', color: '#fff', marginTop: '10px' }}>
                <tbody style={{ fontSize: '14px' }}>
                  <tr><td style={{ padding: '8px 0' }}>CONNECTION_COUNT</td><td className="yellow-txt" style={{ fontWeight: 'bold' }}>{attackToShow.connectionCount ?? attackToShow.connection_count ?? 0}</td></tr>
                  <tr><td style={{ padding: '8px 0' }}>SUCCESS_COUNT</td><td style={{ color: '#00ff41' }}>{attackToShow.successCount ?? attackToShow.success_count ?? 0}</td></tr>
                  <tr><td style={{ padding: '8px 0' }}>FAILED_COUNT</td><td className="red-txt">{attackToShow.failedCount ?? attackToShow.failed_count ?? 0}</td></tr>
                  <tr><td style={{ padding: '8px 0' }}>UNIQUE_PASSWORDS</td><td style={{ color: '#ffaa00' }}>{attackToShow.uniquePasswords ?? attackToShow.unique_passwords ?? 0}</td></tr>
                  <tr><td style={{ padding: '8px 0' }}>COMMAND_COUNT</td><td style={{ color: '#ff6666' }}>{attackToShow.commandCount ?? attackToShow.command_count ?? 0}</td></tr>
                  <tr><td style={{ padding: '8px 0' }}>SUSPICIOUS_CMDS</td><td className="red-txt" style={{ fontWeight: 'bold' }}>{attackToShow.suspiciousCmds ?? attackToShow.suspicious_commands ?? 0}</td></tr>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                <button 
                  onClick={handleEndAttackClick}
                  style={{
                    marginTop: '20px',
                    padding: '14px 20px',
                    background: '#ff0000',
                    color: '#ffffff',
                    border: '2px solid #ffffff',
                    fontWeight: '900',
                    fontSize: '15px',
                    cursor: 'pointer',
                    letterSpacing: '2px',
                    boxShadow: '0 0 20px rgba(255, 0, 0, 0.9)',
                    borderRadius: '4px',
                    fontFamily: 'monospace'
                  }}
                >
                  🛑 END ATTACK NOW (MITIGATE BREACH)
                </button>
                <button className="action-btn" style={{ marginTop: '10px' }} onClick={() => {
                  setSummaryAttacks([attackToShow]);
                  setCurrentScreen('attack_summary');
                }}>
                  {" GENERATE INCIDENT SUMMARY REPORT >> "}
                </button>
                <button 
                  onClick={() => setShowCommandTerminal(true)}
                  style={{
                    marginTop: '10px',
                    padding: '14px 20px',
                    background: 'transparent',
                    color: '#00ff41',
                    border: '2px solid #00ff41',
                    fontWeight: '900',
                    fontSize: '14px',
                    cursor: 'pointer',
                    letterSpacing: '2px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 0 10px rgba(0, 255, 65, 0.2)',
                    width: '100%',
                    textAlign: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#00ff41';
                    e.currentTarget.style.color = '#000';
                    e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 255, 65, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#00ff41';
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 65, 0.2)';
                  }}
                >
                  {"⚡ VIEW ATTACKER COMMANDS >>"}
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
                <LiveMap isAttacked={true} attackerCoords={activeSummaryAttacks[0]?.coords} attackerData={activeSummaryAttacks[0]} customWidth={450} customHeight={330} />
              </div>
              <div style={{ marginTop: '15px', padding: '0 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#00ff41', marginBottom: '5px' }}>
                  <span>TOTAL_ACTIVE_ATTACKS</span>
                  <span>{activeSummaryAttacks.length}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px', color: '#ccc' }}>
                  <div><strong className="yellow-txt">TOTAL_CONNECTIONS</strong><div>{activeSummaryAttacks.reduce((sum, a) => sum + (a.connectionCount ?? a.connection_count ?? 0), 0)}</div></div>
                  <div><strong className="yellow-txt">TOTAL_FAILS</strong><div>{activeSummaryAttacks.reduce((sum, a) => sum + (a.failedCount ?? a.failed_count ?? 0), 0)}</div></div>
                  <div><strong className="yellow-txt">TOTAL_SUCCESS</strong><div>{activeSummaryAttacks.reduce((sum, a) => sum + (a.successCount ?? a.success_count ?? 0), 0)}</div></div>
                  <div><strong className="yellow-txt">AVG THREAT</strong><div>{activeSummaryAttacks.length ? `${Math.round(activeSummaryAttacks.reduce((sum, a) => sum + (a.severityScore || 0), 0) / activeSummaryAttacks.length)}%` : '0%'}</div></div>
                </div>
              </div>
            </div>

            <div style={{ flex: '1.2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="half-panel attacker" style={{ padding: '20px', border: '1px dashed #ff0000', background: 'rgba(255,0,0,0.05)' }}>
                <h4 style={{ color: '#ff0000', marginBottom: '15px', borderBottom: '1px solid #ff0000' }}>[!] MULTI-ATTACK OVERVIEW</h4>
                <div style={{ fontSize: '14px', color: '#ccc', lineHeight: '1.7' }}>
                  <p>ATTACKS ACTIVE: <span style={{ color: '#fff' }}>{activeSummaryAttacks.length}</span></p>

                  <p>TOP THREAT VECTOR: <span style={{ color: '#fff' }}>{activeSummaryAttacks[0]?.type || 'MISSING'}</span></p>
                  <p className="red-txt" style={{ marginTop: '20px', fontWeight: 'bold' }}>RESULT: MULTI-VECTOR ANALYSIS</p>
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

          <div style={{ flex: 1, display: 'flex', gap: '15px', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ flex: 1, background: 'rgba(0, 20, 0, 0.9)', border: '1px solid #00ff41', padding: '15px', overflowY: 'auto' }}>
              <h4 style={{ color: '#00ff41', fontSize: '14px', marginBottom: '10px' }}>ACTIVE ATTACK VECTORS</h4>
              <div style={{ display: 'grid', gap: '12px' }}>
                {activeSummaryAttacks.map((attack, idx) => (
                  <div key={attack.id} style={{ padding: '14px', border: '1px solid rgba(0,255,65,0.2)', background: '#010901' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#00ff41', fontWeight: 'bold' }}>
                      <span>{`VECTOR_${String(idx + 1).padStart(2, '0')} ${String(attack.type || '').substring(0, 16)}`}</span>
                      <span>{attack.threat || ''}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: '#ccc', fontSize: '12px' }}>
                      <div><strong>IP:</strong> <span>{attack.ip || attack.src_ip || 'MISSING'}</span></div>
                      <div><strong>LOC:</strong> <span>{attack.loc || 'MISSING'}</span></div>
                      <div><strong>PROTO:</strong> <span>{attack.proto || ''}</span></div>
                      <div><strong>PORT:</strong> <span>{attack.port || ''}</span></div>
                      <div><strong>STATUS:</strong> <span>{attack.status || ''}</span></div>

                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', background: 'rgba(0, 20, 0, 0.9)', border: '1px solid #00ff41', padding: '15px', overflowY: 'auto' }}>
              <h4 style={{ color: '#00ff41', fontSize: '14px', marginBottom: '10px' }}>FORNSIC TIMELINES</h4>
              <div className="green-scroll" ref={scrollRef} style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
                {activeSummaryAttacks.map((attack, idx) => (
                  <div key={attack.id} style={{ marginBottom: '18px' }}>
                    <div style={{ color: '#00ff41', fontSize: '12px', marginBottom: '6px' }}>{`[VECTOR_${String(idx + 1).padStart(2, '0')}] ${attack.id}`}</div>
                    {attack.eventTimeline?.length > 0 ? attack.eventTimeline.map((evt, i) => {
                      const text = typeof evt === 'string' ? evt : `[${evt.time}] - ${evt.event}`;
                      return (
                        <div key={`${attack.id}-${i}`} style={{ marginBottom: '6px', color: '#00ff41', wordBreak: 'break-all' }}>
                          <Typewriter text={text} startDelay={800 + i * 200} />
                        </div>
                      );
                    }) : (
                      <div style={{ marginBottom: '6px', color: '#00ff41' }}>NO TIMELINE AVAILABLE</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ flexShrink: 0, marginTop: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
            <div style={{ flex: 1, padding: '14px', background: 'rgba(0, 255, 65, 0.04)', border: '1px dashed rgba(0,255,65,0.2)', color: '#00ff41', textAlign: 'center', fontSize: '13px' }}>
                {heuristicProgress >= 100 ? "THREAT PURGED | AUTO-TERMINATING TEST SESSION..." : "ATTACK PROGRESS: " + (heuristicProgress || 0).toFixed(0) + "%"}
            </div>
            <button 
              onClick={handleEndAttackClick}
              style={{
                padding: '14px 28px',
                background: '#ff0000',
                color: '#ffffff',
                border: '2px solid #ffffff',
                fontWeight: '900',
                fontSize: '14px',
                cursor: 'pointer',
                letterSpacing: '2px',
                boxShadow: '0 0 20px rgba(255, 0, 0, 0.9)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap'
              }}
            >
              🛑 END ATTACK NOW
            </button>
          </div>
        </div>
      )}

      {/* Command Terminal Overlay */}
      {showCommandTerminal && attackToShow && (
        <CommandTerminal
          commands={attackToShow.attacker_commands || []}
          attackType={attackToShow.type || attackToShow.attack_type || 'Unknown'}
          attackerIp={attackToShow.ip || attackToShow.src_ip || 'N/A'}
          onClose={() => setShowCommandTerminal(false)}
        />
      )}
    </>
  );
};

export default AttackOverlay;