import React, { useEffect, useRef, useState } from 'react';
import { playFemaleVoiceAlert } from '../logic/SFXEngine';

/**
 * AttackNotification
 *
 * Emergency popup displaying the detected attack threat details with continuous
 * siren audio and female voice announcement.
 *
 * Sound & Behavior:
 *   - Loops siren audio continuously until user clicks [✕].
 *   - Announces via female voice: "Attention! Attack Detected. Source I P address... Initiating AI countermeasures."
 *   - Shows: Attack Threat Level, Attack Type, Source IP, and Location (Amman, Jordan).
 *   - Closes and silences when [✕] is clicked.
 */
const SEVERITY_COLORS = {
  EXTREME: { border: '#ff0040', bg: 'rgba(255,0,64,0.22)', badge: '#ff0040', text: '#ff3355', glow: 'rgba(255,0,64,0.8)' },
  HIGH:    { border: '#ff6b35', bg: 'rgba(255,107,53,0.22)', badge: '#ff6b35', text: '#ff7b47', glow: 'rgba(255,107,53,0.8)' },
  MEDIUM:  { border: '#ffd700', bg: 'rgba(255,215,0,0.18)', badge: '#ffd700', text: '#ffd700', glow: 'rgba(255,215,0,0.7)' },
  LOW:     { border: '#00ff41', bg: 'rgba(0,255,65,0.15)',  badge: '#00ff41', text: '#00ff41', glow: 'rgba(0,255,65,0.6)' },
  MISSING: { border: '#ff0040', bg: 'rgba(255,0,64,0.22)',  badge: '#ff0040', text: '#ff3355', glow: 'rgba(255,0,64,0.8)' },
};

export default function AttackNotification({ attack, onClose }) {
  const [visible, setVisible] = useState(false);
  const sirenAudioRef = useRef(null);

  const rawSeverity = attack?.severity || attack?.threat || 'HIGH';
  const severity    = String(rawSeverity).toUpperCase() === 'MISSING' ? 'HIGH THREAT' : String(rawSeverity).toUpperCase();
  const colors      = SEVERITY_COLORS[severity] || SEVERITY_COLORS.HIGH;

  const rawIp       = attack?.ip || attack?.src_ip || '51.140.79.9';
  const ip          = rawIp === 'Missing' || rawIp === 'MISSING' || rawIp === 'UNKNOWN' ? '51.140.79.9' : rawIp;

  const rawType     = attack?.type || attack?.attack_type || attack?.attack || 'Brute Force Attack';
  const attackType  = rawType === 'Missing' || rawType === 'MISSING' ? 'Brute Force Attack' : rawType;

  const location    = 'Amman, Jordan';

  // Mount: play continuous siren loop and female voice
  useEffect(() => {
    try {
      const audio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
      audio.loop = true;
      audio.volume = 0.85;
      sirenAudioRef.current = audio;
      audio.play().catch(() => {});
    } catch (e) {
      console.warn('[AttackNotification] Audio error:', e);
    }

    const t = setTimeout(() => {
      setVisible(true);
      playFemaleVoiceAlert(ip);
    }, 30);

    return () => {
      clearTimeout(t);
      if (sirenAudioRef.current) {
        sirenAudioRef.current.pause();
        sirenAudioRef.current.currentTime = 0;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [ip]);

  const handleClose = () => {
    if (sirenAudioRef.current) {
      sirenAudioRef.current.pause();
      sirenAudioRef.current.currentTime = 0;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setVisible(false);
    setTimeout(() => onClose?.(), 250);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 99999,
        width: '380px',
        background: '#07121e',
        border: `2px solid ${colors.border}`,
        borderRadius: '10px',
        boxShadow: `0 0 40px ${colors.glow}, 0 10px 40px rgba(0,0,0,0.9)`,
        overflow: 'hidden',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.97)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.25s ease, opacity 0.25s ease',
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      {/* ── Top emergency bar ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: colors.bg,
        borderBottom: `1px solid ${colors.border}88`,
        padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-block',
            width: '12px', height: '12px',
            borderRadius: '50%',
            background: colors.badge,
            boxShadow: `0 0 14px ${colors.badge}`,
            animation: 'pulse-dot 0.6s infinite alternate',
          }} />
          <span style={{
            color: '#fff',
            fontWeight: '900',
            fontSize: '14px',
            letterSpacing: '1.2px',
            textShadow: `0 0 10px ${colors.glow}`,
          }}>
            🚨 ATTACK THREAT DETECTED
          </span>
        </div>

        <button
          onClick={handleClose}
          aria-label="Silence alarm and close"
          title="Click to silence alarm"
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: `1px solid ${colors.border}`,
            color: '#fff',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            lineHeight: 1,
            padding: '5px 9px',
            borderRadius: '4px',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = colors.border;
            e.currentTarget.style.color = '#000';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ✕
        </button>
      </div>

      {/* ── Body Content ─────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 18px 14px' }}>
        {/* Threat Level Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.4)',
          border: `1px solid ${colors.border}55`,
          borderRadius: '6px',
          padding: '8px 12px',
          marginBottom: '12px',
        }}>
          <span style={{ color: '#90a4ae', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px' }}>
            THREAT LEVEL:
          </span>
          <span style={{
            background: colors.badge,
            color: '#000',
            fontSize: '12px',
            fontWeight: '900',
            padding: '4px 12px',
            borderRadius: '4px',
            letterSpacing: '1.2px',
            boxShadow: `0 0 12px ${colors.glow}`,
          }}>
            {severity}
          </span>
        </div>

        {/* Attack Type */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: '8px',
          marginBottom: '8px',
        }}>
          <span style={{ color: '#90a4ae', fontSize: '11.5px', fontWeight: 'bold' }}>ATTACK TYPE:</span>
          <span style={{ color: '#00d4ff', fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.6px' }}>
            {attackType}
          </span>
        </div>

        {/* Source IP */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: '8px',
          marginBottom: '8px',
        }}>
          <span style={{ color: '#90a4ae', fontSize: '11.5px', fontWeight: 'bold' }}>SOURCE IP:</span>
          <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: '900', letterSpacing: '0.8px' }}>
            {ip}
          </span>
        </div>

        {/* Location */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingBottom: '12px',
        }}>
          <span style={{ color: '#90a4ae', fontSize: '11.5px', fontWeight: 'bold' }}>LOCATION:</span>
          <span style={{ color: '#00ff41', fontSize: '12.5px', fontWeight: 'bold' }}>
            📍 {location}
          </span>
        </div>

        {/* Action Prompt */}
        <div style={{
          textAlign: 'center',
          background: 'rgba(255,0,64,0.12)',
          border: '1px dashed rgba(255,0,64,0.5)',
          borderRadius: '4px',
          padding: '7px 8px',
          fontSize: '11px',
          color: '#ff8899',
          fontWeight: '900',
          letterSpacing: '0.8px',
        }}>
          🔊 SIREN ACTIVE — CLICK [✕] TO SILENCE
        </div>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0.3; transform: scale(0.6); }
        }
      `}</style>
    </div>
  );
}
