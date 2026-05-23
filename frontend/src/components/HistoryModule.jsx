import React, { useState } from 'react';
import LiveMap from './LiveMap';

const HistoryModule = ({ historyList, onClearHistory }) => {
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {!selectedHistory && (
            <button
              onClick={() => {
                if (typeof onClearHistory === 'function') onClearHistory();
              }}
              style={{
                padding: '10px 14px',
                background: 'transparent',
                border: '2px solid #00ff41',
                color: '#00ff41',
                fontWeight: '900',
                cursor: 'pointer',
                letterSpacing: '2px',
                transition: 'all 0.2s ease',
                fontSize: '12px',
                borderRadius: '2px',
                minHeight: '38px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#00ff41';
                e.currentTarget.style.color = '#000';
                e.currentTarget.style.boxShadow = '0 0 18px rgba(0, 255, 65, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#00ff41';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              CLEAR_HISTORY
            </button>
          )}

          {selectedHistory && <span className="blink-red" style={{ fontSize: '18px' }}>!! SECURE_LOG_ACCESS !!</span>}
        </div>
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
                  border: '1px solid rgba(0, 255, 65, 0.3)',
                  background: 'rgba(0,15,0,0.8)',
                  padding: '26px 24px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '160px',
                  justifyContent: 'space-between',
                  borderRadius: '2px',
                  boxShadow: '0 0 10px rgba(0, 255, 65, 0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0,20,0,0.95)';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.6)';
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 65, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0,15,0,0.8)';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.3)';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 65, 0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(0,255,65,0.6)', fontSize: '13px', fontWeight: '600' }}>&gt; TIMESTAMP: {item.date}</span> 
                  <span style={{ fontWeight: '900', color: parseFloat(item.threat) > 85 ? '#ff0000' : '#00ff41', fontSize: '14px' }}>
                    {item.type}
                  </span> 
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>SOURCE_ORIGIN:</div>
                    <span style={{ color: '#ffaa00', fontWeight: 'bold', fontSize: '14px' }}>{item.ip}</span>
                  </div>
                  <span style={{ border: '1px solid #00ff41', padding: '4px 10px', fontSize: '12px', fontWeight: '600', color: '#00ff41' }}>{item.status}</span>
                </div>
                <div style={{ height: '6px', width: '100%', background: '#081a08', marginTop: '14px', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${item.threat}%`, background: parseFloat(item.threat) > 85 ? '#ff0000' : '#ffaa00', boxShadow: parseFloat(item.threat) > 85 ? '0 0 10px #ff0000' : 'none' }}></div>
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
                      ['SOURCE_IP (src_ip)', selectedHistory.ip || selectedHistory.src_ip, '#ffaa00'],
                      ['NETWORK_ISP', 'GLOBAL_BACKBONE_TRACED', ''],
                      ['PROTOCOL', selectedHistory.proto || 'UDP', ''],
                      ['LOCATION', selectedHistory.loc.toUpperCase(), ''],
                      ['TARGET_PORT', selectedHistory.port || '37777', ''],
                      ['ATTACK_TYPE', selectedHistory.attack_type || selectedHistory.type, '#ff9900'],
                      ['THREAT_LEVEL (severity)', `${selectedHistory.threat || selectedHistory.severity}`, '#ff0000'],
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

                <h4 style={{ color: '#00ff41', margin: '30px 0 15px 0', borderBottom: '1px solid rgba(0,255,65,0.3)', paddingBottom: '10px' }}>
                  // ATTACK_STATISTICS
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['CONNECTION_COUNT', selectedHistory.connection_count || 0, '#ffaa00'],
                      ['SUCCESS_COUNT', selectedHistory.success_count || 0, '#00ff41'],
                      ['FAILED_COUNT', selectedHistory.failed_count || 0, '#ff5555'],
                      ['UNIQUE_PASSWORDS', selectedHistory.unique_passwords || 0, '#ffaa00'],
                      ['COMMAND_COUNT', selectedHistory.command_count || 0, '#ff6666'],
                      ['SUSPICIOUS_COMMANDS', selectedHistory.suspicious_commands || 0, '#ff0000']
                    ].map(([label, value, color], i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(0,255,65,0.1)' }}>
                        <td style={{ padding: '10px 0', opacity: 0.5, fontSize: '12px' }}>{label}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: color, fontSize: '13px' }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h4 style={{ color: '#00ff41', margin: '30px 0 20px 0', borderBottom: '1px solid rgba(0,255,65,0.3)', paddingBottom: '10px' }}>
                  // EVENT_TIMELINE
                </h4>
                <div style={{ position: 'relative', paddingLeft: '30px' }}>
                  {selectedHistory.eventTimeline && selectedHistory.eventTimeline.map((evt, i) => (
                    <div key={i} style={{ marginBottom: '20px', position: 'relative' }}>
                      {/* خط vertical */}
                      {i < selectedHistory.eventTimeline.length - 1 && (
                        <div style={{
                          position: 'absolute',
                          left: '-22px',
                          top: '24px',
                          width: '2px',
                          height: '32px',
                          background: 'rgba(0,255,65,0.2)'
                        }}></div>
                      )}
                      {/* النقطة */}
                      <div style={{
                        position: 'absolute',
                        left: '-30px',
                        top: '2px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: evt.status === 'critical' ? '#ff0000' : evt.status === 'warning' ? '#ffaa00' : '#00ff41',
                        border: '2px solid rgba(0,255,65,0.5)',
                        boxShadow: evt.status === 'critical' ? '0 0 10px #ff0000' : evt.status === 'warning' ? '0 0 8px #ffaa00' : '0 0 8px #00ff41'
                      }}></div>
                      {/* التفاصيل */}
                      <div style={{ fontSize: '11px', opacity: 0.7, color: '#888' }}>
                        {evt.time}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: evt.status === 'critical' ? '#ff0000' : evt.status === 'warning' ? '#ffaa00' : '#00ff41',
                        marginTop: '2px',
                        letterSpacing: '0.5px'
                      }}>
                        {evt.event}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: '24px', borderTop: '1px solid rgba(0,255,65,0.3)', flexShrink: 0 }}>
                <button 
                  onClick={() => setSelectedHistory(null)}
                  style={{ 
                    width: '100%', 
                    padding: '18px 20px', 
                    background: 'transparent', 
                    border: '2px solid #00ff41', 
                    color: '#00ff41',
                    fontWeight: '900',
                    cursor: 'pointer',
                    letterSpacing: '2px',
                    transition: 'all 0.3s ease',
                    fontSize: '16px',
                    borderRadius: '2px',
                    minHeight: '55px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#00ff41';
                    e.currentTarget.style.color = '#000';
                    e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 255, 65, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#00ff41';
                    e.currentTarget.style.boxShadow = 'none';
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