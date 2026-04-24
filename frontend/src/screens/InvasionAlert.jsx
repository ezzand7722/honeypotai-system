import React from 'react';

export default function InvasionAlert({ attack }) {
    return (
        <div className="invasion-overlay">
            <div className="alert-box">
                <div className="glitch-text" data-text="WARNING: INTRUSION DETECTED">
                    WARNING: INTRUSION DETECTED
                </div>
                <div className="attack-details">
                    <p>ORIGIN_IP: {attack?.ip}</p>
                    <p>ACCESS_METHOD: {attack?.port === 2222 ? 'SSH_BRUTE_FORCE' : 'TELNET_EXPLOIT'}</p>
                    <p>COMMAND_EXEC: {attack?.command}</p>
                </div>
                <div className="loading-bar"><div className="progress"></div></div>
            </div>
        </div>
    );
}