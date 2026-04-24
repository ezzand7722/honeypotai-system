import React, { useState, useEffect } from 'react';

const NetworkModule = ({ activeAttack, activeAttacks = [], onSelectAttack }) => {
  // --- الحالات المحلية للتحكم في العرض الداخلي (بدون حذف) ---
  const [localSelectedAttack, setLocalSelectedAttack] = useState(null);

  // تحديث الهجمة المختارة محلياً عند تغير الهجمات القادمة من الخارج
  useEffect(() => {
    if (activeAttack) {
      setLocalSelectedAttack(activeAttack);
    } else if (activeAttacks.length > 0) {
      setLocalSelectedAttack(activeAttacks[0]);
    } else {
      setLocalSelectedAttack(null);
    }
  }, [activeAttack, activeAttacks]);

  // تحديد الهجوم النشط للعرض وتحليل المنافذ المستهدفة بناءً على الاختيار المحلي
  const displayAttack = localSelectedAttack;
  const attackPorts = activeAttacks.map(a => a.port?.toString()).filter(Boolean);

  // --- الحالات الديناميكية الأصلية بالكامل (بدون أي حذف) ---
  const [nodes, setNodes] = useState([
    { id: 'DH-CAM-01', ip: '192.168.1.105', status: 'ONLINE', latency: '11ms', cpu: 24, uptime: '12d 4h' },
    { id: 'DH-CAM-02', ip: '192.168.1.108', status: 'ONLINE', latency: '19ms', cpu: 16, uptime: '05d 1h' },
    { id: 'HONEY-NODE-X', ip: '192.168.1.200', status: 'ACTIVE', latency: '5ms', cpu: 89, uptime: '48d 12h' },
    { id: 'GATEWAY-SEC', ip: '192.168.1.1', status: 'SECURED', latency: '2ms', cpu: 12, uptime: '150d 0h' },
  ]);

  const [traffic, setTraffic] = useState({ inbound: 1.3, outbound: 134 });
  const [packetCount, setPacketCount] = useState(1024);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // محاكاة التفاعل اللحظي مع الهجوم (المحرك الأصلي بكل تفاصيله)
  useEffect(() => {
    const interval = setInterval(() => {
      setNodes(prevNodes => prevNodes.map(node => {
        const isTarget = displayAttack && (node.id === 'HONEY-NODE-X' || node.ip === displayAttack.ip);
        return {
          ...node,
          cpu: isTarget ? Math.min(99, 94 + Math.random() * 5) : Math.max(5, Math.min(80, node.cpu + (Math.random() * 4 - 2))),
          latency: isTarget ? (150 + Math.floor(Math.random() * 100)) + "ms" : (parseInt(node.latency) + Math.floor(Math.random() * 3 - 1)) + "ms",
          status: isTarget ? 'CRITICAL' : node.status
        };
      }));

      setTraffic({
        inbound: displayAttack ? (6.4 + Math.random() * 2).toFixed(1) : (1.3 + Math.random() * 0.4).toFixed(1),
        outbound: displayAttack ? Math.floor(950 + Math.random() * 400) : 134
      });

      setPacketCount(prev => prev + (displayAttack ? Math.floor(Math.random() * 2000) : Math.floor(Math.random() * 100)));
      
      if (displayAttack) {
        setAnalysisProgress(prev => (prev < 100 ? prev + 2 : 100));
      } else {
        setAnalysisProgress(0);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [displayAttack]);

  // دالة التعامل مع النقر على الهجمة في القائمة اليسرى لتغيير العرض فقط
  const handleAttackClick = (attack) => {
    setLocalSelectedAttack(attack);
  };

  // تجميع كافة الهجمات المتاحة لعرضها في القائمة اليسرى دائماً
  const allAvailableAttacks = activeAttacks.length > 0 ? activeAttacks : (activeAttack ? [activeAttack] : []);

  return (
    <div style={{ 
      padding: '40px', color: '#00ff41', fontFamily: 'monospace', height: '100%', 
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column', 
      position: 'relative', overflow: 'hidden', background: '#020b02' 
    }}>
      
      {/* تأثير وميض الخطر - تفصيل أصلي */}
      {displayAttack && (
        <div style={{ 
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
          border: '4px solid #ff0000', pointerEvents: 'none', zIndex: 100, 
          animation: 'danger-blink 1.5s infinite', background: 'rgba(255,0,0,0.03)' 
        }} />
      )}

      <style>{`
        @keyframes wave-move { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .flux-wave { 
          animation: wave-move ${displayAttack ? '0.3s' : '2s'} linear infinite; 
          background: linear-gradient(90deg, transparent, ${displayAttack ? '#ff0000' : '#00ff41'}, transparent); 
        }
        .blink-red { color: #ff0000 !important; animation: blink 0.5s infinite; font-weight: bold; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.2; } 100% { opacity: 1; } }
        @keyframes danger-blink { 0% { opacity: 0; } 50% { opacity: 0.5; } 100% { opacity: 0; } }
        .analysis-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px; }
        .analysis-item { border-left: 2px solid #00ff41; padding-left: 8px; font-size: 10px; }
      `}</style>

      {/* الهيدر الموحد بالأبعاد الصحيحة */}
      <div style={{ borderBottom: '4px solid #00ff41', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '15px' }}>
         <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '6px', height: '35px', background: '#00ff41', marginRight: '20px', boxShadow: '0 0 12px #00ff41' }}></div>
            <h2 style={{ margin: 0, fontSize: '32px', fontWeight: '900', letterSpacing: '8px' }}>NETWORK_INFRASTRUCTURE_V4.0</h2>
         </div>
         {displayAttack && <span className="blink-red" style={{ fontSize: '18px' }}>!! ALERT: INTRUSION_DETECTED !!</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '40px', flex: 1, minHeight: 0 }}>
        
        {/* العمود الأيسر: الهجمات النشطة (تظهر دائماً عند وجود أي هجمة) */}
        <aside style={{ borderRight: '1px solid rgba(0, 255, 65, 0.2)', paddingRight: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '12px', marginBottom: '15px', opacity: 0.5 }}>// ACTIVE_ATTACK_VECTORS</div>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
            {allAvailableAttacks.map((attack, idx) => (
              <div 
                key={idx} 
                onClick={() => handleAttackClick(attack)} 
                style={{ 
                  padding: '18px 20px', marginBottom: '12px', cursor: 'pointer',
                  border: displayAttack?.id === attack.id ? '2px solid #ff0000' : '1px solid rgba(255,0,0,0.3)',
                  background: displayAttack?.id === attack.id ? 'rgba(255, 0, 0, 0.15)' : 'transparent',
                  color: '#fff', fontSize: '16px', fontWeight: '900', transition: '0.2s'
                }}
              >
                {displayAttack?.id === attack.id ? `> ${attack.id}` : attack.id}
                <div style={{ color: displayAttack?.id === attack.id ? '#fff' : '#ff4444', fontSize: '10px', marginTop: '4px' }}>{attack.threat}</div>
              </div>
            ))}
            {allAvailableAttacks.length === 0 && (
                <div style={{ fontSize: '11px', opacity: 0.3, textAlign: 'center', marginTop: '20px' }}>NO_ACTIVE_THREATS</div>
            )}
          </div>
        </aside>

        {/* المحتوى الرئيسي */}
        <main style={{ overflowY: 'auto', paddingRight: '15px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
          {/* جدول الأجهزة - تفصيل أصلي بالكامل */}
          <section>
            <h3 style={{ fontSize: '14px', marginBottom: '15px', opacity: 0.7 }}>// LIVE_NODE_INVENTORY</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 255, 65, 0.1)', textAlign: 'left' }}>
                  <th style={{ padding: '12px' }}>IDENTIFIER</th>
                  <th>IP_ADDR</th>
                  <th>CPU_LOAD</th>
                  <th>LATENCY</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(0, 255, 65, 0.1)' }}>
                    <td style={{ padding: '12px' }}>{node.id}</td>
                    <td style={{ color: '#ffff00' }}>{node.ip}</td>
                    <td>
                      <div style={{ width: '100px', height: '8px', background: '#000', border: '1px solid #333' }}>
                        <div style={{ 
                          width: `${node.cpu}%`, height: '100%', 
                          background: node.cpu > 85 ? '#ff0000' : '#00ff41',
                          boxShadow: node.cpu > 85 ? '0 0 15px #ff0000' : 'none',
                          transition: 'width 0.3s' 
                        }} />
                      </div>
                    </td>
                    <td style={{ color: parseInt(node.latency) > 100 ? '#ff0000' : 'inherit' }}>{node.latency}</td>
                    <td className={node.status === 'CRITICAL' ? 'blink-red' : ''}>
                      {node.status === 'CRITICAL' ? '[!] ATTACK' : `[✓] ${node.status}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* المنطقة السفلية: توزيع ثلاثي (Traffic + Analysis + Ports) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            
            {/* 1. محاكي الترافيك اللحظي */}
            <div style={{ border: `1px solid ${displayAttack ? '#ff0000' : '#00ff41'}`, padding: '20px', background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h4 style={{ fontSize: '12px', margin: '0 0 10px 0' }}>TRAFFIC_FLUX</h4>
                <div style={{ fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>INBOUND: <b className={displayAttack ? 'blink-red' : ''}>{traffic.inbound} GB/s</b></span>
                </div>
                <div style={{ height: '60px', background: 'rgba(0,0,0,0.5)', marginTop: '10px', overflow: 'hidden', position: 'relative' }}>
                    <div className="flux-wave" style={{ position: 'absolute', width: '100%', height: '3px', top: '50%' }}></div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', gap: '2px' }}>
                        {[...Array(20)].map((_, i) => (
                            <div key={i} style={{ flex: 1, background: displayAttack ? '#ff0000' : '#00ff41', height: (Math.random() * 80 + 10) + '%', opacity: 0.4 }} />
                        ))}
                    </div>
                </div>
            </div>

            {/* 2. DEEP_PACKET_ANALYSIS */}
            <div style={{ 
              background: 'rgba(0,10,0,0.9)', padding: '20px', 
              border: `1px solid ${displayAttack ? '#ff0000' : 'rgba(0,255,65,0.2)'}`, 
              minHeight: '130px' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{opacity: 0.7, fontSize: '12px'}}>{"//"} DEEP_PACKET_ANALYSIS_CORE:</span>
                {displayAttack && <span style={{fontSize: '10px'}}>{analysisProgress}% COMPLETE</span>}
              </div>

              {displayAttack ? (
                <div style={{ animation: 'fadeIn 0.5s' }}>
                  <div style={{ color: '#ff0000', fontWeight: 'bold', fontSize: '12px' }}>[!] ALERT: {displayAttack.type} DETECTED</div>
                  <div className="analysis-grid">
                    <div className="analysis-item">SIGNATURE: <span style={{color: '#fff'}}>CVE-2024-EXPLOIT</span></div>
                    <div className="analysis-item">HEURISTIC: <span style={{color: '#ff0000'}}>CRITICAL (9.4)</span></div>
                    <div className="analysis-item">PATTERN: <span style={{color: '#fff'}}>SEQUENTIAL_BURST</span></div>
                    <div className="analysis-item">PAYLOAD: <span style={{color: '#ffaa00'}}>MALICIOUS_HEADERS</span></div>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#00ff41', fontSize: '11px', opacity: 0.8 }}>
                  [*] Monitoring packet flow... No anomalies detected.<br/>
                  [*] Encapsulation integrity: VERIFIED<br/>
                  [*] Total packets analyzed: {packetCount.toLocaleString()}
                </div>
              )}
            </div>

            {/* 3. DECOY_SERVICE_STATUS - يتأثر بالهجمة المختارة من القائمة اليسرى */}
            <div style={{ border: `1px solid ${displayAttack ? '#ff0000' : '#ffaa00'}`, padding: '20px', background: 'rgba(0,0,0,0.5)' }}>
              <h4 style={{ fontSize: '12px', margin: '0 0 10px 0', color: '#ffaa00' }}>DECOY_SERVICE_STATUS</h4>
              <div style={{ fontSize: '11px' }}>
                {[
                  { p: '23', n: 'TELNET' },
                  { p: '80', n: 'HTTP' },
                  { p: '554', n: 'RTSP' },
                  { p: '2222', n: 'SSH-ALT' },
                  { p: '2223', n: 'TELNET-ALT' }
                ].map(port => {
                  let isUnderAttack = false;
                  if (displayAttack) {
                    const attackPort = displayAttack.port;
                    const attackType = displayAttack.type?.toUpperCase() || '';
                    
                    // الفحص يعتمد على الهجمة النشطة المختارة حالياً في القائمة اليسرى
                    isUnderAttack = (
                      attackPort === 'ALL' ||
                      attackPort === port.p ||
                      attackType.includes(port.n)
                    );
                  }
                  
                  return (
                    <div key={port.p} style={{display: 'flex', justifyContent: 'space-between', marginBottom: '6px'}}>
                      <span style={{ color: isUnderAttack ? '#ff0000' : 'inherit' }}>PORT {port.p}:</span>
                      <span className={isUnderAttack ? 'blink-red' : ''} style={{ color: isUnderAttack ? '#ff0000' : '#00ff41' }}>
                        {isUnderAttack ? 'UNDER_ATTACK' : 'LISTENING'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: '10px', borderTop: '1px dashed #ffaa00', paddingTop: '5px', textAlign: 'center', color: displayAttack ? '#ff0000' : '#ffaa00', fontSize: '10px' }}>
                THREAT_LEVEL: {displayAttack ? 'CRITICAL [9.8/10]' : 'MODERATE [3.2/10]'}
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default NetworkModule;