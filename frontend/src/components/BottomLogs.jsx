import React from 'react';

export default function BottomLogs({ logs }) {
    return (
        <div className="bottom-logs">
            <div className="log-header">LIVE_STREAMS_BUFFER</div>
            <div className="log-content">
                {logs.length === 0 ? (
                    <div className="log-line">Waiting for connection...</div>
                ) : (
                    logs.map((log, index) => (
                        <div key={index} className="log-line green-text">
                            {`> ${log}`}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}