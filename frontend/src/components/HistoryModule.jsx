import React, { useState } from 'react';
import LiveMap from './LiveMap';

/**
 * HistoryModule
 *
 * Screen 1 (Default): Full attack history archive list.
 * Screen 2 (On Card Click): ONLY the chosen attack's 3D Globe and forensic details,
 * with strictly ONE "BACK TO ARCHIVE" button.
 */
const HistoryModule = ({ historyList = [], onClearHistory }) => {
  const [selectedHistory, setSelectedHistory] = useState(null);

  const titleText = selectedHistory 
    ? `INCIDENT REPORT — ${selectedHistory.date || selectedHistory.timestamp || 'LOGGED INCIDENT'}` 
    : "ATTACK HISTORY ARCHIVE";

  return (
    <div className="history-module-container" style={{ 
      padding: '30px 40px', 
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

      {/* ── Screen Header ────────────────────────────────────────────── */}
      <div className="screen-header" style={{ 
        borderBottom: '3px solid #00ff41', 
        marginBottom: '20px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        paddingBottom: '14px',
        flexShrink: 0 
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ 
            width: '6px', 
            height: '32px', 
            background: '#00ff41', 
            marginRight: '16px', 
            boxShadow: '0 0 12px #00ff41',
            flexShrink: 0 
          }}></div>
          
          <h2 style={{ 
            margin: 0, 
            fontSize: '22px', 
            fontWeight: '700', 
            letterSpacing: '5px', 
            lineHeight: '1',
            textTransform: 'uppercase'
          }}>
            {titleText}
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {!selectedHistory ? (
            <button
              onClick={() => {
                if (typeof onClearHistory === 'function') onClearHistory();
              }}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid #00ff41',
                color: '#00ff41',
                fontWeight: '900',
                cursor: 'pointer',
                letterSpacing: '1.5px',
                transition: 'all 0.2s ease',
                fontSize: '11px',
                borderRadius: '2px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#00ff41';
                e.currentTarget.style.color = '#000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#00ff41';
              }}
            >
              CLEAR_HISTORY
            </button>
          ) : (
            <button
              onClick={() => setSelectedHistory(null)}
              style={{
                padding: '10px 18px',
                background: '#00ff41',
                border: '1px solid #00ff41',
                color: '#000',
                fontWeight: '900',
                cursor: 'pointer',
                letterSpacing: '1.5px',
                transition: 'all 0.2s ease',
                fontSize: '12px',
                borderRadius: '3px',
                boxShadow: '0 0 15px rgba(0, 255, 65, 0.4)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#00ff41';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#00ff41';
                e.currentTarget.style.color = '#000';
              }}
            >
              &lt;&lt; BACK TO ARCHIVE
            </button>
          )}
        </div>
      </div>

      {/* ── Screen Body ──────────────────────────────────────────────── */}
      <div className="history-content-wrapper" style={{ 
        flex: 1, 
        minHeight: 0, 
        overflow: 'hidden', 
        display: 'flex',
        flexDirection: 'column'
      }}>
        {!selectedHistory ? (
          /* ═══════════ VIEW 1: FULL ARCHIVE LIST ONLY ═══════════ */
          historyList.length === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: '15px',
              color: 'rgba(0,255,65,0.5)',
              fontSize: '16px',
              letterSpacing: '2px',
            }}>
              <div style={{ fontSize: '32px' }}>📡</div>
              <div>// NO_ATTACK_RECORDS_IN_ARCHIVE</div>
              <div style={{ fontSize: '12px', opacity: 0.6 }}>ATTACK LOGS AND DETECTIONS WILL BE RECORDED HERE</div>
            </div>
          ) : (
            <div className="history-grid custom-scroll" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
              gap: '20px',
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
                    background: 'rgba(0,15,0,0.85)',
                    padding: '22px 20px',
                    cursor: 'pointer',
                    transition: 'all 0.25s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '145px',
                    justifyContent: 'space-between',
                    borderRadius: '4px',
                    boxShadow: '0 0 10px rgba(0, 255, 65, 0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0,25,0,0.95)';
                    e.currentTarget.style.borderColor = '#00ff41';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 65, 0.35)';
                    e.currentTarget.style.transform = 'translateY(-3px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0,15,0,0.85)';
                    e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.3)';
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 65, 0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'rgba(0,255,65,0.7)', fontSize: '12px', fontWeight: '600' }}>
                      &gt; {item.date || item.timestamp}
                    </span> 
                    <span style={{ 
                      fontWeight: '900', 
                      color: (item.severityScore || parseFloat(item.threat) || 0) > 85 ? '#ff0040' : '#00d4ff', 
                      fontSize: '13px' 
                    }}>
                      {item.type}
                    </span> 
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '10px' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#888', marginBottom: '3px' }}>SOURCE IP:</div>
                      <span style={{ color: '#ffaa00', fontWeight: 'bold', fontSize: '15px', letterSpacing: '0.5px' }}>
                        {item.ip}
                      </span>
                    </div>
                    <span style={{ 
                      border: '1px solid #00ff41', 
                      padding: '3px 8px', 
                      fontSize: '11px', 
                      fontWeight: '700', 
                      color: '#00ff41',
                      background: 'rgba(0,255,65,0.08)',
                      borderRadius: '2px'
                    }}>
                      {item.status || 'MITIGATED'}
                    </span>
                  </div>

                  <div style={{ height: '5px', width: '100%', background: '#081a08', marginTop: '12px', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${(item.severityScore || parseFloat(item.threat) || 0)}%`, 
                      background: (item.severityScore || parseFloat(item.threat) || 0) > 85 ? '#ff0040' : '#ffaa00', 
                      boxShadow: (item.severityScore || parseFloat(item.threat) || 0) > 85 ? '0 0 8px #ff0040' : 'none' 
                    }}></div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* ═══════════ VIEW 2: ONLY SELECTED ATTACK (GLOBE + DETAILS) ═══════════ */
          <div className="split-layout" style={{ 
            display: 'grid', 
            gridTemplateColumns: '1.2fr 1fr', 
            gap: '25px', 
            height: '100%', 
            minHeight: 0 
          }}>
            {/* Left Column: 3D Globe of this attack only */}
            <div style={{ 
              border: '1px solid rgba(0,255,65,0.3)', 
              background: '#000', 
              position: 'relative', 
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: '4px',
            }}>
              <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
                <LiveMap 
                  key={selectedHistory.id || selectedHistory.ip} 
                  isAttacked={true} 
                  attackerCoords={selectedHistory.coords} 
                  attackerData={selectedHistory}
                  customWidth={750} 
                  customHeight={550} 
                />
              </div>
              <div style={{ 
                position: 'absolute', 
                top: '16px', 
                left: '16px', 
                fontSize: '12px', 
                background: 'rgba(0,10,0,0.9)', 
                padding: '8px 14px', 
                borderLeft: '3px solid #ffaa00',
                borderRadius: '2px',
                boxShadow: '0 0 10px rgba(0,0,0,0.8)'
              }}>
                TARGET LOCATION: <span style={{ color: '#00ff41', fontWeight: 'bold' }}>{(selectedHistory.loc || selectedHistory.city || 'Amman, Jordan').toUpperCase()}</span>
              </div>
            </div>

            {/* Right Column: Complete Forensic Detail of this attack */}
            <div style={{ 
              border: '1px solid rgba(0,255,65,0.4)', 
              display: 'flex', 
              flexDirection: 'column', 
              height: '100%', 
              minHeight: 0,
              background: 'rgba(0, 15, 0, 0.5)',
              borderRadius: '4px',
            }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }} className="custom-scroll">
                <h4 style={{ color: '#00ff41', margin: '0 0 16px 0', borderBottom: '1px solid rgba(0,255,65,0.3)', paddingBottom: '8px', letterSpacing: '1px' }}>
                  // THREAT_ACTOR_PROFILE
                </h4>
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
                      <tr key={i} style={{ borderBottom: '1px solid rgba(0,255,65,0.1)' }}>
                        <td style={{ padding: '10px 0', opacity: 0.6, fontSize: '11.5px', letterSpacing: '0.5px' }}>{label}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: color || '#fff', fontSize: '12.5px' }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Executed Commands */}
                {selectedHistory.commands_used && selectedHistory.commands_used.length > 0 && (
                  <>
                    <h4 style={{ color: '#ffaa00', margin: '24px 0 12px 0', borderBottom: '1px solid rgba(255,170,0,0.3)', paddingBottom: '8px', letterSpacing: '1px' }}>
                      // EXECUTED_COMMANDS ({selectedHistory.commands_used.length})
                    </h4>
                    <div style={{ background: 'rgba(255, 170, 0, 0.06)', padding: '12px', border: '1px solid rgba(255,170,0,0.25)', maxHeight: '160px', overflowY: 'auto', borderRadius: '3px' }} className="custom-scroll">
                      {selectedHistory.commands_used.map((cmd, i) => (
                        <div key={i} style={{ fontFamily: 'monospace', color: '#fff', fontSize: '11.5px', marginBottom: '6px', wordBreak: 'break-all' }}>
                          <span style={{ color: '#ffaa00', marginRight: '6px' }}>&gt;</span>{cmd}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Attack Statistics */}
                <h4 style={{ color: '#00ff41', margin: '24px 0 12px 0', borderBottom: '1px solid rgba(0,255,65,0.3)', paddingBottom: '8px', letterSpacing: '1px' }}>
                  // ATTACK_STATISTICS
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['CONNECTION_COUNT', selectedHistory.connectionCount ?? selectedHistory.connection_count ?? 0, '#ffaa00'],
                      ['SUCCESS_COUNT', selectedHistory.successCount ?? selectedHistory.success_count ?? 0, '#00ff41'],
                      ['FAILED_COUNT', selectedHistory.failedCount ?? selectedHistory.failed_count ?? 0, '#ff5555'],
                      ['UNIQUE_PASSWORDS', selectedHistory.uniquePasswords ?? selectedHistory.unique_passwords ?? 0, '#ffaa00'],
                      ['COMMAND_COUNT', selectedHistory.commandCount ?? selectedHistory.command_count ?? (selectedHistory.commands_used ? selectedHistory.commands_used.length : 0), '#ff6666'],
                      ['SUSPICIOUS_COMMANDS', selectedHistory.suspiciousCmds ?? selectedHistory.suspicious_commands ?? 0, '#ff0000']
                    ].map(([label, value, color], i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(0,255,65,0.1)' }}>
                        <td style={{ padding: '9px 0', opacity: 0.6, fontSize: '11.5px' }}>{label}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: color, fontSize: '12.5px' }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Event Timeline */}
                <h4 style={{ color: '#00ff41', margin: '24px 0 14px 0', borderBottom: '1px solid rgba(0,255,65,0.3)', paddingBottom: '8px', letterSpacing: '1px' }}>
                  // EVENT_TIMELINE
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                  {selectedHistory.eventTimeline && selectedHistory.eventTimeline.length > 0
                    ? selectedHistory.eventTimeline.map((evt, i) => {
                        const evtTime = typeof evt === 'string' ? '' : (evt.time || '');
                        const evtEvent = typeof evt === 'string' ? evt : (evt.event || String(evt));
                        const evtStatus = typeof evt === 'string' ? 'success' : (evt.status || 'success');
                        const dotColor = evtStatus === 'critical' ? '#ff0000' : evtStatus === 'warning' ? '#ffaa00' : '#00ff41';
                        return (
                          <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '14px' }}>
                              <div style={{
                                width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0,
                                background: dotColor,
                                border: '2px solid rgba(255,255,255,0.2)',
                                boxShadow: `0 0 8px ${dotColor}`,
                                marginTop: '2px',
                              }} />
                              {i < selectedHistory.eventTimeline.length - 1 && (
                                <div style={{ width: '2px', flex: 1, minHeight: '14px', background: 'rgba(0,255,65,0.2)', marginTop: '3px' }} />
                              )}
                            </div>
                            <div style={{ flex: 1, paddingBottom: '2px' }}>
                              {evtTime && (
                                <div style={{ fontSize: '9.5px', color: '#888', marginBottom: '2px', letterSpacing: '0.5px' }}>
                                  {evtTime}
                                </div>
                              )}
                              <div style={{
                                fontSize: '11.5px', fontWeight: '600',
                                color: dotColor,
                                letterSpacing: '0.3px',
                                wordBreak: 'break-word',
                              }}>
                                {evtEvent}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    : (
                      <div style={{ color: 'rgba(0,255,65,0.4)', fontSize: '11.5px', padding: '8px 0', letterSpacing: '1px' }}>
                        LOGGED_INCIDENT_STREAM_ACTIVE
                      </div>
                    )
                  }
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryModule;