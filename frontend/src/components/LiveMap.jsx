import React, { useRef, useEffect, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';

export default function LiveMap({ isAttacked, attackerData, attackerCoords, targetCoords, hideAttacker, customWidth, customHeight, onNodeClick, shieldActive }) {
  const globeRef = useRef();
  const canvasRef = useRef(null); 
  const [countries, setCountries] = useState({ features: [] });
  const [selectedNode, setSelectedNode] = useState(null);

  // --- 1. حسابات نقاط الدرع (HexBin) ---
  const shieldPoints = useMemo(() => {
    const points = [];
    const step = 2; 
    for (let lat = -90; lat <= 90; lat += step) {
      const radiusAtLat = Math.cos(lat * Math.PI / 180);
      const lonStep = radiusAtLat > 0 ? step / radiusAtLat : 360; 
      for (let lng = -180; lng <= 180; lng += lonStep) {
        points.push({ lat, lng, size: 0.1 });
      }
    }
    return points;
  }, []);

  // --- 2. جلب بيانات الخريطة ---
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(res => res.json())
      .then(data => setCountries(data))
      .catch(err => console.error("Error loading globe data:", err));
  }, []);

  // --- 3. محرك خلفية الـ Plexus (النقاط المتحركة) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const particles = [];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.5 + 1
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 65, 0.4)';
        ctx.fill();
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dist = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
          if (dist < 170) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0, 255, 65, ${1 - dist / 170})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // --- 4. التحكم في الكاميرا ---
  useEffect(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      controls.autoRotate = !isAttacked; 
      controls.autoRotateSpeed = 0.5;
      if (isAttacked && (attackerData || attackerCoords)) {
        const targetLat = attackerData?.coords?.lat || attackerCoords?.lat || 55.7558;
        const targetLng = attackerData?.coords?.lng || attackerCoords?.lng || 37.6173;
        globeRef.current.pointOfView({ lat: targetLat, lng: targetLng, altitude: 2.5 }, 1000);
      }
    }
  }, [isAttacked, attackerData, attackerCoords]);

  // --- 5. بيانات النود والأقواس ---
  const currentAttacker = useMemo(() => {
    if (!isAttacked || hideAttacker) return null;
    return attackerData || (attackerCoords ? { coords: attackerCoords, loc: "Moscow, RU", ip: "185.22.154.66", id: "EV-TEST" } : null);
  }, [isAttacked, hideAttacker, attackerData, attackerCoords]);

  const currentTarget = useMemo(() => targetCoords || { lat: 31.9454, lng: 35.9284 }, [targetCoords]);

  // --- التعديل هنا لترتيب الظهور ---
  const nodes = useMemo(() => [
    // 1. نضع المهاجم أولاً في المصفوفة ليكون في المقدمة (Z-index أعلى برمجياً في الـ WebGL)
    ...(currentAttacker ? [{ id: 'attacker', lat: currentAttacker.coords.lat, lng: currentAttacker.coords.lng, label: 'ATTACK_SOURCE', country: currentAttacker.loc.split(',')[1] || 'Unknown', city: currentAttacker.loc.split(',')[0] || 'Unknown', status: 'Threat', color: '#ff0000', ip: currentAttacker.ip, node_id: currentAttacker.id }] : []),
    // 2. نضع العقد الثابتة بعد ذلك
    { id: 'CAMERA-1', lat: 31.9454, lng: 35.9284, label: 'DAHUA(IPC-HFW1431S)', country: 'Jordan', city: 'Amman', status: 'Active', node_id: 'IPC-HFW1431', ip: '192.168.1.105', color: '#00ff41' }
  ], [currentAttacker]);

  const ringsData = useMemo(() => [
    { lat: 31.9454, lng: 35.9284, color: '#00ff41' },
    ...(currentAttacker ? [{ lat: currentAttacker.coords.lat, lng: currentAttacker.coords.lng, color: '#ff0000' }] : []),
    ...(isAttacked ? [{ lat: currentTarget.lat, lng: currentTarget.lng, color: '#ff0000' }] : [])
  ], [currentAttacker, currentTarget, isAttacked]);

  return (
    <div className="globe-container" style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: '#000', overflow: 'hidden' }}>
      
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.4, pointerEvents: 'none' }} />
      <div className="grid-overlay" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 2 }}>
        <Globe
          ref={globeRef}
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere={true}
          atmosphereColor="#00ff41"
          atmosphereAltitude={0.15}
          hexPolygonsData={countries.features}
          hexPolygonResolution={3}
          hexPolygonMargin={0.2}
          hexPolygonColor={() => 'rgba(0, 255, 65, 0.3)'}
          pointsData={nodes} 
          pointColor={d => d.color}
          pointAltitude={0.01} 
          pointRadius={2.5}
          onPointClick={(node) => setSelectedNode(node)} 
          ringsData={ringsData}
          ringColor={d => t => `rgba(${d.color === '#ff0000' ? '255,0,0' : '0,255,65'},${1-t})`}
          ringMaxRadius={5}
          ringPropagationSpeed={3}
          labelsData={nodes}
          labelColor={d => d.color}
          labelSize={1.5}
          labelAltitude={0.05}
          arcsData={currentAttacker ? [{ 
              startLat: currentAttacker.coords.lat, startLng: currentAttacker.coords.lng, 
              endLat: currentTarget.lat, endLng: currentTarget.lng, color: '#ff0000' 
          }] : []}
          arcColor={d => d.color}
          arcDashLength={0.4}
          arcDashAnimateTime={1500}
          arcStroke={0.5}
          hexBinPointsData={shieldActive ? shieldPoints : []} 
          hexBinPointWeight="size"
          hexBinResolution={1.8} 
          hexBinAltitude={0.4} 
          hexTopColor={() => 'rgba(3, 153, 41, 0.49)'} 
          width={customWidth || window.innerWidth}
          height={customHeight || window.innerHeight}
        />
      </div>

      {/* نافذة واحدة فقط تجمع كل التفاصيل */}
      {selectedNode && (
        <div className="terminal-info-overlay">
          <div className="terminal-header">
            <div className="glitch-text">DATA_STREAM // {selectedNode.label}</div>
            <button className="terminal-close" onClick={() => setSelectedNode(null)}>×</button>
          </div>
          <div className="terminal-body">
            <div className="data-grid">
                <div className="data-line"><span className="tag">COUNTRY:</span> {selectedNode.country}</div>
                <div className="data-line"><span className="tag">CITY:</span> {selectedNode.city}</div>
                <div className="data-line"><span className="tag">IP_ADDR:</span> {selectedNode.ip}</div>
                <div className="data-line"><span className="tag">COORDS:</span> {selectedNode.lat.toFixed(2)}, {selectedNode.lng.toFixed(2)}</div>
                <div className="data-line"><span className="tag">NODE_ID:</span> {selectedNode.node_id}</div>
            </div>
            
            <div className="separator" />

            <div className="extra-info">
                <div className="data-line"><span className="tag">FIREWALL:</span> ACTIVE (Encrypted)</div>
                <div className="data-line"><span className="tag">LATENCY:</span> 11ms</div>
                <div className="data-line"><span className="tag">CPU_LOAD:</span> [||||||____] 42%</div>
            </div>

            <div className="status-box" style={{ borderColor: selectedNode.color, color: selectedNode.color }}>
               STATUS: <span className="blink-text">{selectedNode.status.toUpperCase()}</span>
            </div>
          </div>
          <div className="terminal-footer">ENCRYPTED_UPLINK_ESTABLISHED // SECURE_NODE</div>
        </div>
      )}

      <style>{`
        .grid-overlay {
          background-image: linear-gradient(rgba(0, 255, 65, 0.05) 1px, transparent 1px), 
                            linear-gradient(90deg, rgba(0, 255, 65, 0.05) 1px, transparent 1px);
          background-size: 30px 30px;
          animation: pulseGrid 4s infinite;
        }

        .terminal-info-overlay {
          position: absolute;
          top: 100px;
          right: 20px;
          width: 340px;
          background: rgba(0, 10, 0, 0.95);
          border: 1px solid #00ff41;
          color: #00ff41;
          font-family: 'Share Tech Mono', monospace;
          z-index: 99999;
          box-shadow: 0 0 20px rgba(0, 255, 65, 0.3);
        }

        .terminal-header {
          padding: 10px;
          background: rgba(0, 255, 65, 0.2);
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #00ff41;
        }

        .terminal-body { padding: 15px; font-size: 13px; }
        .data-line { margin-bottom: 6px; display: flex; justify-content: space-between; }
        .tag { color: rgba(0, 255, 65, 0.6); font-size: 11px; }
        .separator { height: 1px; background: rgba(0, 255, 65, 0.2); margin: 12px 0; }
        
        .status-box { 
          margin-top: 15px; 
          padding: 8px; 
          border: 1px solid; 
          text-align: center; 
          background: rgba(0, 255, 65, 0.05);
        }

        .terminal-close { background: none; border: none; color: #ff4141; cursor: pointer; font-size: 20px; }
        .terminal-footer { font-size: 9px; padding: 5px; opacity: 0.5; text-align: center; }
        .blink-text { animation: blink 1s infinite; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes pulseGrid { 0%, 100% { opacity: 0.1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}