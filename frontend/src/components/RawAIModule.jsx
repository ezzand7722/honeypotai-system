import React, { useState, useEffect } from 'react';

const RawAIModule = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        const res = await fetch(`${backendUrl}/report/raw-ai-output`, {
          headers: {
            'X-Shared-Secret': 'default-shared-secret',
          }
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const result = await res.json();
        setData(result);
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

  return (
    <div style={{ height: '100%', padding: '20px', color: '#00ffcc', backgroundColor: 'rgba(0, 10, 20, 0.9)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ borderBottom: '1px solid #00ffcc', paddingBottom: '10px', marginBottom: '20px', textShadow: '0 0 10px #00ffcc' }}>RAW AI OUTPUT</h2>
      {loading && !data && <p>Loading raw AI output...</p>}
      {error && <p style={{color: 'red'}}>Error: {error}</p>}
      {data && (
        <pre style={{ 
          fontFamily: 'monospace', 
          fontSize: '14px', 
          whiteSpace: 'pre-wrap', 
          wordBreak: 'break-all',
          backgroundColor: '#000',
          padding: '15px',
          borderRadius: '5px',
          border: '1px solid rgba(0, 255, 204, 0.3)',
          boxShadow: 'inset 0 0 10px rgba(0, 255, 204, 0.1)',
          flex: 1,
          overflowY: 'auto',
          margin: 0
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default RawAIModule;
