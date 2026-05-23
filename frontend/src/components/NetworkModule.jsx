import React, { useState, useEffect } from 'react';

const NetworkModule = ({ activeAttack, activeAttacks = [], onSelectAttack, serverStats }) => {
  // --- الحالات المحلية للتحكم في العرض الداخلي (بدون حذف) ---
  const [localSelectedAttack, setLocalSelectedAttack] = useState(null);

  // منطق تحديث ذكي: يحافظ على الهجمة التي اختارها المستخدم يدوياً ويحدث بياناتها فقط
  useEffect(() => {
    // تجميع كافة الهجمات المتوفرة حالياً
    const allAttacks = activeAttacks.length > 0 ? activeAttacks : (activeAttack ? [activeAttack] : []);
    
    if (allAttacks.length === 0) {
      setLocalSelectedAttack(null);
      return;
    }

    // إذا لم يكن هناك هجمة مختارة حالياً، اختر الأولى كافتراضي
    if (!localSelectedAttack) {
      setLocalSelectedAttack(allAttacks[0]);
    } else {
      // البحث عن الهجمة الحالية في القائمة الجديدة لتحديث بياناتها (مثل التقدم) دون فقدان التركيز
      const updatedVersion = allAttacks.find(a => a.id === localSelectedAttack.id);
      
      if (updatedVersion) {
        setLocalSelectedAttack(updatedVersion);
      } else {
        // إذا اختفت الهجمة التي كان يراقبها المستخدم (انتهت مثلاً)، ننتقل للأولى المتاحة
        setLocalSelectedAttack(allAttacks[0]);
      }
    }
  }, [activeAttack, activeAttacks]);

  // تحديد الهجوم النشط للعرض وتحليل المنافذ المستهدفة بناءً على الاختيار المحلي
  const displayAttack = localSelectedAttack;

  // --- الحالات الديناميكية الأصلية بالكامل (بدون أي حذف) ---
  const [nodes, setNodes] = useState([
    { id: 'DH-CAM-01', ip: '127.0.0.2', status: 'ONLINE', latency: '11ms', cpu: 24, uptime: '12d 4h' },
    { id: 'DH-CAM-02', ip: '127.0.0.3', status: 'ONLINE', latency: '19ms', cpu: 16, uptime: '05d 1h' },
    { id: 'HONEY-NODE-X', ip: '127.0.0.1', status: 'ACTIVE', latency: '5ms', cpu: 89, uptime: '48d 12h' },
    { id: 'GATEWAY-SEC', ip: '127.0.0.10', status: 'SECURED', latency: '2ms', cpu: 12, uptime: '150d 0h' },
  ]);

  const [traffic, setTraffic] = useState({ inbound: '0 KB/s', outbound: '0 KB/s' });
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

      if (serverStats?.network) {
        const parts = serverStats.network.split('|');
        setTraffic({
          inbound: parts[0]?.replace('↓', '').trim() || '0 KB/s',
          outbound: parts[1]?.replace('↑', '').trim() || '0 KB/s'
        });
      } else {
        setTraffic({
          inbound: (1.3 + Math.random() * 0.4).toFixed(1) + ' GB/s',
          outbound: 134 + ' GB/s'
        });
      }

      setPacketCount(prev => prev + (displayAttack ? Math.floor(Math.random() * 2000) : Math.floor(Math.random() * 100)));
      
      if (displayAttack) {
        setAnalysisProgress(prev => (prev < 100 ? prev + 2 : 100));
      } else {
        setAnalysisProgress(0);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [displayAttack, serverStats]);

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
        
        aside::-webkit-scrollbar, main::-webkit-scrollbar { width: 6px; }
        aside::-webkit-scrollbar-track, main::-webkit-scrollbar-track { background: rgba(0, 255, 65, 0.05); }
        aside::-webkit-scrollbar-thumb, main::-webkit-scrollbar-thumb { background: #00ff41; }
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
        
        {/* العمود الأيسر: الهجمات النشطة */}
        <aside style={{ 
          borderRight: '1px solid rgba(0, 255, 65, 0.2)', 
          paddingRight: '20px', 
          display: 'flex', 
          flexDirection: 'column',
          overflowY: 'auto',
          height: '100%'
        }}>
          <div style={{ fontSize: '12px', marginBottom: '15px', opacity: 0.5 }}>// ACTIVE_ATTACK_VECTORS</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {allAvailableAttacks.map((attack, idx) => (
              <div 
                key={attack.id || idx} 
                onClick={() => handleAttackClick(attack)} 
                style={{ 
                  padding: '24px 26px',
                  marginBottom: '14px',
                  cursor: 'pointer',
                  minHeight: '90px',
                  border: displayAttack?.id === attack.id ? '2px solid #ff0000' : '1px solid rgba(255,0,0,0.4)',
                  background: displayAttack?.id === attack.id ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 0, 0, 0.05)',
                  color: '#fff',
                  fontSize: '18px',
                  fontWeight: '900',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  borderRadius: '2px',
                  boxShadow: displayAttack?.id === attack.id ? '0 0 25px rgba(255,0,0,0.4)' : '0 0 8px rgba(255,0,0,0.1)'
                }}
                onMouseEnter={(e) => {
                  if (displayAttack?.id !== attack.id) {
                    e.currentTarget.style.background = 'rgba(255, 0, 0, 0.15)';
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(255,0,0,0.25)';
                    e.currentTarget.style.borderColor = '#ff6666';
                  }
                }}
                onMouseLeave={(e) => {
                  if (displayAttack?.id !== attack.id) {
                    e.currentTarget.style.background = 'rgba(255, 0, 0, 0.05)';
                    e.currentTarget.style.boxShadow = '0 0 8px rgba(255,0,0,0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255,0,0,0.4)';
                  }
                }}
              >
                <div style={{ fontSize: '16px', marginBottom: '8px', letterSpacing: '1px' }}>
                  {displayAttack?.id === attack.id ? `► ${attack.id}` : attack.id}
                </div>
                <div style={{ color: displayAttack?.id === attack.id ? '#ffcccc' : '#ff7777', fontSize: '12px', marginTop: '4px' }}>
                  {attack.type} • {attack.threat || `${Math.floor(attack.progress || 0)}%`}
                </div>
              </div>
            ))}
            {allAvailableAttacks.length === 0 && (
                <div style={{ fontSize: '12px', opacity: 0.3, textAlign: 'center', marginTop: '25px', padding: '20px' }}>NO_ACTIVE_THREATS</div>
            )}
          </div>
        </aside>

        {/* المحتوى الرئيسي */}
        <main style={{ overflowY: 'auto', paddingRight: '15px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            
            <div style={{ border: `1px solid ${displayAttack ? '#ff0000' : '#00ff41'}`, padding: '20px', background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h4 style={{ fontSize: '12px', margin: '0 0 10px 0' }}>TRAFFIC_FLUX</h4>
                <div style={{ fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>NET_I/O: <b className={displayAttack ? 'blink-red' : ''}>↓ {traffic.inbound} | ↑ {traffic.outbound}</b></span>
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
                    isUnderAttack = (
                      attackPort === 'ALL' || 
                      (Array.isArray(attackPort) && attackPort.map(String).includes(port.p)) ||
                      (typeof attackPort === 'string' && attackPort.split(',').map(s => s.trim()).includes(port.p)) ||
                      (attackPort?.toString() === port.p) ||
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
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default NetworkModule;