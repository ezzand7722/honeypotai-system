import React from 'react';

export default function StatsOverlay() {
    return (
        <div className="stats-overlay">
            <div className="stat-box">
                <label>ACTIVE_SESSIONS</label>
                <div className="value">12</div>
            </div>
            <div className="stat-box">
                <label>THREAT_LEVEL</label>
                <div className="value warning">LOW</div>
            </div>
            <div className="stat-box">
                <label>ENCRYPTION</label>
                <div className="value">AES-256</div>
            </div>
        </div>
    );
}