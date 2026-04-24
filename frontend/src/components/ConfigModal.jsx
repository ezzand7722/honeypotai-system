import React from 'react';

const ConfigModal = ({ settings, setSettings, activeTab, setActiveTab }) => {
  
  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: 'PROTECTION', label: 'PROTECTION_CORE' },
    { id: 'NETWORK', label: 'NETWORK_INTERFACE' },
    { id: 'SYSTEM', label: 'SYSTEM_RESOURCES' }
  ];

  return (
    <div style={{ 
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
           SYSTEM_CONFIGURATION
         </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '40px', flex: 1, minHeight: 0 }}>
        
        {/* القائمة الجانبية */}
        <aside style={{ borderRight: '1px solid rgba(0, 255, 65, 0.2)', paddingRight: '20px' }}>
          <div style={{ fontSize: '12px', marginBottom: '15px', opacity: 0.5 }}>// SELECT_MODULE</div>
          {tabs.map(tab => (
            <div 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '18px 20px', marginBottom: '12px', cursor: 'pointer',
                border: activeTab === tab.id ? '2px solid #00ff41' : '1px solid transparent',
                background: activeTab === tab.id ? 'rgba(0, 255, 65, 0.15)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#00ff41',
                fontSize: '18px', fontWeight: '900', transition: '0.2s'
              }}
            >
              {activeTab === tab.id ? `> ${tab.label}` : tab.label}
            </div>
          ))}
        </aside>

        {/* محتوى الإعدادات */}
        <main style={{ overflowY: 'auto', paddingRight: '15px' }}>
          <div className="settings-grid-pro">
            {activeTab === 'PROTECTION' && (
              <>
                {/* إعادة كبسة الشيلد هنا */}
                <SettingRow 
                  label="SHIELD_ACTIVE" 
                  desc="PREVENT SYSTEM TESTS AND EXTERNAL ATTACKS" 
                  checked={settings.shieldActive} 
                  onChange={(v) => updateSetting('shieldActive', v)} 
                />
                <SettingRow label="AUTO_MITIGATION" desc="DEPLOY COUNTER-MEASURES ON THREAT" checked={settings.autoMitigation} onChange={(v) => updateSetting('autoMitigation', v)} />
                <SettingRow label="STEALTH_MODE" desc="ENCRYPT SYSTEM SIGNATURE" checked={settings.stealthMode} onChange={(v) => updateSetting('stealthMode', v)} />
              </>
            )}

            {activeTab === 'NETWORK' && (
              <>
                <SettingRow label="IP_SPOOFING" desc="BLOCK PACKET MANIPULATION" checked={settings.ipSpoofing || false} onChange={(v) => updateSetting('ipSpoofing', v)} />
                <SettingRow label="PORT_FLUX" desc="DYNAMIC LISTENER ROTATION" checked={settings.portFlux || false} onChange={(v) => updateSetting('portFlux', v)} />
              </>
            )}

            {activeTab === 'SYSTEM' && (
              <div style={{ background: 'rgba(0, 255, 65, 0.03)', padding: '30px', border: '1px solid rgba(0, 255, 65, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '20px', fontWeight: '900' }}>
                      <label>AUDIO_GAIN</label>
                      <span style={{ color: '#fff' }}>{(settings.alertVolume * 100).toFixed(0)}%</span>
                  </div>
                  
                  <input 
                    type="range" min="0" max="1" step="0.01" 
                    style={{ width: '100%', accentColor: '#00ff41', cursor: 'pointer', marginBottom: '25px' }}
                    value={settings.alertVolume} 
                    onChange={(e) => updateSetting('alertVolume', parseFloat(e.target.value))} 
                  />

                  <div style={{ 
                    display: 'flex', gap: '4px', alignItems: 'flex-end', height: '80px', 
                    width: '100%', background: 'rgba(0, 255, 65, 0.02)', padding: '10px', 
                    borderBottom: '1px solid rgba(0, 255, 65, 0.2)' 
                  }}>
                    {[...Array(40)].map((_, i) => (
                      <div 
                        key={i} 
                        style={{ 
                          flex: 1, 
                          height: `${settings.alertVolume > 0 ? (Math.random() * 100) * settings.alertVolume : 2}%`, 
                          background: (settings.alertVolume > 0.8 && i > 32) ? '#ff0000' : '#00ff41', 
                          opacity: settings.alertVolume > 0 ? 0.8 : 0.2, 
                          transition: 'height 0.15s ease' 
                        }} 
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: '10px', marginTop: '10px', opacity: 0.5 }}>// DYNAMIC_AUDIO_FLUX_ANALYSIS</div>
              </div>
            )}
          </div>
        </main>
      </div>

      <style>{`
        .settings-grid-pro { display: flex; flex-direction: column; gap: 20px; }
        .switch-pro { position: relative; display: inline-block; width: 60px; height: 30px; }
        .switch-pro input { opacity: 0; width: 0; height: 0; }
        .slider-pro { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; border: 2px solid #00ff41; transition: .4s; }
        .slider-pro:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: #00ff41; transition: .4s; }
        input:checked + .slider-pro { background-color: rgba(0, 255, 65, 0.2); }
        input:checked + .slider-pro:before { transform: translateX(30px); background-color: #fff; box-shadow: 0 0 10px #00ff41; }
      `}</style>
    </div>
  );
};

const SettingRow = ({ label, desc, checked, onChange }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0, 255, 65, 0.03)', padding: '25px', border: '1px solid rgba(0, 255, 65, 0.1)' }}>
    <div>
      <div style={{ color: '#fff', fontSize: '20px', fontWeight: '900', marginBottom: '5px' }}>{label}</div>
      <div style={{ fontSize: '13px', opacity: 0.6 }}>{desc}</div>
    </div>
    <label className="switch-pro">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="slider-pro"></span>
    </label>
  </div>
);

export default ConfigModal;