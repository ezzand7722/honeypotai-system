import React from 'react';

export default function FinalReport({ attack, reset }) {
    return (
        <div className="report-backdrop">
            <div className="report-container">
                <div className="left-panel">
                    <h2>SYSTEM_DEFENSE</h2>
                    <div className="shield-graphic">100% SECURE</div>
                    <p>All malicious packets from {attack?.ip} have been neutralized.</p>
                </div>
                <div className="right-panel">
                    <h2>DAHUA_FORENSICS</h2>
                    <div className="data-item"><span>DEVICE:</span> Dahua IPC-Network</div>
                    <div className="data-item"><span>ATTACKER:</span> {attack?.ip}</div>
                    <div className="data-item"><span>INJECTED:</span> <mark>{attack?.command}</mark></div>
                    <div className="data-item"><span>PROTOCOL:</span> {attack?.port === 2222 ? 'SSH' : 'Telnet'}</div>
                    <button onClick={reset} className="close-btn">BACK TO MONITOR</button>
                </div>
            </div>
        </div>
    );
}