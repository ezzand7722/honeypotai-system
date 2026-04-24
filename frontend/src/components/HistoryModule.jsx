import React, { useState } from 'react';
import LiveMap from './LiveMap';

const HistoryModule = ({ historyList }) => {
  const [selectedHistory, setSelectedHistory] = useState(null);

  const titleText = selectedHistory 
    ? `DEEP_LOG_ANALYSIS_${selectedHistory.id}` 
    : "ATTACK_HISTORY_ARCHIVE_V4.0";

  return (
    <div className="history-module-container" style={{ 
      padding: '40px', 
      color: '#00ff41', 
      fontFamily: 'monospace',
      height: '100%', 
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden', 
      backgroundColor: '#020b02', 
      boxSizing: 'border-box',
      position: 'relative'
    }}>
      
      <style>{`
        .blink-red { color: #ff0000 !important; animation: blink 0.5s infinite; font-weight: bold; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.2; } 100% { opacity: 1; } }
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #00ff41; }
        .custom-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
      `}</style>

      {/* الهيدر المحسن: إزالة الخط الوهمي نهائياً */}
      <div className="screen-header" style={{ 
        borderBottom: '4px solid #00ff41', 
        marginBottom: '20px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        paddingBottom: '15px',
        flexShrink: 0 
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ 
            width: '6px', 
            height: '35px', 
            background: '#00ff41', 
            marginRight: '20px', 
            boxShadow: '0 0 12px #00ff41',
            flexShrink: 0 
          }}></div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ 
              margin: 0, 
              fontSize: '26px', 
              fontWeight: '700', 
              letterSpacing: '8px', 
              lineHeight: '1',
              textTransform: 'uppercase',
              display: 'inline-block', // تغيير لضمان عدم حدوث تداخل
              marginRight: '-8px',      // موازنة مسافة الحرف الأخير لتوسيط النص برمجياً
              padding: 0,
              border: 'none',
              outline: 'none'
            }}>
              {titleText}
            </h2>
            
            {selectedHistory && (
              <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '5px', letterSpacing: '1px' }}>
                &gt; STATUS: ENCRYPTED_DATABASE_ACCESS_GRANTED
              </div>
            )}
          </div>
        </div>

        {selectedHistory && <span className="blink-red" style={{ fontSize: '18px' }}>!! SECURE_LOG_ACCESS !!</span>}
      </div>

      <div className="history-content-wrapper" style={{ 
        flex: 1, 
        minHeight: 0, 
        overflow: 'hidden', 
        display: 'flex',
        flexDirection: 'column'
      }}>
        {!selectedHistory ? (
          <div className="history-grid custom-scroll" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
            gap: '25px',
            overflowY: 'auto',
            paddingBottom: '20px',
            paddingRight: '10px'
          }}>
            {historyList.map((item) => (
              <div 
                key={item.id} 
                onClick={() => setSelectedHistory(item)}
                style={{
                  border: '1px solid rgba(0, 255, 65, 0.2)',
                  background: 'rgba(0,15,0,0.6)',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: '0.3s',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '140px',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(0,255,65,0.6)', fontSize: '12px' }}>&gt; TIMESTAMP: {item.date}</span> 
                  <span style={{ fontWeight: '900', color: parseFloat(item.threat) > 85 ? '#ff0000' : '#00ff41' }}>
                    {item.type}
                  </span> 
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#888' }}>SOURCE_ORIGIN:</div>
                    <span style={{ color: '#ffaa00', fontWeight: 'bold' }}>{item.ip}</span>
                  </div>
                  <span style={{ border: '1px solid #00ff41', padding: '2px 6px', fontSize: '11px' }}>{item.status}</span>
                </div>
                <div style={{ height: '4px', width: '100%', background: '#081a08', marginTop: '10px' }}>
                    <div style={{ height: '100%', width: `${item.threat}%`, background: parseFloat(item.threat) > 85 ? '#ff0000' : '#ffaa00' }}></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="split-layout" style={{ 
            display: 'grid', 
            gridTemplateColumns: '1.2fr 1fr', 
            gap: '30px', 
            height: '100%', 
            minHeight: 0 
          }}>
            <div style={{ 
              border: '1px solid rgba(0,255,65,0.2)', 
              background: '#000', 
              position: 'relative', 
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              <div style={{ flex: 1 }}>
                <LiveMap 
                  key={selectedHistory.id} 
                  isAttacked={true} 
                  attackerCoords={selectedHistory.coords} 
                  customWidth={800} 
                  customHeight={600} 
                />
              </div>
              <div style={{ position: 'absolute', top: '20px', left: '20px', fontSize: '12px', background: 'rgba(0,10,0,0.85)', padding: '10px 15px', borderLeft: '3px solid #ffaa00' }}>
                GEOGRAPHIC_LOCK: <span style={{ color: '#ffaa00', fontWeight: 'bold' }}>{selectedHistory.loc.toUpperCase()}</span>
              </div>
            </div>

            <div style={{ 
              border: '1px solid #00ff41', 
              display: 'flex', 
              flexDirection: 'column', 
              height: '100%', 
              minHeight: 0,
              background: 'rgba(0, 15, 0, 0.4)'
            }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '30px' }} className="custom-scroll">
                <h4 style={{ color: '#00ff41', margin: '0 0 20px 0', borderBottom: '1px solid rgba(0,255,65,0.3)', paddingBottom: '10px' }}>
                  // THREAT_ACTOR_PROFILE
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['SOURCE_IP', selectedHistory.ip, '#ffaa00'],
                      ['NETWORK_ISP', 'GLOBAL_BACKBONE_TRACED', ''],
                      ['PROTOCOL', selectedHistory.proto || 'UDP', ''],
                      ['LOCATION', selectedHistory.loc.toUpperCase(), ''],
                      ['TARGET_PORT', selectedHistory.port || '37777', ''],
                      ['THREAT_LEVEL', `${selectedHistory.threat}%`, '#ff0000'],
                      ['COORDINATES', `${selectedHistory.coords?.lat}, ${selectedHistory.coords?.lng}`, ''],
                      ['AI_MITIGATION', 'COMPLETE_NEUTRALIZATION', '#00ff41']
                    ].map(([label, value, color], i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(0,255,65,0.1)' }}>
                        <td style={{ padding: '12px 0', opacity: 0.5, fontSize: '12px' }}>{label}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: color || '#fff' }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: '20px', borderTop: '1px solid rgba(0,255,65,0.2)', flexShrink: 0 }}>
                <button 
                  onClick={() => setSelectedHistory(null)}
                  style={{ 
                    width: '100%', 
                    padding: '15px', 
                    background: 'transparent', 
                    border: '2px solid #00ff41', 
                    color: '#00ff41',
                    fontWeight: '900',
                    cursor: 'pointer',
                    letterSpacing: '2px',
                    transition: '0.2s'
                  }}
                >
                  &lt;&lt; BACK_TO_ARCHIVE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryModule;