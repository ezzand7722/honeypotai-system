import React from 'react';

/**
 * AttackContextCard — displays a single AI v2 attack session with live status.
 */
const SEVERITY_CONFIG = {
  Extreme: { label: 'EXTREME', color: '#ff2d55', bg: 'rgba(255,45,85,0.12)', pulse: true },
  High:    { label: 'HIGH',    color: '#ff6b35', bg: 'rgba(255,107,53,0.10)', pulse: true },
  Medium:  { label: 'MEDIUM',  color: '#ffd60a', bg: 'rgba(255,214,10,0.08)', pulse: false },
  Mild:    { label: 'MILD',    color: '#30d158', bg: 'rgba(48,209,88,0.08)',  pulse: false },
  Low:     { label: 'LOW',     color: '#636366', bg: 'rgba(99,99,102,0.06)', pulse: false },
  Missing: { label: 'MISSING', color: '#636366', bg: 'rgba(99,99,102,0.06)', pulse: false },
};

const STATUS_CONFIG = {
  new:     { label: '● NEW',     color: '#30d158' },
  ongoing: { label: '◉ ONGOING', color: '#ffd60a' },
  ended:   { label: '✓ ENDED',   color: '#636366' },
};

export default function AttackContextCard({ ctx, style }) {
  const sev = SEVERITY_CONFIG[ctx.severity] || SEVERITY_CONFIG.Missing;
  const statusCfg = STATUS_CONFIG[ctx.attack_status] || STATUS_CONFIG.new;

  return (
    <div style={{
      background: sev.bg,
      border: `1px solid ${sev.color}40`,
      borderRadius: 12,
      padding: '14px 18px',
      marginBottom: 10,
      position: 'relative',
      transition: 'all 0.3s ease',
      ...style
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {sev.pulse && (
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: sev.color, display: 'inline-block',
              animation: 'pulse 1.2s infinite'
            }} />
          )}
          <span style={{ color: sev.color, fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
            {sev.label}
          </span>
        </div>
        <span style={{ color: statusCfg.color, fontSize: 11, fontWeight: 600 }}>
          {statusCfg.label}
        </span>
      </div>

      {/* IP + Type */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#e5e5ea', fontWeight: 700, fontSize: 15, fontFamily: 'monospace' }}>
          {ctx.src_ip}
        </span>
        <span style={{ color: '#8e8e93', fontSize: 12, marginLeft: 10 }}>
          {ctx.attack_type}
        </span>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[
          { label: 'Connections', value: ctx.connection_count },
          { label: 'Failed',      value: ctx.failed_count },
          { label: 'Success',     value: ctx.success_count },
          { label: 'Passwords',   value: ctx.unique_passwords },
          { label: 'Commands',    value: ctx.command_count },
          { label: 'Suspicious',  value: ctx.suspicious_cmds },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '4px 0' }}>
            <div style={{ color: '#8e8e93', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ color: '#e5e5ea', fontWeight: 700, fontSize: 14 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Duration & Signal */}
      {(ctx.duration_seconds > 0 || ctx.signal) && (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#636366' }}>
          <span>Duration: {ctx.duration_seconds.toFixed(1)}s</span>
          {ctx.signal === 'STOP_SENDING_LOGS' && (
            <span style={{ color: '#30d158' }}>✓ Session Closed</span>
          )}
        </div>
      )}
    </div>
  );
}
