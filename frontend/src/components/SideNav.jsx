import React from 'react';

export default function SideNav({ onLaunch }) {
    const menuItems = ["NETWORK_MAP", "TRAFFIC_ANALYSIS", "DEVICE_LOGS", "SECURITY_AUDIT"];

    return (
        <div className="side-nav">
            <div className="nav-header">MAIN_MENU</div>
            {menuItems.map(item => (
                <div key={item} className="nav-item">{item}</div>
            ))}
            <button className="launch-btn" onClick={onLaunch}>
                INITIALIZE_SIMULATION
            </button>
            <div className="terminal-mini">
                Ready to intercept...
            </div>
        </div>
    );
}