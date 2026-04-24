import React, { useState, useEffect } from 'react';
import { getCleanLogs } from '../logic/DataHandler';

// أضفنا shieldActive كـ prop للتحكم في حالة النظام
export default function BattleStation({ progress = 0, hideLogs = false, shieldActive }) {
    const [analyzingCmd, setAnalyzingCmd] = useState("");
    const [aiStatus, setAiStatus] = useState("SCANNING_INBOUND_PACKETS...");

    useEffect(() => {
        // إذا كان الشيلد مفعل، نتوقف عن تحديث البيانات (رفض الهجمات)
        if (shieldActive) {
            setAnalyzingCmd("SHIELD_ACTIVE: ALL_INBOUND_REJECTED");
            setAiStatus("SYSTEM_LOCKDOWN: SECURE");
            return; 
        }

        const logs = getCleanLogs();
        let i = 0;
        const interval = setInterval(() => {
            if (logs.length > 0) {
                setAnalyzingCmd(logs[i % logs.length].command);
                setAiStatus(i % 2 === 0 ? "DECRYPTING_PAYLOAD..." : "ISOLATING_MALWARE...");
                i++;
            }
        }, 1500);
        return () => clearInterval(interval);
    }, [shieldActive]); // أضفنا shieldActive هنا ليقوم الـ Effect بالتحديث فور تغيير الحالة

    return (
        <div className="battle-station-container">
            {/* الرادار سيتوقف عن العمل أو يختفي عند تفعيل الشيلد لإظهار حالة الرفض */}
            <div className={`radar-scanner ${shieldActive ? 'shield-locked' : ''}`}>
                <div className="sweep" style={{ display: shieldActive ? 'none' : 'block' }}></div>
                {!shieldActive && <div className="target-point" style={{ top: '30%', left: '40%' }}></div>}
                
                {/* إضافة مؤشر بصري داخل الرادار عند تفعيل الشيلد */}
                {shieldActive && (
                    <div className="shield-status-icon" style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        color: '#00ff41', fontSize: '10px', fontWeight: 'bold', textAlign: 'center'
                    }}>
                        AUTO_SHIELD: ON<br/>THREAT_REFUSED
                    </div>
                )}
            </div>

            {!hideLogs && (
                <div className="battle-overlay-info">
                    {/* تغيير العنوان عند تفعيل الشيلد */}
                    <h2 className="glitch" data-text={shieldActive ? "SYSTEM_REJECT_MODE" : "AI_DEFENSE_ACTIVE"}>
                        {shieldActive ? "SYSTEM_REJECT_MODE" : "AI_DEFENSE_ACTIVE"}
                    </h2>
                    
                    <div className="status-box">
                        <p className="cyan">STATUS: <span className={shieldActive ? "" : "blink"}>{aiStatus}</span></p>
                        {/* عند تفعيل الشيلد يظهر النص بلون أخضر بدلاً من الأحمر للدلالة على الأمان */}
                        <p className={shieldActive ? "cyan" : "red"}>
                            {shieldActive ? "SHIELD_INTERCEPT:" : "LATEST_CMD_REROUTED:"} <span>{analyzingCmd}</span>
                        </p>
                    </div>
                    
                    <div className="progress-bar-container">
                        {/* إذا كان الشيلد مفعل، البار يكون 100% تعبير عن الأمان الكامل */}
                        <div className="progress-fill" style={{ width: `${shieldActive ? 100 : (progress || 65)}%`, backgroundColor: shieldActive ? '#00ff41' : '' }}></div>
                        <span className="progress-text">{shieldActive ? "100% PROTECTED" : `${progress || 65}% NEUTRALIZED`}</span>
                    </div>
                </div>
            )}

            {hideLogs && (
                <div className="mini-stats">
                    <div className="stat-row">THREAT: {shieldActive ? "NONE (BLOCKED)" : "HIGH"}</div>
                    <div className="stat-row">INTEGRITY: 100%</div>
                </div>
            )}
        </div>
    );
}