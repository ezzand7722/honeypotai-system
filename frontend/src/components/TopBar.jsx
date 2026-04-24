import React, { useState, useEffect } from 'react';

export default function TopBar() {
    const [time, setTime] = useState(new Date().toLocaleTimeString());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="top-bar">
            <div className="system-title">DAHUA_NET_SENTINEL v3.0</div>
            <div className="status-indicator">SYSTEM_STATUS: <span className="online">ENCRYPTED</span></div>
            <div className="clock">{time}</div>
        </div>
    );
}