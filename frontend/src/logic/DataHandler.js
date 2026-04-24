import rawLogs from '../data/dahua_logs.json';

// أضفنا parameter جديد (isShieldActive) للتحكم في معالجة البيانات
export const processDahuaLogs = (isShieldActive = false) => {
    
    // إذا كان الشيلد مفعل، نرجع مصفوفة فارغة فوراً (منع معالجة أي هجوم)
    if (isShieldActive) {
        console.log("DATA_LAYER: Shield is active, blocking all log processing.");
        return []; 
    }

    // نأخذ فقط العمليات اللي فيها IP حقيقي أو أوامر (Commands)
    return rawLogs
        .filter(log => log.src_ip && log.eventid === "cowrie.command.input")
        .map(log => ({
            // تحويل الـ Local لـ IP خارجي للسينما (الحفاظ على منطقك الأصلي)
            ip: log.src_ip === "127.0.0.1" ? "185.234.21.11" : log.src_ip, 
            command: log.input,
            session: log.session,
            timestamp: log.timestamp,
            port: log.dst_port
        }));
};