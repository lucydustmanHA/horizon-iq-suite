import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Target } from "lucide-react";
import { saveSide, SIDE_HOME, type AppSide } from "../lib/app-side";

const OPTIONS: { side: AppSide; label: string; icon: typeof Sparkles }[] = [
  { side: "strategy", label: "Strategy", icon: Target },
  { side: "ai", label: "AI & Automation", icon: Sparkles },
];

/** Segmented control in the sidebar for moving between the two sides of the app. */
export function SideSwitcher({ current }: { current: AppSide }) {
  const navigate = useNavigate();
  const go = (side: AppSide) => {
    saveSide(side);
    if (side !== current) navigate({ to: SIDE_HOME[side] as any });
  };
  return (
    <div className="mx-4 mb-4 grid grid-cols-2 gap-1 rounded-lg bg-black/20 p-1" role="tablist" aria-label="Switch workspace">
      {OPTIONS.map(({ side, label, icon: Icon }) => {
        const active = side === current;
        return (
          <button key={side} role="tab" aria-selected={active} onClick={() => go(side)}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${active ? "bg-white text-brand shadow-sm" : "text-slate-300 hover:text-white hover:bg-white/5"}`}>
            <Icon className="size-3.5 shrink-0" /><span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
