
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend 
} from 'recharts';
import { SensorData, IncidentRecord, DetectionMode } from './types';
import { analyzeFallEvent } from './services/geminiService';

// --- Components ---

const LifeLinkLogo: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1e3a8a" />
        <stop offset="100%" stopColor="#0d9488" />
      </linearGradient>
    </defs>
    <path d="M50 5 L15 20 C15 50 25 85 50 95 C75 85 85 50 85 20 L50 5Z" fill="url(#logoGrad)" />
    <circle cx="50" cy="50" r="22" fill="#020617" />
    <path 
      d="M30 50 L40 50 L45 35 L50 65 L55 50 L70 50" 
      stroke="#2dd4bf" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className="pulse-line"
    />
    <circle cx="25" cy="25" r="1.5" fill="white" opacity="0.6" />
    <circle cx="75" cy="25" r="1.5" fill="white" opacity="0.6" />
    <circle cx="50" cy="85" r="1.5" fill="white" opacity="0.6" />
  </svg>
);

// --- Constants ---
const BUFFER_SIZE = 60;
const FALL_THRESHOLD = 3.8;
const UI_REFRESH_RATE = 200;

const App: React.FC = () => {
  const [mode, setMode] = useState<DetectionMode>(DetectionMode.SIMULATED);
  const [sensorHistory, setSensorHistory] = useState<SensorData[]>([]);
  const [isFallDetected, setIsFallDetected] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const timerRef = useRef<any>(null);
  const lastIncidentDataRef = useRef<SensorData[]>([]);
  const simPhase = useRef(0);

  const playAlert = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(() => {});
  };

  const generateSimData = useCallback(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    let x, y, z, hr, spo2;
    if (isFallDetected) {
      x = (Math.random() - 0.5) * 0.05;
      y = (Math.random() - 0.5) * 0.05;
      z = (Math.random() - 0.5) * 0.05;
      // Heart rate spikes after fall
      hr = 105 + Math.floor(Math.random() * 10);
      spo2 = 96 + Math.floor(Math.random() * 3);
    } else {
      x = Math.sin(simPhase.current) * 0.6 + (Math.random() - 0.5) * 0.2;
      y = Math.cos(simPhase.current * 0.7) * 0.4 + (Math.random() - 0.5) * 0.2;
      z = 1.0 + Math.sin(simPhase.current * 1.2) * 0.2 + (Math.random() - 0.5) * 0.1;
      hr = 72 + Math.floor(Math.sin(simPhase.current * 0.1) * 5) + Math.floor(Math.random() * 3);
      spo2 = 98 + (Math.random() > 0.95 ? -1 : 0);
      simPhase.current += 0.25;
    }
    const magnitude = Math.sqrt(x*x + y*y + z*z);
    return { time: timeStr, x, y, z, magnitude, hr, spo2 };
  }, [isFallDetected]);

  useEffect(() => {
    if (!isMonitoring) return;
    const interval = setInterval(() => {
      const newData = generateSimData();
      setSensorHistory(prev => {
        const next = [...prev, newData];
        if (next.length > BUFFER_SIZE) return next.slice(1);
        return next;
      });
      if (!isFallDetected && newData.magnitude > FALL_THRESHOLD) {
        triggerFallAlert(newData);
      }
    }, UI_REFRESH_RATE);
    return () => clearInterval(interval);
  }, [isMonitoring, generateSimData, isFallDetected]);

  const triggerFallAlert = (data: SensorData) => {
    setIsFallDetected(true);
    setCountdown(10);
    playAlert();
    lastIncidentDataRef.current = [...sensorHistory, data];
  };

  const cancelAlert = () => {
    setIsFallDetected(false);
    setCountdown(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const confirmAlert = async () => {
    const latestData = lastIncidentDataRef.current[lastIncidentDataRef.current.length - 1];
    const peak = Math.max(...lastIncidentDataRef.current.map(d => d.magnitude));
    
    const newIncident: IncidentRecord = {
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      timestamp: Date.now(),
      severity: peak > 5.5 ? 'high' : 'medium',
      peakMagnitude: peak,
      hrAtIncident: latestData.hr,
      spo2AtIncident: latestData.spo2,
      location: { lat: 44.81 + (Math.random() - 0.5) * 0.01, lng: 20.46 + (Math.random() - 0.5) * 0.01 },
      status: 'alerted'
    };
    
    setIncidents(prev => [newIncident, ...prev]);
    setIsFallDetected(false);
    setCountdown(null);

    const analysis = await analyzeFallEvent(lastIncidentDataRef.current);
    setIncidents(prev => prev.map(inc => 
      inc.id === newIncident.id ? { ...inc, analysis } : inc
    ));
  };

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      timerRef.current = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0) {
      confirmAlert();
    }
    return () => { 
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [countdown]);

  const latest = sensorHistory[sensorHistory.length - 1] || { x: 0, y: 0, z: 0, magnitude: 0, hr: 0, spo2: 0 };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 flex flex-col items-center select-none overflow-x-hidden">
      {/* Rebranded Header */}
      <header className="w-full max-w-7xl flex justify-between items-center mb-10 border-b border-teal-900/30 pb-6">
        <div className="flex items-center gap-4">
          <LifeLinkLogo className="w-14 h-14 lifelink-glow rounded-2xl p-1 bg-slate-900/80 border border-teal-500/20" />
          <div>
            <h1 className="text-3xl font-lifelink font-bold tracking-tight text-white flex items-center gap-1">
              LifeLink <span className="text-teal-400 font-orbitron text-xl">GUARD</span>
            </h1>
            <p className="text-[0.7rem] text-teal-500/80 uppercase tracking-[0.2em] font-bold">Bio-Telemetry & Fall Safety</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex bg-slate-900/80 rounded-full p-1 border border-teal-900/50 backdrop-blur">
            <button 
              onClick={() => setMode(DetectionMode.SIMULATED)}
              className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${mode === DetectionMode.SIMULATED ? 'bg-teal-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              SIMULATION
            </button>
            <button 
              onClick={() => setMode(DetectionMode.LIVE)}
              className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${mode === DetectionMode.LIVE ? 'bg-teal-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              S3 LIVE
            </button>
          </div>
          <button 
            onClick={() => setIsMonitoring(!isMonitoring)}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 ${isMonitoring ? 'bg-rose-500 shadow-xl shadow-rose-900/40' : 'bg-teal-500 shadow-xl shadow-teal-900/40'}`}
          >
            <i className={`fa-solid ${isMonitoring ? 'fa-pause' : 'fa-play'} text-white text-xl`}></i>
          </button>
        </div>
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT PANEL: Professional Monitoring Device Mockup */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="relative mx-auto w-full max-w-[340px] aspect-square bg-slate-900 rounded-[3.5rem] border-[14px] border-slate-800 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] flex items-center justify-center overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-transparent to-blue-500/10"></div>
             
             <div className="z-10 text-center w-full px-8">
                {/* Top Status Bar in Mockup */}
                <div className="flex justify-between items-center mb-6 opacity-80">
                   <div className="flex items-center gap-1.5">
                      <i className="fa-solid fa-satellite-dish text-teal-400 text-[0.6rem]"></i>
                      <span className="text-[0.55rem] font-bold text-teal-400/80 uppercase tracking-widest">GNSS-L76K</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <span className="text-[0.55rem] text-slate-400">82%</span>
                      <i className="fa-solid fa-battery-three-quarters text-teal-500 text-[0.7rem]"></i>
                   </div>
                </div>

                {/* Primary Metric */}
                <div className="mb-2">
                  <span className="text-[0.6rem] uppercase tracking-[0.2em] text-slate-500 font-black">IMPACT (G)</span>
                  <div className={`text-7xl font-orbitron font-bold tabular-nums tracking-tighter transition-all duration-300 ${latest.magnitude > FALL_THRESHOLD ? 'text-rose-500 scale-110' : 'text-white'}`}>
                    {latest.magnitude.toFixed(2)}
                  </div>
                </div>

                {/* Biometrics in Mockup */}
                <div className="grid grid-cols-2 gap-4 mt-4 border-t border-slate-800/50 pt-4">
                   <div className="flex flex-col items-center">
                      <span className="text-[0.5rem] text-rose-500 font-black uppercase flex items-center gap-1">
                        <i className="fa-solid fa-heart animate-pulse"></i> PULSE
                      </span>
                      <span className="text-xl font-orbitron text-slate-200">{latest.hr}<span className="text-[0.6rem] ml-0.5 opacity-50">BPM</span></span>
                   </div>
                   <div className="flex flex-col items-center">
                      <span className="text-[0.5rem] text-teal-400 font-black uppercase flex items-center gap-1">
                        <i className="fa-solid fa-droplet"></i> SpO2
                      </span>
                      <span className="text-xl font-orbitron text-slate-200">{latest.spo2}<span className="text-[0.6rem] ml-0.5 opacity-50">%</span></span>
                   </div>
                </div>

                {/* Axis indicators */}
                <div className="mt-6 flex justify-center gap-4">
                    <div className="text-[0.5rem] text-slate-600 font-bold">X: {latest.x.toFixed(1)}</div>
                    <div className="text-[0.5rem] text-slate-600 font-bold">Y: {latest.y.toFixed(1)}</div>
                    <div className="text-[0.5rem] text-slate-600 font-bold">Z: {latest.z.toFixed(1)}</div>
                </div>
             </div>
             
             {/* Radial threat indicator */}
             <div 
               className="absolute inset-0 border-[8px] transition-all duration-300 opacity-30"
               style={{ 
                 borderColor: latest.magnitude > FALL_THRESHOLD ? '#f43f5e' : 'transparent',
                 boxShadow: latest.magnitude > FALL_THRESHOLD ? 'inset 0 0 60px #f43f5e' : 'none'
               }}
             ></div>
          </div>

          {/* Quick Metrics Dashboard */}
          <div className="bg-slate-900/40 p-6 rounded-3xl border border-teal-900/20 backdrop-blur-xl">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-[0.7rem] font-black text-slate-500 uppercase tracking-[0.1em]">Bio-Kinetic Integrity</h3>
                <i className="fa-solid fa-microchip text-teal-500"></i>
             </div>
             <div className="space-y-4">
                <div className="flex justify-between items-center p-3 rounded-2xl bg-slate-950/50 border border-white/5">
                   <span className="text-[0.65rem] text-slate-500 font-bold uppercase">GNSS Precision</span>
                   <span className="text-[0.65rem] font-orbitron text-teal-400">±2.4m</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-2xl bg-slate-950/50 border border-white/5">
                   <span className="text-[0.65rem] text-slate-500 font-bold uppercase">MAX30102 Signal</span>
                   <span className="text-[0.65rem] font-orbitron text-green-400 uppercase">Excellent</span>
                </div>
             </div>
          </div>

          <button 
             onClick={() => triggerFallAlert({ time: 'TEST', x: 2.8, y: -4.2, z: 1.5, magnitude: 5.2, hr: 112, spo2: 97 })}
             disabled={!isMonitoring || isFallDetected}
             className="w-full py-5 bg-slate-900 hover:bg-slate-800 text-teal-500 rounded-3xl transition-all border border-teal-500/10 font-black text-xs tracking-widest disabled:opacity-30 uppercase group"
          >
            <i className="fa-solid fa-person-falling-burst mr-2 group-hover:scale-110 transition"></i>
            Force Rescue Scenario
          </button>
        </div>

        {/* RIGHT PANEL: Multi-Modal Data Analysis */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-slate-900/30 rounded-[2.5rem] p-8 border border-teal-900/10 min-h-[500px] relative backdrop-blur-2xl">
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-sm font-bold text-slate-400 flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></div>
                Integrated Bio-Kinetic Stream
              </h3>
              <div className="flex gap-4 text-[0.6rem] font-black tracking-widest uppercase">
                 <span className="text-teal-400">Impact (G)</span>
                 <span className="text-rose-500">Pulse (BPM)</span>
                 <span className="text-slate-500">SpO2 (%)</span>
              </div>
            </div>
            
            <div className="w-full h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sensorHistory}>
                  <defs>
                    <linearGradient id="colorG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.1}/><stop offset="95%" stopColor="#2dd4bf" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorHR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/><stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} strokeOpacity={0.1} />
                  <XAxis dataKey="time" hide />
                  <YAxis stroke="#475569" fontSize={10} domain={[0, 150]} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #134e4a', borderRadius: '16px', fontSize: '10px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                  />
                  <Legend iconType="circle" />
                  <Area type="monotone" dataKey="magnitude" stroke="#2dd4bf" fill="url(#colorG)" strokeWidth={3} dot={false} isAnimationActive={false} name="Impact Magnitude" />
                  <Area type="monotone" dataKey="hr" stroke="#f43f5e" fill="url(#colorHR)" strokeWidth={2} dot={false} isAnimationActive={false} name="Pulse Rate" />
                  <Line type="monotone" dataKey="spo2" stroke="#94a3b8" strokeWidth={1} dot={false} isAnimationActive={false} name="SpO2 Level" />
                  <Line type="monotone" dataKey={() => FALL_THRESHOLD} stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="10 5" dot={false} name="Safety Limit" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            {!isMonitoring && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm rounded-[2.5rem] z-20">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-3xl bg-slate-900 flex items-center justify-center mx-auto mb-6 border border-teal-900/50 shadow-2xl">
                    <i className="fa-solid fa-radar text-teal-500 text-2xl animate-spin-slow"></i>
                  </div>
                  <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xs">Awaiting LifeLink Connection...</p>
                </div>
              </div>
            )}
          </div>

          {/* Incident Log with Biometric Forensic Analysis */}
          <div className="bg-slate-900/30 rounded-[2.5rem] p-8 border border-teal-900/10 flex flex-col h-[460px] backdrop-blur-2xl">
             <div className="flex justify-between items-center mb-8">
                <h3 className="text-sm font-bold text-slate-400 flex items-center gap-3">
                  <i className="fa-solid fa-file-shield text-teal-500"></i>
                  Black-Box: Bio-Forensic Logs
                </h3>
                <span className="text-[0.6rem] bg-teal-950/50 text-teal-400 px-3 py-1.5 rounded-full font-black uppercase tracking-wider border border-teal-500/20">
                   {incidents.length} EVENTS SECURED
                </span>
             </div>
            
            <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
              {incidents.length === 0 ? (
                <div className="h-full flex items-center justify-center border-2 border-dashed border-teal-900/10 rounded-[2rem]">
                  <div className="text-center opacity-40">
                    <i className="fa-solid fa-heart-circle-check text-slate-700 text-5xl mb-4"></i>
                    <p className="text-slate-600 text-[0.65rem] font-black uppercase tracking-widest">System Integrity Verified</p>
                  </div>
                </div>
              ) : (
                incidents.map((inc) => (
                  <div key={inc.id} className="bg-slate-950/40 rounded-3xl p-6 border border-teal-900/10 hover:border-teal-500/30 transition-all">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-4">
                         <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${inc.severity === 'high' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'}`}>
                            <i className="fa-solid fa-radiation text-2xl"></i>
                         </div>
                         <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-black text-white uppercase tracking-tight">INCIDENT #{inc.id}</span>
                              <span className="text-[0.5rem] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-black">GPS LOCKED</span>
                            </div>
                            <span className="text-[0.65rem] text-slate-500 font-orbitron">{new Date(inc.timestamp).toLocaleString()}</span>
                         </div>
                      </div>
                      <div className="text-right flex flex-col gap-1">
                         <span className="text-xl font-orbitron text-white font-black">{inc.peakMagnitude.toFixed(2)} G</span>
                         <span className="text-[0.55rem] text-teal-500 font-bold">{inc.location?.lat.toFixed(4)}, {inc.location?.lng.toFixed(4)}</span>
                      </div>
                    </div>

                    {/* Vitals at incident */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                       <div className="bg-slate-900/50 p-3 rounded-xl border border-white/5 flex items-center justify-between">
                          <span className="text-[0.6rem] text-slate-500 uppercase font-black">HR AT IMPACT</span>
                          <span className="text-sm font-orbitron text-rose-400">{inc.hrAtIncident} BPM</span>
                       </div>
                       <div className="bg-slate-900/50 p-3 rounded-xl border border-white/5 flex items-center justify-between">
                          <span className="text-[0.6rem] text-slate-500 uppercase font-black">SpO2 AT IMPACT</span>
                          <span className="text-sm font-orbitron text-teal-400">{inc.spo2AtIncident}%</span>
                       </div>
                    </div>
                    
                    <div className="p-5 bg-teal-950/10 rounded-2xl border border-teal-500/10">
                      <div className="flex items-center justify-between mb-3 border-b border-teal-500/10 pb-2">
                         <span className="text-[0.6rem] font-black text-teal-400 uppercase tracking-widest flex items-center gap-2">
                           <i className="fa-solid fa-dna"></i>
                           Gemini AI Bio-Medical Summary
                         </span>
                         <i className="fa-solid fa-microchip text-teal-500 text-[0.7rem]"></i>
                      </div>
                      {inc.analysis ? (
                        <p className="text-[0.75rem] text-slate-300 leading-relaxed font-medium italic">"{inc.analysis}"</p>
                      ) : (
                        <div className="flex items-center gap-3 py-1">
                          <div className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-[0.6rem] text-teal-600 font-black uppercase animate-pulse">Running diagnostic models...</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* EMERGENCY RESPONSE OVERLAY */}
      {isFallDetected && countdown !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-3xl p-6">
          <div className="bg-[#0c0c1e] border-4 border-rose-600/30 w-full max-w-xl rounded-[4.5rem] p-12 text-center shadow-[0_0_150px_rgba(225,29,72,0.3)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-rose-600 shadow-[0_0_20px_#e11d48]"></div>
            
            <div className="relative mb-10">
               <div className="w-32 h-32 bg-rose-600 rounded-full mx-auto flex items-center justify-center shadow-2xl relative z-10 danger-glow">
                  <i className="fa-solid fa-heart-circle-exclamation text-5xl text-white"></i>
               </div>
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 border-2 border-rose-500 rounded-full animate-ping opacity-20"></div>
            </div>
            
            <h2 className="text-5xl font-lifelink font-black text-white mb-6 tracking-tight">FALL DETECTED</h2>
            <p className="text-slate-400 mb-2 text-xs font-black uppercase tracking-widest">LifeLink Guardian Protocol Active</p>
            <p className="text-teal-500/80 mb-10 text-[0.65rem] font-bold uppercase tracking-[0.2em]">GPS COORDS: 44.8123N, 20.4678E</p>
            
            <div className="text-[14rem] font-orbitron font-black text-white mb-10 tabular-nums leading-none tracking-tighter drop-shadow-2xl">
              {countdown}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button 
                onClick={cancelAlert}
                className="w-full py-7 bg-slate-900 hover:bg-slate-800 text-white rounded-[2rem] font-black transition-all border border-slate-700 text-xs uppercase tracking-widest"
              >
                I AM OKAY (ABORT)
              </button>
              <button 
                onClick={confirmAlert}
                className="w-full py-7 bg-rose-600 hover:bg-rose-700 text-white rounded-[2rem] font-black transition-all text-xs uppercase tracking-widest shadow-2xl shadow-rose-900/50"
              >
                DISPATCH MEDICAL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* System Status Bar */}
      <footer className="w-full max-w-7xl mt-16 flex flex-col md:flex-row justify-between items-center text-[0.65rem] text-teal-800 border-t border-teal-900/10 pt-8 gap-8 font-black tracking-[0.3em] uppercase">
        <div className="flex gap-10 items-center">
           <span className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_12px_#14b8a6]"></div> 
             LifeLink Global Network: Connected
           </span>
           <span className="flex items-center gap-2">
             <i className="fa-solid fa-map-location-dot text-teal-600"></i> 
             GNSS: ACTIVE (12 SAT)
           </span>
           <span className="flex items-center gap-2">
             <i className="fa-solid fa-fingerprint text-teal-600"></i> 
             BIO-ID: VERIFIED
           </span>
        </div>
        <div className="flex gap-10">
           <a href="#" className="hover:text-teal-400 transition-colors">Rescue API</a>
           <a href="#" className="hover:text-teal-400 transition-colors">SLA Agreement</a>
           <a href="#" className="hover:text-teal-400 transition-colors">Cloud Node: EU-S3</a>
        </div>
      </footer>
    </div>
  );
};

export default App;
