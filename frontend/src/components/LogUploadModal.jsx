import React, { useState, useRef, useCallback } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const SHARED_SECRET = import.meta.env.VITE_SHARED_SECRET || 'default-shared-secret';

const LogUploadModal = ({ onClose, onUploadComplete }) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle | uploading | success | error
  const [resultData, setResultData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [chunkSize, setChunkSize] = useState(25);
  const [maxRecords, setMaxRecords] = useState('');
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) validateAndSetFile(file);
  };

  const validateAndSetFile = (file) => {
    const validTypes = ['.json', '.jsonl', '.log', '.txt'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validTypes.includes(ext)) {
      setErrorMsg(`UNSUPPORTED FILE TYPE: ${ext}. Accepted: .json .jsonl .log .txt`);
      setSelectedFile(null);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setErrorMsg('FILE TOO LARGE: Maximum 50MB');
      setSelectedFile(null);
      return;
    }
    setErrorMsg('');
    setSelectedFile(file);
    setUploadStatus('idle');
    setResultData(null);
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploadStatus('uploading');
    setErrorMsg('');
    setResultData(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('chunk_size', String(chunkSize));
      if (maxRecords && parseInt(maxRecords) > 0) {
        formData.append('max_records', String(parseInt(maxRecords)));
      }

      const res = await fetch(`${BACKEND_URL}/honeypot/events/from-file`, {
        method: 'POST',
        headers: { 'X-Shared-Secret': SHARED_SECRET },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      setUploadStatus('success');
      setResultData(data);
      if (typeof onUploadComplete === 'function') onUploadComplete(data);
    } catch (err) {
      setUploadStatus('error');
      setErrorMsg(`UPLOAD_FAILED: ${err.message}`);
    }
  }, [selectedFile, chunkSize, maxRecords, onUploadComplete]);

  const reset = () => {
    setSelectedFile(null);
    setUploadStatus('idle');
    setResultData(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200000,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: '680px', maxWidth: '95vw',
        background: '#020b02',
        border: '2px solid #00ff41',
        boxShadow: '0 0 60px rgba(0,255,65,0.25)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '90vh', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          borderBottom: '2px solid #00ff41',
          padding: '20px 30px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ width: '5px', height: '30px', background: '#00ff41', boxShadow: '0 0 10px #00ff41' }} />
            <div>
              <div style={{ color: '#00ff41', fontSize: '18px', fontWeight: '900', letterSpacing: '4px' }}>
                LOG_FILE_INGEST
              </div>
              <div style={{ color: 'rgba(0,255,65,0.5)', fontSize: '10px', letterSpacing: '2px', marginTop: '2px' }}>
                &gt; UPLOAD HONEYPOT LOG FOR AI ANALYSIS
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid rgba(0,255,65,0.4)',
              color: '#00ff41', width: '36px', height: '36px',
              cursor: 'pointer', fontSize: '18px', fontWeight: 'bold',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: '0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#00ff41'; e.currentTarget.style.color = '#000'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#00ff41'; }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '25px 30px', overflowY: 'auto', flex: 1 }}>

          {/* Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragOver ? '#00ff41' : selectedFile ? 'rgba(0,255,65,0.6)' : 'rgba(0,255,65,0.3)'}`,
              borderRadius: '2px',
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: dragOver ? 'rgba(0,255,65,0.05)' : selectedFile ? 'rgba(0,255,65,0.02)' : 'transparent',
              marginBottom: '20px',
              boxShadow: dragOver ? '0 0 20px rgba(0,255,65,0.15)' : 'none',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.jsonl,.log,.txt"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
            {!selectedFile ? (
              <>
                <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.6 }}>📁</div>
                <div style={{ color: '#00ff41', fontSize: '14px', fontWeight: '700', letterSpacing: '2px', marginBottom: '8px' }}>
                  DROP_FILE_HERE or CLICK_TO_BROWSE
                </div>
                <div style={{ color: 'rgba(0,255,65,0.4)', fontSize: '11px', letterSpacing: '1px' }}>
                  Supported: .json .jsonl .log .txt — Max 50MB
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>✅</div>
                <div style={{ color: '#00ff41', fontSize: '15px', fontWeight: '900', letterSpacing: '1px', marginBottom: '4px' }}>
                  {selectedFile.name}
                </div>
                <div style={{ color: 'rgba(0,255,65,0.6)', fontSize: '11px' }}>
                  SIZE: {formatBytes(selectedFile.size)} · TYPE: {selectedFile.type || 'application/octet-stream'}
                </div>
                <div style={{ color: 'rgba(0,255,65,0.4)', fontSize: '10px', marginTop: '8px' }}>
                  Click to choose a different file
                </div>
              </>
            )}
          </div>

          {/* Options */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div>
              <div style={{ color: 'rgba(0,255,65,0.6)', fontSize: '10px', letterSpacing: '2px', marginBottom: '6px' }}>
                CHUNK_SIZE (records per batch)
              </div>
              <input
                type="number"
                min="1" max="500"
                value={chunkSize}
                onChange={e => setChunkSize(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                style={{
                  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                  background: 'rgba(0,255,65,0.05)',
                  border: '1px solid rgba(0,255,65,0.3)',
                  color: '#00ff41', fontFamily: 'monospace', fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <div style={{ color: 'rgba(0,255,65,0.6)', fontSize: '10px', letterSpacing: '2px', marginBottom: '6px' }}>
                MAX_RECORDS (leave blank for all)
              </div>
              <input
                type="number"
                min="1"
                placeholder="ALL"
                value={maxRecords}
                onChange={e => setMaxRecords(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                  background: 'rgba(0,255,65,0.05)',
                  border: '1px solid rgba(0,255,65,0.3)',
                  color: '#00ff41', fontFamily: 'monospace', fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Error */}
          {errorMsg && (
            <div style={{
              background: 'rgba(255,0,0,0.08)',
              border: '1px solid rgba(255,0,0,0.4)',
              padding: '12px 16px', marginBottom: '16px',
              color: '#ff4444', fontSize: '12px', letterSpacing: '0.5px',
            }}>
              ⚠ {errorMsg}
            </div>
          )}

          {/* Success Result */}
          {uploadStatus === 'success' && resultData && (
            <div style={{
              background: 'rgba(0,255,65,0.06)',
              border: '1px solid rgba(0,255,65,0.4)',
              padding: '16px 20px', marginBottom: '16px',
            }}>
              <div style={{ color: '#00ff41', fontSize: '12px', fontWeight: '900', letterSpacing: '3px', marginBottom: '12px' }}>
                ✓ FILE_ACCEPTED — AI PROCESSING QUEUED
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                {[
                  ['PIPELINE_ID', resultData.pipeline_id?.substring(0, 16) + '...'],
                  ['STATUS', resultData.status?.toUpperCase()],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,255,65,0.1)', paddingBottom: '4px' }}>
                    <span style={{ opacity: 0.5 }}>{k}:</span>
                    <span style={{ color: '#fff', fontWeight: 'bold' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ color: 'rgba(0,255,65,0.5)', fontSize: '10px', marginTop: '10px', letterSpacing: '1px' }}>
                Results will appear in the dashboard as the AI processes each log entry.
              </div>
            </div>
          )}

          {/* Uploading indicator */}
          {uploadStatus === 'uploading' && (
            <div style={{
              border: '1px solid rgba(0,255,65,0.3)',
              padding: '16px 20px', marginBottom: '16px', textAlign: 'center',
              color: '#00ff41', fontSize: '13px', letterSpacing: '2px',
            }}>
              <span style={{ animation: 'uploadBlink 0.6s infinite' }}>◉</span>
              {' '}TRANSMITTING_FILE_TO_BACKEND...
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid rgba(0,255,65,0.3)',
          padding: '18px 30px',
          display: 'flex', gap: '12px', justifyContent: 'flex-end',
          flexShrink: 0,
        }}>
          {uploadStatus !== 'idle' && uploadStatus !== 'uploading' && (
            <button
              onClick={reset}
              style={{
                padding: '12px 24px',
                background: 'transparent', border: '1px solid rgba(0,255,65,0.4)',
                color: 'rgba(0,255,65,0.7)', fontFamily: 'monospace',
                cursor: 'pointer', letterSpacing: '2px', fontSize: '12px', fontWeight: '700',
                transition: '0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#00ff41'; e.currentTarget.style.color = '#00ff41'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,255,65,0.4)'; e.currentTarget.style.color = 'rgba(0,255,65,0.7)'; }}
            >RESET</button>
          )}
          <button
            onClick={uploadStatus === 'success' ? onClose : handleUpload}
            disabled={!selectedFile || uploadStatus === 'uploading'}
            style={{
              padding: '12px 30px',
              background: (!selectedFile || uploadStatus === 'uploading') ? 'rgba(0,255,65,0.15)' : '#00ff41',
              border: '1px solid #00ff41',
              color: (!selectedFile || uploadStatus === 'uploading') ? 'rgba(0,255,65,0.5)' : '#000',
              fontFamily: 'monospace', fontWeight: '900',
              cursor: (!selectedFile || uploadStatus === 'uploading') ? 'not-allowed' : 'pointer',
              letterSpacing: '2px', fontSize: '13px', transition: '0.2s',
            }}
          >
            {uploadStatus === 'uploading' ? 'UPLOADING...' : uploadStatus === 'success' ? 'CLOSE' : 'EXECUTE_UPLOAD'}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes uploadBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
      `}</style>
    </div>
  );
};

export default LogUploadModal;
