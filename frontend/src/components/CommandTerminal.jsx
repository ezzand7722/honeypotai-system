import React, { useState, useEffect, useRef } from 'react';

const CommandTerminal = ({ commands = [], attackType = 'Unknown', attackerIp = 'N/A', onClose }) => {
  const [visibleCount, setVisibleCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (visibleCount < commands.length) {
      const timer = setTimeout(() => {
        setVisibleCount(prev => prev + 1);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, commands.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleCount]);

  const handleCopyAll = () => {
    const allCommands = commands.map(c => c.command).join('\n');
    navigator.clipboard.writeText(allCommands).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0,
      width: '100vw', height: '100vh',
      background: 'rgba(0, 0, 0, 0.85)',
      zIndex: 200000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '"Courier New", Courier, monospace',
    }}>
      <style>{`
        @keyframes cmd-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes cmd-slide-in {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .cmd-line-enter {
          animation: cmd-slide-in 0.4s ease-out forwards;
        }
        .cmd-terminal-scroll::-webkit-scrollbar { width: 8px; }
        .cmd-terminal-scroll::-webkit-scrollbar-track { background: #0a0a0a; }
        .cmd-terminal-scroll::-webkit-scrollbar-thumb { background: #00ff41; border-radius: 4px; }
        .cmd-terminal-scroll::-webkit-scrollbar-thumb:hover { background: #33ff66; }
      `}</style>

      <div style={{
        width: '750px',
        maxWidth: '90vw',
        maxHeight: '85vh',
        background: '#0a0a0a',
        border: '1px solid #00ff41',
        boxShadow: '0 0 40px rgba(0, 255, 65, 0.15), inset 0 0 60px rgba(0, 255, 65, 0.03)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Terminal Title Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: '#111',
          borderBottom: '1px solid #00ff41',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f' }} />
            <span style={{ marginLeft: '12px', color: '#888', fontSize: '12px' }}>
              root@honeypot-ai:~# mitigation-terminal
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid #ff0000',
              color: '#ff0000',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: '0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#ff0000'; e.currentTarget.style.color = '#000'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#ff0000'; }}
          >
            ×
          </button>
        </div>

        {/* Terminal Header Info */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(0, 255, 65, 0.15)',
          background: 'rgba(0, 255, 65, 0.03)',
        }}>
          <div style={{ color: '#00ff41', fontSize: '11px', opacity: 0.6, marginBottom: '6px', letterSpacing: '2px' }}>
            // RECOMMENDED_MITIGATION_COMMANDS
          </div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: '#666', fontSize: '11px' }}>ATTACK_TYPE: </span>
              <span style={{ color: '#ff6b35', fontWeight: 'bold', fontSize: '13px' }}>{attackType || 'Unknown'}</span>
            </div>
            <div>
              <span style={{ color: '#666', fontSize: '11px' }}>TARGET_IP: </span>
              <span style={{ color: '#ff2d55', fontWeight: 'bold', fontSize: '13px' }}>{attackerIp || 'N/A'}</span>
            </div>
            <div>
              <span style={{ color: '#666', fontSize: '11px' }}>COMMANDS: </span>
              <span style={{ color: '#00ff41', fontWeight: 'bold', fontSize: '13px' }}>{commands.length}</span>
            </div>
          </div>
        </div>

        {/* Terminal Body */}
        <div
          ref={scrollRef}
          className="cmd-terminal-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            minHeight: '300px',
          }}
        >
          {commands.slice(0, visibleCount).map((cmd, idx) => (
            <div
              key={idx}
              className="cmd-line-enter"
              style={{
                marginBottom: '16px',
                paddingBottom: '12px',
                borderBottom: '1px solid rgba(0, 255, 65, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{
                  color: '#000',
                  background: '#00ff41',
                  padding: '1px 6px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  letterSpacing: '1px',
                }}>
                  STEP {cmd.step || idx + 1}
                </span>
                <span style={{ color: '#555', fontSize: '11px' }}>{cmd.description}</span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '6px',
              }}>
                <span style={{ color: '#00ff41', fontSize: '13px' }}>$</span>
                <code style={{
                  color: '#fff',
                  fontSize: '13px',
                  background: 'rgba(0, 255, 65, 0.06)',
                  padding: '6px 10px',
                  border: '1px solid rgba(0, 255, 65, 0.1)',
                  flex: 1,
                  wordBreak: 'break-all',
                }}>
                  {cmd.command}
                </code>
              </div>
            </div>
          ))}

          {/* Blinking cursor */}
          {visibleCount < commands.length && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#00ff41', fontSize: '13px' }}>$</span>
              <span style={{ color: '#00ff41', animation: 'cmd-blink 1s infinite', fontSize: '14px' }}>▊</span>
            </div>
          )}

          {visibleCount >= commands.length && commands.length > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '10px',
              border: '1px dashed rgba(0, 255, 65, 0.3)',
              color: '#00ff41',
              fontSize: '12px',
              textAlign: 'center',
              opacity: 0.7,
            }}>
              ✓ ALL {commands.length} COMMANDS READY FOR EXECUTION
            </div>
          )}

          {commands.length === 0 && (
            <div style={{ color: '#666', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
              No mitigation commands available for this attack type.
            </div>
          )}
        </div>

        {/* Terminal Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid rgba(0, 255, 65, 0.15)',
          background: '#0d0d0d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            onClick={handleCopyAll}
            disabled={commands.length === 0}
            style={{
              padding: '8px 18px',
              background: copied ? '#00ff41' : 'transparent',
              border: '1px solid #00ff41',
              color: copied ? '#000' : '#00ff41',
              cursor: commands.length > 0 ? 'pointer' : 'not-allowed',
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: 'bold',
              letterSpacing: '1px',
              transition: '0.3s',
              opacity: commands.length > 0 ? 1 : 0.4,
            }}
            onMouseEnter={(e) => { if (commands.length > 0 && !copied) { e.currentTarget.style.background = 'rgba(0, 255, 65, 0.1)'; } }}
            onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.background = 'transparent'; } }}
          >
            {copied ? '✓ COPIED TO CLIPBOARD' : '⧉ COPY ALL COMMANDS'}
          </button>

          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              background: 'transparent',
              border: '1px solid #666',
              color: '#888',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '12px',
              letterSpacing: '1px',
              transition: '0.3s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#fff'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#666'; e.currentTarget.style.color = '#888'; }}
          >
            CLOSE TERMINAL
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommandTerminal;
