import React from 'react';

const Header = ({ settings, isAttacked, time, liveLog }) => {
  return (
    <header className="header-pro-container" style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center',
      padding: '10px 40px', background: 'rgba(0,0,0,0.95)', 
      borderBottom: `1px solid ${isAttacked ? '#ff0000' : '#00ff41'}4D`,
      position: 'fixed', top: 0, left: 0, right: 0, height: '90px', zIndex: 10000,
      pointerEvents: 'all'
    }}>
      <div className="h-left" style={{ textAlign: 'left' }}>
        <div style={{fontSize: '10px', color: '#00ff41', opacity: 0.6, letterSpacing: '1px'}}>PROTOCOL: {settings.encryptionType}</div>
        <div style={{
          fontSize: '14px', fontWeight: 'bold', marginTop: '5px', 
          color: isAttacked ? '#ff0000' : '#00ff41',
          textShadow: isAttacked ? '0 0 10px #ff0000' : 'none'
        }}>
          {isAttacked ? "!! SYSTEM_BREACH_ACTIVE" : `// ${settings.securityLevel}_STABLE`}
        </div>
      </div>

      <div className="h-center" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{border: '1px solid #00ff41', padding: '1px 8px', marginBottom: '5px'}}>
          <span style={{fontSize: '9px', color: '#00ff41', letterSpacing: '2px'}}>INTERNAL_ACCESS_ONLY</span>
        </div>
        <h1 className="glitch" data-text="IOT-HONEYPOT-AI" style={{ 
          fontSize: '32px', color: '#00ff41', margin: 0, letterSpacing: '6px', fontFamily: 'Orbitron, sans-serif' 
        }}>IOT-HONEYPOT-AI</h1>
        <div style={{width: '180px', height: '2px', background: 'linear-gradient(90deg, transparent, #00ff41, transparent)', marginTop: '8px'}}></div>
        {isAttacked && <div className="live-console-msg" style={{fontSize: '10px', color: '#ff0000', marginTop: '5px'}}>{liveLog}</div>}
      </div>

      <div className="h-right" style={{ textAlign: 'right', display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', gap: '20px', alignItems: 'center' }}>
        <div style={{fontSize: '11px', color: '#00ff41', opacity: 0.8, fontFamily: 'monospace', lineHeight: '1.4'}}>
          <div>CIPHER: <span style={{color: '#fff'}}>{settings.encryptionType.split('_')[0]}</span></div>
          <div>AUTO_MITIGATION: <span style={{color: settings.autoMitigation ? '#00ff41' : '#ff4444'}}>{settings.autoMitigation ? 'ON' : 'OFF'}</span></div>
        </div>
        <div style={{fontFamily: 'Orbitron, monospace'}}>
          <div style={{fontSize: '26px', color: '#00ff41', fontWeight: 'bold'}}>{time.toLocaleTimeString([], { hour12: false })}</div>
          <div style={{fontSize: '12px', color: '#00ff41', opacity: 0.6, marginTop: '-5px'}}>:{time.getMilliseconds().toString().padStart(3, '0')} MS</div>
        </div>
      </div>
    </header>
  );
};

export default Header;