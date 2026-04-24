class CinematicSFX {
    constructor() {
        this.alarm = new Audio('https://actions.google.com/sounds/v1/alarms/mechanical_clock_ringing_loop.ogg');
        this.typeSound = new Audio('https://actions.google.com/sounds/v1/scifi/beep_scifi_short.ogg');
        this.alarm.loop = true;
    }

    announceAttack() {
        const msg = new SpeechSynthesisUtterance("Warning! Attack Detected on Dahua Camera");
        msg.lang = 'en-US'; msg.rate = 0.8; msg.pitch = 0.6;
        window.speechSynthesis.speak(msg);
    }

    playAlarm() {
        this.alarm.play().catch(() => {});
        this.announceAttack();
    }

    stopAll() {
        this.alarm.pause();
        window.speechSynthesis.cancel();
    }

    playType() {
        const s = this.typeSound.cloneNode();
        s.volume = 0.2; s.play();
    }
}
export const sfx = new CinematicSFX();
export const playAlarm = () => {
    const msg = new SpeechSynthesisUtterance("Warning! Attack Detected on Dahua Camera");
    msg.lang = 'en-US';
    msg.rate = 0.8;
    window.speechSynthesis.speak(msg);
};

export const stopAlarm = () => {
    window.speechSynthesis.cancel();
};