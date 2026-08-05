import React, { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

const RawAIModule = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/report/raw-ai-output`, {
          headers: { 'X-Shared-Secret': 'default-shared-secret' }
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const result = await res.json();
        setData(result);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const renderValue = (value) => {
    if (value === null || value === undefined) return <span style={{ opacity: 0.4 }}>—</span>;
    if (typeof value === 'boolean') return <span style={{ color: value ? '#00ff41' : '#ff5555' }}>{String(value)}</span>;
    if (typeof value === 'number') return <span style={{ color: '#ffaa00' }}>{value}</span>;
    if (typeof value === 'string') return <span style={{ color: '#fff' }}>{value}</span>;
    if (Array.isArray(value)) {
      if (value.length === 0) return <span style={{ opacity: 0.4 }}>[ ]</span>;
      return (
        <div style={{ paddingLeft: '16px', borderLeft: '2px solid rgba(0,255,65,0.2)', marginTop: '4px' }}>
          {value.map((item, i) => (
            <div key={i} style={{ marginBottom: '6px' }}>
              {typeof item === 'object' && item !== null ? renderObject(item) : renderValue(item)}
            </div>
          ))}
        </div>
      );
    }
    if (typeof value === 'object') return renderObject(value);
    return <span>{String(value)}</span>;
  };

  const renderObject = (obj) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <tbody>
        {Object.entries(obj).map(([key, val]) => (
          <tr key={key} style={{ borderBottom: '1px solid rgba(0,255,65,0.08)' }}>
            <td style={{ padding: '7px 12px 7px 0', width: '35%', verticalAlign: 'top', color: 'rgba(0,255,65,0.55)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', wordBreak: 'break-word' }}>
              {key.replace(/_/g, ' ')}
            </td>
            <td style={{ padding: '7px 0', verticalAlign: 'top', fontSize: '13px', wordBreak: 'break-word' }}>
              {renderValue(val)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderContent = () => {
    if (loading && !data) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(0,255,65,0.6)', marginTop: '40px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00ff41', animation: 'pulse 1s infinite' }} />
          Waiting for AI analysis output...
        </div>
      );
    }
    if (error) {
      return <p style={{ color: '#ff5555', marginTop: '20px' }}>Error: {error}</p>;
    }
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return (
        <div style={{ color: 'rgba(0,255,65,0.4)', marginTop: '40px', lineHeight: '1.8' }}>
          No AI output available yet. Run an attack simulation or upload a log file to generate analysis.
        </div>
      );
    }

    const entries = Array.isArray(data) ? data : [data];
    return entries.map((entry, idx) => (
      <div key={idx} style={{
        background: 'rgba(0,20,0,0.5)',
        border: '1px solid rgba(0,255,65,0.2)',
        borderRadius: '4px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        {entries.length > 1 && (
          <div style={{ fontSize: '11px', color: 'rgba(0,255,65,0.5)', marginBottom: '12px', letterSpacing: '2px' }}>
            RECORD {idx + 1} / {entries.length}
          </div>
        )}
        {typeof entry === 'object' && entry !== null ? renderObject(entry) : renderValue(entry)}
      </div>
    ));
  };

  return (
    <div style={{
      height: '100%',
      padding: '40px',
      color: '#00ff41',
      backgroundColor: '#020b02',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'monospace',
      boxSizing: 'border-box'
    }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.8); } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #00ff41; border-radius: 3px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
      `}</style>

      <div style={{ borderBottom: '4px solid #00ff41', marginBottom: '24px', paddingBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '6px', height: '35px', background: '#00ff41', boxShadow: '0 0 12px #00ff41' }} />
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700', letterSpacing: '6px' }}>AI ANALYSIS OUTPUT</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(0,255,65,0.6)' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: error ? '#ff5555' : '#00ff41', boxShadow: error ? '0 0 8px #ff5555' : '0 0 8px #00ff41', animation: 'pulse 2s infinite' }} />
          {error ? 'OFFLINE' : 'LIVE · UPDATES EVERY 5s'}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {renderContent()}
      </div>
    </div>
  );
};

export default RawAIModule;
