import React, { useState } from 'react';
import './SettingsModal.css';
const SettingsModal = ({ isOpen, onClose, settings, setSettings }) => {
  const [activeTab, setActiveTab] = useState('PROTECTION');

  if (!isOpen) return null;

  const updateConfig = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: 'PROTECTION', label: 'PROTECTION_LAYERS' },
    { id: 'ENGINE', label: 'CORE_ENGINE_STATS' },
    { id: 'AUDIO', label: 'AUDIO_SYSTEM_FX' }
  ];

  return (
    <div className="settings-overlay">
      <div className="settings-container">
        
        {/* Header */}
        <div className="settings-header">
          <div className="header-title">
            <div className="title-accent"></div>
            <h2><span className="version">V4.2 |</span> CORE_SYSTEM_CONFIGURATION</h2>
          </div>
          <button className="close-x" onClick={onClose}>×</button>
        </div>

        <div className="settings-main">
          {/* Sidebar */}
          <div className="settings-sidebar">
            <div className="sidebar-label">// SYSTEM_MODULES</div>
            {tabs.map(tab => (
              <button 
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                [ {tab.label} ]
              </button>
            ))}
            
            <div className="sidebar-footer">
              <div className="status-row"><span>AUDIO_VOL:</span> <span>{Math.round(settings.alertVolume * 100)}%</span></div>
              <div className="status-row"><span>SEC_LVL:</span> <span>{settings.securityLevel}</span></div>
            </div>
          </div>

          {/* Content Area */}
          <div className="settings-content">
            <div className="content-heading">
              <h4>// KERNEL_PARAMETER_MANAGEMENT</h4>
              <div className="heading-line"></div>
            </div>

            {activeTab === 'PROTECTION' && (
              <div className="grid-layout">
                <div className="config-card">
                  <label>GLOBE_SHIELD_FX</label>
                  <p>Visual integrity barrier for global nodes.</p>
                  <button 
                    className={`toggle-action ${settings.shieldActive ? 'on' : ''}`}
                    onClick={() => updateConfig('shieldActive', !settings.shieldActive)}
                  >
                    {settings.shieldActive ? '>>>> SHIELD_ACTIVE' : '>>>> SHIELD_OFFLINE'}
                  </button>
                </div>

                <div className="config-card">
                  <label>AUTO_MITIGATION</label>
                  <p>AI-driven automated threat countermeasures.</p>
                  <button 
                    className={`toggle-action ${settings.autoMitigation ? 'on' : ''}`}
                    onClick={() => updateConfig('autoMitigation', !settings.autoMitigation)}
                  >
                    {settings.autoMitigation ? '>>>> ENABLED' : '>>>> DISABLED'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'ENGINE' && (
              <div className="grid-layout">
                <div className="config-card">
                  <label>UPDATE_SPEED</label>
                  <select 
                    value={settings.scanSpeed} 
                    onChange={(e) => updateConfig('scanSpeed', e.target.value)}
                  >
                    <option value="FAST">9.0 GHz (OVERCLOCK)</option>
                    <option value="NORMAL">4.2 GHz (STABLE)</option>
                  </select>
                </div>
                <div className="config-card">
                  <label>SECURITY_LVL</label>
                  <select 
                    value={settings.securityLevel} 
                    onChange={(e) => updateConfig('securityLevel', e.target.value)}
                  >
                    <option value="LEVEL_1">BASIC (L1)</option>
                    <option value="LEVEL_4">HARDENED (L4)</option>
                    <option value="OMEGA">LOCKDOWN (OMEGA)</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'AUDIO' && (
              <div className="config-card full-width">
                <label>MASTER_ALERT_VOLUME</label>
                <div className="range-container">
                  <span>MIN</span>
                  <input 
                    type="range" min="0" max="1" step="0.01" 
                    value={settings.alertVolume} 
                    onChange={(e) => updateConfig('alertVolume', parseFloat(e.target.value))}
                  />
                  <span className="vol-display">{Math.round(settings.alertVolume * 100)}%</span>
                </div>
                {/* Visualizer bars */}
                <div className="visualizer">
                  {[...Array(20)].map((_, i) => (
                    <div key={i} className="bar" style={{ 
                      height: `${Math.random() * 100}%`,
                      opacity: (i / 20) < settings.alertVolume ? 1 : 0.1 
                    }}></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer">
           <div className="online-dot"></div>
           SYSTEM_STATUS: OPERATIONAL // AUDIO_GAIN: {Math.round(settings.alertVolume * 100)}% // ENCRYPTION: {settings.encryptionType}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;