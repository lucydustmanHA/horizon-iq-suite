import { useEffect, useState } from "react";
import { usePortfolio } from "../lib/store";

/** 🎉 Celebration animation — fires when a use case reaches Completed */
export function CelebrationOverlay() {
  const celebrate = usePortfolio((s) => s.celebrate);
  const setCelebrate = usePortfolio((s) => s.setCelebrate);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; rotation: number; scale: number; delay: number }>>([]);

  useEffect(() => {
    if (!celebrate) return;
    // Generate particles
    const colors = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#f43f5e", "#14b8a6"];
    const newParticles = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10 - Math.random() * 20,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      scale: 0.5 + Math.random() * 1,
      delay: Math.random() * 0.5,
    }));
    setParticles(newParticles);
    const timer = setTimeout(() => { setCelebrate(false); setParticles([]); }, 3000);
    return () => clearTimeout(timer);
  }, [celebrate, setCelebrate]);

  if (!particles.length) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
          }}
        >
          <div
            className="w-2.5 h-2.5"
            style={{
              backgroundColor: p.color,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            }}
          />
        </div>
      ))}
      {/* Center message */}
      <div className="absolute inset-0 flex items-center justify-center animate-bounce-in">
        <div className="bg-white/95 backdrop-blur-sm px-8 py-4 rounded-2xl shadow-2xl border border-emerald-200">
          <p className="text-2xl font-bold text-emerald-600 text-center">🎉 We're Live!</p>
          <p className="text-sm text-slate-500 text-center mt-1">Another one delivered.</p>
        </div>
      </div>
    </div>
  );
}
