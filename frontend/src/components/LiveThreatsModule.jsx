import React, { useMemo } from 'react';

const LiveThreatsModule = ({ 
  isAttacked, 
  doubleAttackMode, 
  activeAttacks, 
  activeTestAttack, 
  onSelectAttack 
}) => {

  // تم استخدام useMemo لتوحيد المصفوفة ومنع التكرار اللحظي الذي يسبب تكرار الصوت 
  // دون حذف أي بيانات أو ميزات
  const allAttacks = useMemo(() => {
    const attacks = [];
    if (activeAttacks && activeAttacks.length > 0) {
      // نعتمد المصفوفة النشطة لأنها تحتوي بالفعل على كل المتجهات المطلوبة
      attacks.push(...activeAttacks);
    } else if (activeTestAttack) {
      // في حالة الهجوم المنفرد فقط نعتمد activeTestAttack
      attacks.push(activeTestAttack);
    }
    return attacks;
  }, [activeAttacks, activeTestAttack]);

  // دالة مساعدة لتحديد الهجوم النشط حالياً للعرض في لوحة التفاصيل
  // إذا كان هناك هجمات متعددة، عرض الأول
  const displayAttack = allAttacks.length > 0 ? allAttacks[0] : null;

  return (
    <div className="module-content" style={{ 
      padding: '40px', 
      color: '#00ff41', 
      fontFamily: 'monospace', 
      height: '100%', 
      boxSizing: 'border-box', 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      
      {/* هيدر الشاشة */}
      <div style={{ 
        borderBottom: '4px solid #00ff41', 
        marginBottom: '20px', 
        display: 'flex', 
        alignItems: 'center', 
        paddingBottom: '15px'
      }}>
         <div style={{ width: '6px', height: '35px', background: '#00ff41', marginRight: '20px', boxShadow: '0 0 12px #00ff41' }}></div>
         <h2 style={{ margin: 0, fontSize: '32px', fontWeight: '900', letterSpacing: '8px' }}>
            ACTIVE_THREAT_MONITOR
         </h2>
      </div>

      {/* التقسيم الشبكي */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '40px', flex: 1, minHeight: 0 }}>
        
        {/* القائمة الجانبية (الأهداف القابلة للضغط) */}
        <aside style={{ 
          borderRight: '1px solid rgba(0, 255, 65, 0.2)', 
          paddingRight: '20px',
          overflowY: 'auto', 
          height: '100%' 
        }}>
          <div style={{ fontSize: '12px', marginBottom: '15px', opacity: 0.5 }}>// SELECT_VECTOR_FOR_FULL_ACCESS</div>
          
          {!isAttacked || allAttacks.length === 0 ? (
            <div style={{ padding: '18px 20px', color: 'rgba(0, 255, 65, 0.3)', border: '1px dashed rgba(0, 255, 65, 0.2)', fontSize: '14px' }}>
              NO_ACTIVE_THREATS
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[...allAttacks].reverse().map((attack, idx) => (
                <button 
                  key={attack.id || idx}
                  onClick={() => onSelectAttack(attack)}
                  className="threat-item-btn"
                  style={{
                    padding: '24px 26px',
                    minHeight: '90px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                  }}
                >
                  <div style={{ fontSize: '18px', fontWeight: '900', marginBottom: '10px' }}>
                    {`> VIEW_VECTOR_${String(allAttacks.length - idx).padStart(2, '0')}`}
                  </div>
                  <span className="btn-sub" style={{ fontSize: '13px', color: '#ff6666', marginTop: '6px' }}>{attack.type}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* محتوى المعاينة السريعة */}
        <main style={{ overflowY: 'auto', paddingRight: '15px' }}>
          <div className="threat-details-grid">
            {!isAttacked || !displayAttack ? (
              <div style={{ marginTop: '100px', textAlign: 'center', opacity: 0.5 }}>
                <p style={{ fontSize: '24px', letterSpacing: '2px' }}>SYSTEM_STATUS: IDLE</p>
                <p style={{ fontSize: '12px' }}>WAITING_FOR_NETWORK_ANOMALY...</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* بطاقة البيانات السريعة */}
                <div style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                  background: 'rgba(255, 0, 0, 0.05)', padding: '25px', border: '1px solid rgba(255, 0, 0, 0.3)' 
                }}>
                  <div>
                    <div style={{ color: '#fff', fontSize: '20px', fontWeight: '900', marginBottom: '5px' }}>
                      SOURCE_IP: {displayAttack?.ip}
                    </div>
                    <div style={{ fontSize: '13px', opacity: 0.8, color: '#ff4d4d' }}>
                      LOCATION: {displayAttack?.loc || "HIDDEN_PROXY"} | THREAT_LEVEL: CRITICAL
                    </div>
                  </div>
                  <div className="blink-red" style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '900', fontSize: '18px' }}>● LIVE_INTERCEPT</div>
                    <div style={{ fontSize: '10px', opacity: 0.7 }}>PACKETS_FLOWING</div>
                  </div>
                </div>

                {/* قسم الـ Visualizer */}
                <div style={{ background: 'rgba(255, 0, 0, 0.03)', padding: '30px', border: '1px solid rgba(255, 0, 0, 0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '20px', fontWeight: '900' }}>
                        <label>PAYLOAD_INTENSITY</label>
                        <span style={{ color: '#fff' }}>{displayAttack?.livePayload || "0.0 MB/s"}</span>
                    </div>

                    <div className="visualizer-container">
                      {[...Array(40)].map((_, i) => (
                        <div 
                          key={i} 
                          className="vis-bar"
                          style={{ 
                            height: `${20 + Math.random() * 80}%`,
                            animationDelay: `${i * 0.05}s`
                          }} 
                        />
                      ))}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: '10px', opacity: 0.5, display: 'flex', justifyContent: 'space-between' }}>
                        <span>// BIT_STREAM_ANALYSIS</span>
                        <span>{new Date().toLocaleTimeString()}</span>
                    </div>
                </div>

                {/* زر وصول سريع إضافي */}
                <button 
                  onClick={() => onSelectAttack(displayAttack)}
                  style={{
                    background: '#ff0000',
                    color: '#fff',
                    border: 'none',
                    padding: '18px 24px',
                    minHeight: '55px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    letterSpacing: '2px',
                    fontSize: '16px',
                    boxShadow: '0 0 20px rgba(255,0,0,0.4)',
                    transition: 'all 0.3s ease',
                    borderRadius: '2px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ff3333';
                    e.currentTarget.style.boxShadow = '0 0 30px rgba(255,0,0,0.6)';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#ff0000';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(255,0,0,0.4)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  OVERRIDE & ACCESS FULL INTERFACE
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      <style>{`
        .blink-red { animation: blinker 1s linear infinite; color: #ff0000; }
        @keyframes blinker { 50% { opacity: 0.3; } }
        
        .threat-item-btn {
          width: 100%;
          padding: 24px 26px;
          margin-bottom: 14px;
          cursor: pointer;
          border: 2px solid #ff0000;
          background: rgba(255, 0, 0, 0.1);
          color: #fff;
          font-family: 'monospace';
          text-align: left;
          font-size: 18px;
          font-weight: 900;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          min-height: 90px;
          justify-content: center;
          border-radius: 2px;
        }

        .threat-item-btn:hover {
          background: rgba(255, 0, 0, 0.25);
          box-shadow: 0 0 25px rgba(255, 0, 0, 0.5);
          border-color: #ff6666;
          transform: translateX(4px);
        }

        .threat-item-btn:active {
          background: rgba(255, 0, 0, 0.35);
          box-shadow: inset 0 0 20px rgba(255, 0, 0, 0.3);
          transform: translateX(2px);
        }

        .btn-sub {
          font-size: 13px;
          opacity: 0.85;
          margin-top: 8px;
          font-weight: normal;
          color: #ff6666;
        }

        .visualizer-container {
          display: flex;
          gap: 4px;
          align-items: flex-end;
          height: 100px;
          width: 100%;
          background: rgba(255, 0, 0, 0.05);
          padding: 10px;
          border-bottom: 2px solid #ff0000;
          box-sizing: border-box;
        }

        .vis-bar {
          flex: 1;
          background: #ff0000;
          opacity: 0.8;
          animation: barGrow 0.5s ease-in-out infinite alternate;
        }

        @keyframes barGrow {
          from { filter: brightness(1); }
          to { filter: brightness(1.5); transform: scaleY(0.8); }
        }

        main::-webkit-scrollbar, aside::-webkit-scrollbar { width: 6px; }
        main::-webkit-scrollbar-track, aside::-webkit-scrollbar-track { background: rgba(0, 255, 65, 0.05); }
        main::-webkit-scrollbar-thumb, aside::-webkit-scrollbar-thumb { background: #00ff41; }
      `}</style>
    </div>
  );
};

export default LiveThreatsModule;