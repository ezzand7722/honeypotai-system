import React, { useState, useEffect, useRef } from 'react';
import { getCombinedActiveAttacks } from '../logic/attackState';

const AnalysisScreen = ({ onClose, isAttacked, activeAttack, activeAttacks = [], settings, attackIndex = 1 }) => {
  const [isMitigating, setIsMitigating] = useState(false);
  const [logs, setLogs] = useState([`> INITIALIZING_DEEP_SCAN_ON_VECTOR_${attackIndex}...`]);
  const logEndRef = useRef(null);

  const activeTargets = isAttacked
    ? getCombinedActiveAttacks({ activeTestAttack: activeAttack, activeAttacks }).filter(Boolean)
    : [];
  const targetSignature = activeTargets.map((attack) => `${attack?.ip || ''}|${attack?.loc || ''}|${attack?.type || ''}`).join('||');

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getUpdateSpeed = () => {
    if (settings?.scanSpeed === 'FAST') return 15;
    if (settings?.scanSpeed === 'SLOW') return 100;
    return 40;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setLogs((prev) => {
        if (prev[prev.length - 1]?.includes('SCANNER_PULSE')) return prev;
        return [...prev, '> SCANNER_PULSE: CONTINUOUS_MONITORING...'];
      });
    }, getUpdateSpeed() * 20);
    return () => clearInterval(timer);
  }, [settings?.scanSpeed]);

  useEffect(() => {
    if (activeTargets.length === 0) {
      setLogs((prev) => (prev[prev.length - 1]?.includes('SCANNER_IDLE') ? prev : [...prev, '> SCANNER_IDLE: WAITING_FOR_VECTOR...']));
      return;
    }

    setLogs((prev) => {
      const nextLogs = [...prev];
      activeTargets.forEach((attack, index) => {
        const msg = `> TRACKING_VECTOR_${index + 1}: ${attack?.ip || 'MISSING'} @ ${attack?.loc || 'MISSING'}`;
        if (!nextLogs.includes(msg)) {
          nextLogs.push(msg);
        }
      });
      return nextLogs;
    });
  }, [targetSignature]);

  const handleCounterMeasure = () => {
    if (isMitigating) return;
    setIsMitigating(true);
    setLogs((prev) => [...prev, '> INITIATING_FIREWALL_BLOCKADE...']);

    setTimeout(() => {
      setLogs((prev) => [...prev, '> SUCCESS: VECTOR_NEUTRALIZED']);
      setTimeout(() => {
        setIsMitigating(false);
      }, 1500);
    }, 2000);
  };

  const dynamicColor = '#00ff41';

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
      background: '#020b02'
    }}>
      <div style={{ borderBottom: `4px solid ${dynamicColor}`, marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: '6px', height: '35px', background: dynamicColor, marginRight: '20px',
            boxShadow: `0 0 12px ${dynamicColor}`,
            animation: 'blink 0.3s infinite'
          }}></div>
          <h2 style={{ margin: 0, fontSize: '32px', fontWeight: '900', letterSpacing: '8px' }}>
            {activeTargets.length > 1 ? 'MULTI_VECTOR_SCAN' : `SYSTEM_STREAM_0${attackIndex}`}
          </h2>
        </div>
        <span className="blink-red" style={{ fontSize: '18px', color: '#00ff41' }}>
          {activeTargets.length > 0 ? 'SCAN_ACTIVE_TARGET_LOCK' : 'SCAN_ACTIVE_WAITING'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '40px', flex: 1, minHeight: 0 }}>
        <aside style={{ borderRight: `1px solid ${dynamicColor}33`, paddingRight: '20px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 0 }}>
          <div style={{ fontSize: '12px', opacity: 0.5 }}>// TARGET_SPECIFICATIONS</div>

          <div style={{ background: 'rgba(0, 20, 0, 0.4)', border: `1px solid ${dynamicColor}33`, padding: '20px', overflowY: 'auto', maxHeight: '240px', flexShrink: 0 }}>
            <div style={{ fontSize: '14px', marginBottom: '15px', color: '#fff', fontWeight: 'bold' }}>
              {activeTargets.length > 0 ? 'ACTIVE_VECTOR_LOCK' : 'NO_ACTIVE_VECTOR'}
            </div>
            {activeTargets.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {activeTargets.map((attack, index) => (
                  <div key={`${attack?.ip || 'missing'}-${index}`} style={{ borderLeft: `2px solid ${dynamicColor}66`, paddingLeft: '10px', fontSize: '12px', lineHeight: '1.8' }}>
                    <div style={{ color: '#ffff00', fontWeight: 'bold', marginBottom: '4px' }}>VECTOR_0{index + 1}</div>
                    <div><span style={{ opacity: 0.6 }}>IP:</span> <span style={{ color: '#ffff00' }}>{attack?.ip || 'MISSING'}</span></div>
                    <div><span style={{ opacity: 0.6 }}>LOC:</span> {attack?.loc || 'MISSING'}</div>
                    <div><span style={{ opacity: 0.6 }}>TYPE:</span> {attack?.type || 'MISSING'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', lineHeight: '1.8', opacity: 0.7 }}>
                The scan remains active and will mark any incoming vector as soon as it appears.
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}></div>

          <button
            onClick={handleCounterMeasure}
            disabled={isMitigating || activeTargets.length === 0}
            style={{
              width: '100%',
              padding: '20px',
              background: activeTargets.length > 0 ? dynamicColor : 'transparent',
              color: activeTargets.length > 0 ? '#000' : dynamicColor,
              border: `2px solid ${dynamicColor}`,
              fontWeight: '900',
              letterSpacing: '2px',
              cursor: activeTargets.length > 0 ? 'pointer' : 'not-allowed',
              transition: '0.2s',
              boxShadow: activeTargets.length > 0 ? `0 0 20px ${dynamicColor}` : 'none'
            }}
          >
            {isMitigating ? 'NEUTRALIZING...' : activeTargets.length > 0 ? 'EXECUTE PURGE' : 'SCANNER_IDLE'}
          </button>
        </aside>

        <main style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '25px', minHeight: 0 }}>
          <div style={{
            flex: 1,
            minHeight: 0,
            background: 'rgba(0, 20, 0, 0.2)',
            border: `1px solid ${dynamicColor}11`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div className="radar-frame" style={{ borderColor: `${dynamicColor}44`, width: '340px', height: '340px', flexShrink: 0, marginTop: '18px' }}>
              <div className="radar-sweep" style={{ background: `conic-gradient(from 0deg, transparent 50%, ${dynamicColor}66 100%)`, animationDuration: '3s' }}></div>
              <div style={{ position: 'absolute', inset: '25%', border: `1px solid ${dynamicColor}22`, borderRadius: '50%' }}></div>
              <div style={{ position: 'absolute', inset: '50%', border: `1px solid ${dynamicColor}22`, borderRadius: '50%' }}></div>

              {activeTargets.map((attack, index) => {
                const total = Math.max(activeTargets.length, 1);
                const angle = (index / total) * Math.PI * 2;
                const radiusPercent = 24 + (index % 3) * 8;
                const x = 50 + Math.cos(angle) * radiusPercent;
                const y = 50 + Math.sin(angle) * radiusPercent;

                return (
                  <div key={`${attack?.ip || 'missing'}-${index}`} className="threat-target" style={{
                    background: '#ffff00',
                    boxShadow: '0 0 20px #ffff00',
                    top: `${y}%`,
                    left: `${x}%`,
                    animation: 'blink 0.5s infinite'
                  }} />
                );
              })}
            </div>

            <div style={{ position: 'absolute', textAlign: 'center', textShadow: `0 0 10px ${dynamicColor}`, pointerEvents: 'none' }}>
              <div style={{ fontSize: '24px', fontWeight: '900' }}>24/7</div>
              <div style={{ fontSize: '10px', letterSpacing: '4px', opacity: 0.7 }}>SCANNER_ACTIVE</div>
            </div>
          </div>

          <div style={{
            background: 'rgba(0,0,0,0.8)',
            border: `1px solid ${dynamicColor}33`,
            height: '120px',
            minHeight: '120px',
            padding: '14px 16px',
            overflowY: 'auto',
            boxShadow: 'inset 0 0 20px #000',
            flexShrink: 0
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