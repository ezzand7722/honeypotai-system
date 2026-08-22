import React, { useState } from 'react';
import LiveMap from './LiveMap';

const HistoryModule = ({ historyList = [], onClearHistory }) => {
  console.log('[HistoryModule] historyList length:', historyList.length, historyList);
  const [selectedHistory, setSelectedHistory] = useState(null);

  const titleText = selectedHistory 
    ? "INCIDENT REPORT — " + (selectedHistory.date || selectedHistory.timestamp || 'LOGGED INCIDENT')
    : "ATTACK HISTORY ARCHIVE";

  // EARLY RETURN FOR SELECTED HISTORY (IMPOSSIBLE TO RENDER GRID)
  if (selectedHistory !== null) {
    return (
      <div className="history-module-container" style={{ 
        padding: '30px 40px', color: '#00ff41', fontFamily: 'monospace', height: '100%', 
        display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#020b02', 
        boxSizing: 'border-box', position: 'relative'
      }}>
        <style dangerouslySetInnerHTML={{ __html: '.blink-red { color: #ff0000 !important; animation: blink 0.5s infinite; font-weight: bold; } @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.2; } 100% { opacity: 1; } } .custom-scroll::-webkit-scrollbar { width: 6px; } .custom-scroll::-webkit-scrollbar-thumb { background: #00ff41; } .custom-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }' }} />
        
        <div className="screen-header" style={{ 
          borderBottom: '3px solid #00ff41', marginBottom: '20px', display: 'flex', 
          alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', flexShrink: 0 
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '6px', height: '32px', background: '#00ff41', marginRight: '16px', boxShadow: '0 0 12px #00ff41', flexShrink: 0 }}></div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', letterSpacing: '5px', lineHeight: '1', textTransform: 'uppercase' }}>{titleText}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button onClick={() => setSelectedHistory(null)} style={{ padding: '10px 20px', background: '#00ff41', border: '1px solid #00ff41', color: '#000', fontWeight: '900', cursor: 'pointer', letterSpacing: '1.5px', fontSize: '12px', borderRadius: '3px', boxShadow: '0 0 15px rgba(0, 255, 65, 0.4)' }}>&lt;&lt; BACK TO ARCHIVE</button>
          </div>
        </div>

        <div className="history-content-wrapper" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'row', gap: '25px', height: '100%', minHeight: 0, width: '100%' }}>
            <div style={{ flex: '1.2', border: '1px solid rgba(0,255,65,0.3)', background: '#000', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '4px' }}>
              <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
                <LiveMap key={selectedHistory.id || selectedHistory.ip} isAttacked={true} attackerCoords={selectedHistory.coords} attackerData={selectedHistory} customWidth={750} customHeight={550} />
              </div>
              <div style={{ position: 'absolute', top: '16px', left: '16px', fontSize: '12px', background: 'rgba(0,10,0,0.9)', padding: '8px 14px', borderLeft: '3px solid #ffaa00', borderRadius: '2px', boxShadow: '0 0 10px rgba(0,0,0,0.8)' }}>
                TARGET LOCATION: <span style={{ color: '#00ff41', fontWeight: 'bold' }}>{(selectedHistory.loc || selectedHistory.city || 'Amman, Jordan').toUpperCase()}</span>
              </div>
            </div>

            <div style={{ flex: '1', border: '1px solid rgba(0,255,65,0.4)', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'rgba(0, 15, 0, 0.5)', borderRadius: '4px' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }} className="custom-scroll">
                <h4 style={{ color: '#00ff41', margin: '0 0 16px 0', borderBottom: '1px solid rgba(0,255,65,0.3)', paddingBottom: '8px', letterSpacing: '1px' }}>// THREAT_ACTOR_PROFILE</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['SOURCE_IP', selectedHistory.ip || selectedHistory.src_ip, '#ffaa00'],
                      ['LOCATION', (selectedHistory.loc || selectedHistory.city || 'Amman, Jordan').toUpperCase(), '#00ff41'],
                      ['PROTOCOL', selectedHistory.proto || 'TCP', ''],
                      ['TARGET_PORT', selectedHistory.port || '2222', ''],
                      ['ATTACK_TYPE', selectedHistory.attack_type || selectedHistory.type, '#ff9900'],
                      ['THREAT_LEVEL', selectedHistory.severity || 'HIGH', '#ff0000'],
                      ['AI_STATUS', selectedHistory.status || 'MITIGATED', '#00ff41']
                    ].map(([label, value, color], i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(0,255,65,0.1)' }}><td style={{ padding: '10px 0', opacity: 0.6, fontSize: '11.5px', letterSpacing: '0.5px' }}>{label}</td><td style={{ textAlign: 'right', fontWeight: 'bold', color: color || '#fff', fontSize: '12.5px' }}>{value}</td></tr>
                    ))}
                  </tbody>
                </table>

                <h4 style={{ color: '#00ff41', margin: '24px 0 14px 0', borderBottom: '1px solid rgba(0,255,65,0.3)', paddingBottom: '8px', letterSpacing: '1px' }}>// ATTACK_METRICS</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['CONNECTION_COUNT', selectedHistory.connectionCount ?? selectedHistory.connection_count ?? 0, '#ffaa00'],
                      ['FAILED_LOGINS', selectedHistory.failedCount ?? selectedHistory.failed_count ?? 0, '#ff4444'],
                      ['SUCCESS_LOGINS', selectedHistory.successCount ?? selectedHistory.success_count ?? 0, '#00ff41'],
                      ['UNIQUE_PASSWORDS', selectedHistory.uniquePasswords ?? selectedHistory.unique_passwords ?? 0, '#ffaa00'],
                      ['COMMAND_COUNT', selectedHistory.commandCount ?? selectedHistory.command_count ?? 0, '#ff6666'],
                      ['SUSPICIOUS_CMDS', selectedHistory.suspiciousCmds ?? selectedHistory.suspicious_cmds ?? 0, '#ff0000']
                    ].map(([label, value, color], i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(0,255,65,0.1)' }}><td style={{ padding: '8px 0', opacity: 0.6, fontSize: '11px', letterSpacing: '0.5px' }}>{label}</td><td style={{ textAlign: 'right', fontWeight: 'bold', color: color || '#fff', fontSize: '12px' }}>{value}</td></tr>
                    ))}
                  </tbody>
                </table>

                <h4 style={{ color: '#00ff41', margin: '24px 0 14px 0', borderBottom: '1px solid rgba(0,255,65,0.3)', paddingBottom: '8px', letterSpacing: '1px' }}>// CAPTURED_COMMANDS</h4>
                {(() => {
                  const cmds = selectedHistory.attacker_commands || selectedHistory.commands || [];
                  if (!cmds || cmds.length === 0) {
                    return <div style={{ fontSize: '11px', color: '#777', fontStyle: 'italic', padding: '8px 0' }}>NO COMMANDS CAPTURED IN THIS SESSION</div>;
                  }
                  return (
                    <div style={{ background: '#000', border: '1px solid rgba(0,255,65,0.25)', borderRadius: '3px', padding: '12px', maxHeight: '160px', overflowY: 'auto' }}>
                      {cmds.map((cmd, cIdx) => (
                        <div key={cIdx} style={{ fontSize: '11.5px', color: '#00ff41', fontFamily: 'monospace', marginBottom: '4px' }}>
                          <span style={{ color: '#ff4444', marginRight: '6px' }}>$</span>{cmd}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-module-container" style={{ 
      padding: '30px 40px', color: '#00ff41', fontFamily: 'monospace', height: '100%', 
      display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#020b02', 
      boxSizing: 'border-box', position: 'relative'
    }}>
      <style dangerouslySetInnerHTML={{ __html: '.blink-red { color: #ff0000 !important; animation: blink 0.5s infinite; font-weight: bold; } @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.2; } 100% { opacity: 1; } } .custom-scroll::-webkit-scrollbar { width: 6px; } .custom-scroll::-webkit-scrollbar-thumb { background: #00ff41; } .custom-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }' }} />
      
      <div className="screen-header" style={{ 
        borderBottom: '3px solid #00ff41', marginBottom: '20px', display: 'flex', 
        alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', flexShrink: 0 
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '6px', height: '32px', background: '#00ff41', marginRight: '16px', boxShadow: '0 0 12px #00ff41', flexShrink: 0 }}></div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', letterSpacing: '5px', lineHeight: '1', textTransform: 'uppercase' }}>{titleText}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={() => { if (typeof onClearHistory === 'function') onClearHistory(); }} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid #00ff41', color: '#00ff41', fontWeight: '900', cursor: 'pointer', letterSpacing: '1.5px', fontSize: '11px', borderRadius: '2px' }}>CLEAR_HISTORY</button>
        </div>
      </div>

      <div className="history-content-wrapper" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {historyList.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '15px', color: 'rgba(0,255,65,0.5)', fontSize: '16px', letterSpacing: '2px' }}>
            <div style={{ fontSize: '32px' }}>🛡️</div>
            <div>// NO_ATTACK_RECORDS_IN_ARCHIVE</div>
            <div style={{ fontSize: '12px', opacity: 0.6 }}>ATTACK LOGS AND DETECTIONS WILL BE RECORDED HERE</div>
          </div>
        ) : (
          <div className="history-grid custom-scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px', overflowY: 'auto', paddingBottom: '20px', paddingRight: '10px' }}>
            {historyList.map((item, idx) => (
              <div 
                key={item.id || idx} 
                onClick={() => setSelectedHistory(item)}
                style={{ border: '1px solid rgba(0, 255, 65, 0.3)', background: 'rgba(0,15,0,0.85)', padding: '22px 20px', cursor: 'pointer', transition: 'all 0.25s ease', display: 'flex', flexDirection: 'column', minHeight: '145px', justifyContent: 'space-between', borderRadius: '4px', boxShadow: '0 0 10px rgba(0, 255, 65, 0.1)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'rgba(0,255,65,0.7)', fontSize: '12px', fontWeight: '600' }}>&gt; {item.date || item.timestamp}</span> 
                  <span style={{ fontWeight: '900', color: (item.severityScore || parseFloat(item.threat) || 0) > 85 ? '#ff0040' : '#00d4ff', fontSize: '13px' }}>{item.type}</span> 
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '10px' }}>
                  <div>
                    <div style={{ fontSize: '10.5px', color: '#888', marginBottom: '3px' }}>SOURCE IP:</div>
                    <span style={{ color: '#ffaa00', fontWeight: 'bold', fontSize: '15px', letterSpacing: '0.5px' }}>{item.ip}</span>
                  </div>
                  <span style={{ border: '1px solid #00ff41', padding: '3px 8px', fontSize: '11px', fontWeight: '700', color: '#00ff41', background: 'rgba(0,255,65,0.08)', borderRadius: '2px' }}>{item.status || 'MITIGATED'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryModule;
