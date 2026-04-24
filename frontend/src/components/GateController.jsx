import React, { useState, useEffect, useRef } from 'react';

const GateController = ({ onUnlock }) => {
  const [stage, setStage] = useState('sealed'); // sealed, opening, breach, finished
  const canvasRef = useRef(null);
  const audioContext = useRef(null);

  // نظام الصوت الميكانيكي للبوابة (بدون تغيير)
  const playMechanicalGateSound = async () => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioContext.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const now = ctx.currentTime;
    const duration = 2.8; 

    const motor = ctx.createOscillator();
    const motorGain = ctx.createGain();
    motor.type = 'sine';
    motor.frequency.setValueAtTime(55, now);
    motor.frequency.linearRampToValueAtTime(45, now + duration);
    
    motorGain.gain.setValueAtTime(0, now);
    motorGain.gain.linearRampToValueAtTime(0.25, now + 0.5);
    motorGain.gain.linearRampToValueAtTime(0, now + duration);

    motor.connect(motorGain);
    motorGain.connect(ctx.destination);

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const friction = ctx.createBufferSource();
    friction.buffer = buffer;
    
    const lowPass = ctx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.setValueAtTime(400, now);
    lowPass.frequency.exponentialRampToValueAtTime(100, now + duration);

    const frictionGain = ctx.createGain();
    frictionGain.gain.setValueAtTime(0, now);
    frictionGain.gain.linearRampToValueAtTime(0.08, now + 0.4);
    frictionGain.gain.linearRampToValueAtTime(0, now + duration);

    friction.connect(lowPass);
    lowPass.connect(frictionGain);
    frictionGain.connect(ctx.destination);

    motor.start();
    friction.start();
    motor.stop(now + duration);
    friction.stop(now + duration);
  };

  const handleOpen = async () => {
    await playMechanicalGateSound();
    setStage('opening'); 

    setTimeout(() => {
      setStage('breach');
      setTimeout(() => {
        setStage('finished'); 
        onUnlock(); 
      }, 2500); 
    }, 1200);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stage === 'finished') return; 
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let points = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < 110; i++) {
      points.push({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35
      });
    }

    const draw = (time) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      points.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        for (let j = i + 1; j < points.length; j++) {
          const p2 = points[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 180) {
            ctx.strokeStyle = `rgba(0, 255, 65, ${(1 - dist / 180) * 0.35})`;
            ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          }
        }
      });

      const drawRing = (radius, speed, dash, opacity, width = 2) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(time * speed);
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.setLineDash(dash);
        ctx.strokeStyle = `rgba(0, 255, 65, ${opacity})`;
        ctx.lineWidth = width; ctx.stroke(); ctx.restore();
      };

      if (stage === 'sealed') {
        drawRing(110, 0.0006, [15, 10], 0.4, 2);
        drawRing(125, -0.0004, [5, 20], 0.2, 1.5);
      } else {
        drawRing(210, 0.0006, [20, 15], 0.3);
        drawRing(250, 0.0002, [], 0.1, 0.5);
      }
      animationFrameId = requestAnimationFrame(draw);
    };

    draw(0);
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, [stage]);

  if (stage === 'finished') return null;

  return (
    <div className={`gate-container stage-${stage}`}>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet" />
      
      <canvas ref={canvasRef} className="gate-canvas" style={{ pointerEvents: 'none', position: 'absolute', inset: 0, zIndex: 1 }} />
      
      {stage === 'sealed' && (
        <div className="sealed-core-wrapper" style={{ zIndex: 10 }}>
          <div className="core-scanner-line"></div>
          <button className="init-core-btn-v3" onClick={handleOpen}>
            <div className="inner-glow"></div>
            <div className="btn-decals top">CORE://SECURE</div>
            <span className="label">ESTABLISH_BREACH</span>
            <div className="pulse-ring-v3"></div>
          </button>
        </div>
      )}

      {(stage === 'opening' || stage === 'breach') && (
        <div className={`imperial-portal-complex ${stage}`} style={{ zIndex: 5 }}>
          
          <div className="bracket-wrapper left">
            <div className="hyper-tech-bracket">
              <div className="frame-border"></div>
              <div className="inner-plate"></div>
              <div className="energy-filament"></div>
              <div className="tech-nodes">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>

          <div className={`portal-content-center ${stage}`}>
            <h1 className="imperial-name-title-final">IOT-HONEYPOT-AI</h1>
            <div className="status-message">INITIALIZING_SECURE_INTERFACE...</div>
            <div className="progress-segments">
                {[...Array(10)].map((_, i) => <div key={i} className="progress-seg-item"></div>)}
            </div>
          </div>

          <div className="bracket-wrapper right">
            <div className="hyper-tech-bracket">
              <div className="frame-border"></div>
              <div className="inner-plate"></div>
              <div className="energy-filament"></div>
              <div className="tech-nodes">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>

        </div>
      )}

      <style>{`
        .gate-container { 
          position: fixed; inset: 0; background: #000; 
          display: flex; justify-content: center; align-items: center; 
          overflow: hidden; z-index: 999999; font-family: 'Orbitron', sans-serif; 
          pointer-events: auto;
        }

        .sealed-core-wrapper { position: relative; display: flex; justify-content: center; align-items: center; }
        .init-core-btn-v3 { position: relative; width: 240px; height: 240px; background: rgba(0, 20, 10, 0.9); border: 2px solid #00ff41; border-radius: 50%; color: #00ff41; cursor: pointer; font-family: 'Orbitron'; font-size: 0.8rem; letter-spacing: 2px; font-weight: 900; z-index: 20; box-shadow: 0 0 30px rgba(0, 255, 65, 0.4); transition: 0.3s; }
        
        .imperial-portal-complex { position: relative; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; }
        .bracket-wrapper { position: absolute; top: 50%; transform: translateY(-50%); transition: all 1.2s cubic-bezier(0.15, 0.85, 0.35, 1); }
        
        .stage-opening .bracket-wrapper.left { left: 38%; }
        .stage-opening .bracket-wrapper.right { right: 38%; }
        .stage-breach .bracket-wrapper.left { left: 5%; }
        .stage-breach .bracket-wrapper.right { right: 5%; }

        /* --- تصميم القوس المتطور (Cyber-Hardware) --- */
        .hyper-tech-bracket {
          width: 85px;
          height: 520px;
          position: relative;
        }

        /* الإطار الخارجي المتوهج */
        .frame-border {
          position: absolute; inset: 0;
          border: 2px solid #00ff41;
          background: rgba(0, 255, 65, 0.03);
          box-shadow: 0 0 25px rgba(0, 255, 65, 0.2);
          clip-path: polygon(0 15%, 45% 0, 100% 0, 100% 100%, 45% 100%, 0 85%, 0 62%, 20% 58%, 20% 42%, 0 38%);
        }

        /* الطبقة الداخلية المجسمة */
        .inner-plate {
          position: absolute; inset: 8px;
          border: 1px solid rgba(0, 255, 65, 0.3);
          background: linear-gradient(180deg, transparent, rgba(0, 255, 65, 0.1), transparent);
          clip-path: polygon(0 16%, 44% 1%, 98% 1%, 98% 99%, 44% 99%, 0 84%, 0 63%, 22% 59%, 22% 41%, 0 37%);
        }

        /* خيط الطاقة النيوني */
        .energy-filament {
          position: absolute; right: 12px; top: 10%; bottom: 10%; width: 2px;
          background: #00ff41;
          box-shadow: 0 0 15px #00ff41, 0 0 5px #fff;
          animation: filamentGlow 2s infinite ease-in-out;
        }

        /* نقاط الاستشعار التقنية */
        .tech-nodes {
          position: absolute; left: 10px; height: 100%;
          display: flex; flex-direction: column; justify-content: space-between; padding: 60px 0;
        }
        .tech-nodes span {
          width: 6px; height: 6px; border: 1px solid #00ff41; background: #000;
          box-shadow: 0 0 8px #00ff41;
        }

        @keyframes filamentGlow { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; transform: scaleX(1.5); } }

        /* عكس الاتجاه لليمين */
        .bracket-wrapper.right .hyper-tech-bracket { transform: scaleX(-1); }

        /* المحتوى المركزي */
        .portal-content-center { opacity: 0; transition: 1.2s 0.6s; text-align: center; }
        .stage-breach .portal-content-center { opacity: 1; }
        .imperial-name-title-final { font-size: 4.8rem; color: #00ff41; letter-spacing: 18px; text-shadow: 0 0 35px #00ff41; font-weight: 900; }
        .status-message { color: #00ff41; margin-top: 25px; animation: blink 1s infinite; letter-spacing: 5px; font-size: 0.85rem; font-weight: bold; }
        
        .progress-segments { display: flex; gap: 10px; justify-content: center; margin-top: 35px; }
        .progress-seg-item { width: 24px; height: 24px; border: 2px solid #00ff41; background: rgba(0, 255, 65, 0.1); box-shadow: 0 0 10px rgba(0, 255, 65, 0.5); }
        
        @keyframes blink { 50% { opacity: 0.2; } }
      `}</style>
    </div>
  );
};

export default GateController;