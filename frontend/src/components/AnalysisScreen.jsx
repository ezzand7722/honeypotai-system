import React, { useState, useEffect, useRef } from 'react';

const AnalysisScreen = ({ onClose, isAttacked, activeAttack, settings, attackIndex = 1 }) => {
  const [progress, setProgress] = useState(0);
  const [isMitigating, setIsMitigating] = useState(false);
  const [logs, setLogs] = useState([`> INITIALIZING_DEEP_SCAN_ON_VECTOR_${attackIndex}...`]);
  const [showEmergency, setShowEmergency] = useState(false); 
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getUpdateSpeed = () => {
    if (settings?.scanSpeed === 'FAST') return 15;
    if (settings?.scanSpeed === 'SLOW') return 100;
    return 40; 
  };

  useEffect(() => {
    if (progress === 100) {
      setShowEmergency(true); 
      const timer = setTimeout(() => setShowEmergency(false), 3000); 
      return () => clearTimeout(timer);
    }
  }, [progress]);

  useEffect(() => {
    const sequence = [
      { p: 10, msg: `> INTERCEPTING_TCP_PACKETS_FROM_${activeAttack?.ip || 'UNKNOWN'}...` },
      { p: 30, msg: "> EXTRACTING_METADATA_AND_PAYLOADS..." },
      { p: 50, msg: `> SIGNATURE_MATCH: ${activeAttack?.type || 'MALICIOUS_NODE'}` },
      { p: 70, msg: "> CROSS_REFERENCING_THREAT_INTEL..." },
      { p: 90, msg: `> TRACING_LOCATION: ${activeAttack?.loc || 'HIDDEN_NODE'}...` },
      { p: 100, msg: `!!! WARNING: VECTOR_${attackIndex}_CONFIRMED_CRITICAL` }
    ];
    
    const currentStep = sequence.find(s => progress === s.p);
    if (currentStep && !logs.includes(currentStep.msg)) {
      setLogs(prev => [...prev, currentStep.msg]);
    }
  }, [progress, logs, activeAttack, attackIndex]);

  useEffect(() => {
    let timer;
    if (isAttacked && progress < 100) {
      timer = setInterval(() => {
        setProgress(prev => (prev < 100 ? prev + 1 : 100));
      }, getUpdateSpeed()); 
    }
    return () => clearInterval(timer);
  }, [isAttacked, progress, settings?.scanSpeed]);

  useEffect(() => {
    if (progress === 100 && settings?.autoMitigation && !isMitigating) {
      const autoTimer = setTimeout(() => handleCounterMeasure(), 1500);
      return () => clearTimeout(autoTimer);
    }
  }, [progress, settings?.autoMitigation]);

  const handleCounterMeasure = () => {
    if (isMitigating) return;
    setIsMitigating(true);
    setShowEmergency(false); 
    setLogs(prev => [...prev, `> INITIATING_FIREWALL_BLOCKADE...`]);
    
    setTimeout(() => {
      setLogs(prev => [...prev, `> SUCCESS: VECTOR_NEUTRALIZED`]);
      setTimeout(() => {
        setIsMitigating(false);
        onClose(activeAttack?.id); 
      }, 1500); 
    }, 2000);
  };

  const dynamicColor = (progress > 85 && !isMitigating) ? '#ff0000' : '#00ff41';

  return (
    <div style={{ 
      padding: '40px', 
      color: dynamicColor, 
      fontFamily: 'monospace', 
      height: '100%', 
      boxSizing: 'border-box', 
      display: 'flex', 
      flexDirection: 'column', 
      position: 'relative', 
      overflow: 'hidden', 
      background: '#020b02',
      animation: (progress > 85 && !isMitigating) ? 'globalShake 0.1s infinite' : 'none'
    }}>
      
      {/* هيدر موحد متوافق مع NetworkModule */}
      <div style={{ borderBottom: `4px solid ${dynamicColor}`, marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '15px' }}>
         <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ 
              width: '6px', height: '35px', background: dynamicColor, marginRight: '20px', 
              boxShadow: `0 0 12px ${dynamicColor}`,
              animation: progress > 85 ? 'blink 0.3s infinite' : 'none'
            }}></div>
            <h2 style={{ margin: 0, fontSize: '32px', fontWeight: '900', letterSpacing: '8px' }}>
                {progress > 90 ? `THREAT_CRITICAL_ANALYSIS` : `SYSTEM_STREAM_0${attackIndex}`}
            </h2>
         </div>
         {progress > 85 && <span className="blink-red" style={{ fontSize: '18px', color: '#ff0000' }}>!! ALERT: MALICIOUS_ACTIVITY_DETECTED !!</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '40px', flex: 1, minHeight: 0 }}>
        
        {/* العمود الأيسر: بيانات الهدف والتحكم */}
        <aside style={{ borderRight: `1px solid ${dynamicColor}33`, paddingRight: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '12px', opacity: 0.5 }}>// TARGET_SPECIFICATIONS</div>
          
          <div style={{ background: 'rgba(0, 20, 0, 0.4)', border: `1px solid ${dynamicColor}33`, padding: '20px' }}>
            <div style={{ fontSize: '14px', marginBottom: '15px', color: '#fff', fontWeight: 'bold' }}>NETWORK_LOCK:</div>
            <div style={{ fontSize: '12px', lineHeight: '2' }}>
              <div><span style={{opacity: 0.6}}>IP:</span> <span style={{color: '#ffff00'}}>{activeAttack?.ip}</span></div>
              <div><span style={{opacity: 0.6}}>LOC:</span> {activeAttack?.loc}</div>
              <div><span style={{opacity: 0.6}}>TYPE:</span> {activeAttack?.type}</div>
              <div><span style={{opacity: 0.6}}>VECTOR:</span> 0{attackIndex}</div>
            </div>
          </div>

          <div style={{ flex: 1 }}></div>

          <button 
            onClick={handleCounterMeasure}
            disabled={isMitigating || progress < 100}
            style={{
              width: '100%',
              padding: '20px', 
              background: progress === 100 ? dynamicColor : 'transparent',
              color: progress === 100 ? '#000' : dynamicColor, 
              border: `2px solid ${dynamicColor}`,
              fontWeight: '900', 
              letterSpacing: '2px',
              cursor: progress === 100 ? 'pointer' : 'not-allowed',
              transition: '0.2s',
              boxShadow: progress === 100 ? `0 0 20px ${dynamicColor}` : 'none'
            }}
          >
            {isMitigating ? "NEUTRALIZING..." : progress === 100 ? "EXECUTE PURGE" : "ANALYZING..."}
          </button>
        </aside>

        {/* القسم الرئيسي: الرادار وسجلات البيانات */}
        <main style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
          {/* حاوية الرادار */}
          <div style={{ 
            flex: 1, 
            background: 'rgba(0, 20, 0, 0.2)', 
            border: `1px solid ${dynamicColor}11`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}>
             <div className="radar-frame" style={{ borderColor: `${dynamicColor}44`, width: '400px', height: '400px' }}>
                <div className="radar-sweep" style={{ background: `conic-gradient(from 0deg, transparent 50%, ${dynamicColor}66 100%)`, animationDuration: '3s' }}></div>
                <div style={{ position: 'absolute', inset: '25%', border: `1px solid ${dynamicColor}22`, borderRadius: '50%' }}></div>
                <div style={{ position: 'absolute', inset: '50%', border: `1px solid ${dynamicColor}22`, borderRadius: '50%' }}></div>
                
                {progress > 20 && (
                  <div className="threat-target" style={{ 
                    background: progress > 80 ? '#ff0000' : '#ffff00', 
                    boxShadow: `0 0 20px ${progress > 80 ? '#ff0000' : '#ffff00'}`,
                    top: '30%', left: '70%',
                    animation: 'blink 0.5s infinite'
                  }}></div>
                )}
             </div>

             <div style={{ position: 'absolute', textAlign: 'center', textShadow: `0 0 10px ${dynamicColor}` }}>
                <div style={{ fontSize: '48px', fontWeight: '900' }}>{progress}%</div>
                <div style={{ fontSize: '10px', letterSpacing: '4px', opacity: 0.7 }}>ANALYSIS_COMPLETE</div>
             </div>
          </div>

          {/* سجلات التحليل السفلية */}
          <div style={{ 
            background: 'rgba(0,0,0,0.8)', 
            border: `1px solid ${dynamicColor}33`, 
            height: '180px', 
            padding: '20px', 
            overflowY: 'auto',
            boxShadow: 'inset 0 0 20px #000'
          }}>
            <div style={{ fontSize: '10px', marginBottom: '10px', opacity: 0.5 }}>// DEEP_PACKET_INSPECTION_LOGS</div>
            {logs.map((log, i) => (
              <div key={i} style={{ 
                color: log.includes('!!!') || log.includes('WARNING') ? '#ff0000' : dynamicColor, 
                marginBottom: '8px',
                fontSize: '13px',
                borderLeft: `2px solid ${log.includes('!!!') ? '#ff0000' : dynamicColor}44`,
                paddingLeft: '10px'
              }}>
                {log}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </main>
      </div>

      {/* Emergency Overlay */}
      {showEmergency && !isMitigating && (
        <div className="emergency-overlay" style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,0,0,0.2)', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: '#ff0000', color: '#fff', padding: '40px 80px', border: '4px solid #fff', textAlign: 'center', boxShadow: '0 0 100px #ff0000' }}>
            <h2 style={{ fontSize: '40px', margin: 0, fontWeight: '900' }}>!! THREAT_CONFIRMED !!</h2>
            <p style={{ margin: '15px 0 0', fontSize: '14px', letterSpacing: '2px' }}>READY FOR COUNTER-MEASURE PROTOCOL</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 50% { opacity: 0.2; } }
        @keyframes globalShake { 0% { transform: translate(1px, 1px); } 50% { transform: translate(-1px, -1px); } }
        .radar-frame { border-radius: 50%; border: 1px solid; position: relative; display: flex; align-items: center; justify-content: center; }
        .radar-sweep { position: absolute; inset: 0; border-radius: 50%; animation: sweep linear infinite; }
        .threat-target { position: absolute; width: 16px; height: 16px; border-radius: 50%; }
        .blink-red { animation: blink 0.5s infinite; }
      `}</style>
    </div>
  );
};

export default AnalysisScreen;