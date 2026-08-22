// Siren Audio & Female Voice SFX Engine
let sirenAudioInstance = null;

function getSirenAudio() {
  if (typeof window === 'undefined') return null;
  if (!sirenAudioInstance) {
    sirenAudioInstance = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
    sirenAudioInstance.loop = true;
  }
  return sirenAudioInstance;
}

/**
 * Speaks "Attention! Attack Detected." in a female voice, then spells the IP address.
 */
export function playFemaleVoiceAlert(ip = '') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const alertMsg = new SpeechSynthesisUtterance("Attention! Attack Detected.");
    alertMsg.pitch = 1.4;
    alertMsg.rate = 1.1;

    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => 
      v.name.includes('Female') || 
      v.name.includes('Zira') || 
      v.name.includes('Google US English') ||
      v.name.includes('Samantha') ||
      v.name.includes('Victoria')
    );
    if (femaleVoice) alertMsg.voice = femaleVoice;

    alertMsg.onend = () => {
      if (!ip || ip === 'UNKNOWN' || ip === 'MISSING') return;
      const ipSpelled = ip.split('').join(' ');
      const detailMsg = new SpeechSynthesisUtterance(`Source I P address. ${ipSpelled}. Initiating AI countermeasures.`);
      detailMsg.pitch = 1.1;
      if (femaleVoice) detailMsg.voice = femaleVoice;
      window.speechSynthesis.speak(detailMsg);
    };

    window.speechSynthesis.speak(alertMsg);
  } catch (e) {
    console.warn('[SFX] Speech error:', e);
  }
}

/**
 * Starts continuous siren audio loop and plays female voice alert.
 */
export function startContinuousAlarm(ip = '') {
  const siren = getSirenAudio();
  if (siren) {
    siren.loop = true;
    siren.play().catch(() => {});
  }
  playFemaleVoiceAlert(ip);
}

/**
 * Stops siren audio loop and cancels any ongoing speech synthesis.
 */
export function stopContinuousAlarm() {
  if (sirenAudioInstance) {
    sirenAudioInstance.pause();
    sirenAudioInstance.currentTime = 0;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function playAttackAlertSound(ip = '') {
  startContinuousAlarm(ip);
}

export function playDangerVoice(ip = '') {
  playFemaleVoiceAlert(ip);
}

export function playBeepBeep() {
  const siren = getSirenAudio();
  if (siren) {
    siren.play().catch(() => {});
  }
}

class CinematicSFX {
  constructor() {
    this.alarm = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
    this.typeSound = new Audio('https://actions.google.com/sounds/v1/scifi/beep_scifi_short.ogg');
    this.alarm.loop = true;
  }

  playAlarm() {
    startContinuousAlarm();
  }

  stopAll() {
    stopContinuousAlarm();
    this.alarm.pause();
    this.alarm.currentTime = 0;
  }

  playType() {
    const s = this.typeSound.cloneNode();
    s.volume = 0.2;
    s.play().catch(() => {});
  }
}

export const sfx = new CinematicSFX();
export const playAlarm = () => startContinuousAlarm();
export const stopAlarm = () => stopContinuousAlarm();