import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Target, Sparkles, ArrowRight, Check } from "lucide-react";
import { useCurrentUser } from "../lib/user-context";
import { saveSide, SIDE_HOME, type AppSide } from "../lib/app-side";

export const Route = createFileRoute("/welcome")({
  head: () => ({ meta: [{ title: "Welcome — Horizon QX Business Transformation" }] }),
  component: WelcomePage,
});

const SIDES: { side: AppSide; title: string; icon: typeof Target; blurb: string; bullets: string[] }[] = [
  {
    side: "strategy",
    title: "Strategy",
    icon: Target,
    blurb: "Department goals, monthly scorecards, and leadership reviews.",
    bullets: ["Goals by department and priority", "Monthly actuals vs. target", "Leadership review and PDF", "Initiatives and deep dives"],
  },
  {
    side: "ai",
    title: "AI & Automation",
    icon: Sparkles,
    blurb: "The AI and automation use case portfolio, from idea to live.",
    bullets: ["Use cases, Kanban, and calendar", "Live & Delivering reviews", "Portfolios and AI adoption", "Value and time saved"],
  },
];

function WelcomePage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const first = user?.displayName && user.displayName !== "Unknown" ? user.displayName.split(" ")[0] : "";
  const choose = (side: AppSide) => {
    saveSide(side);
    navigate({ to: SIDE_HOME[side] as any, replace: true });
  };
  return (
    <div className="min-h-screen bg-brand text-brand-foreground flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <img src="/logo.svg" alt="Horizon" className="size-14 rounded-full mb-5" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Horizon QX</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mt-2 text-center">Business Transformation</h1>
        <p className="text-slate-300 mt-3 text-center">{first ? `Welcome, ${first}. ` : "Welcome. "}Where would you like to start?</p>

        <div className="grid md:grid-cols-2 gap-5 mt-10 w-full max-w-3xl">
          {SIDES.map(({ side, title, icon: Icon, blurb, bullets }) => (
            <button key={side} onClick={() => choose(side)}
              className="group text-left bg-white text-slate-900 rounded-2xl p-6 shadow-lg ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-xl transition-all focus:outline-none focus:ring-4 focus:ring-accent-indigo/40">
              <div className="flex items-center gap-3">
                <div className={`size-11 rounded-xl flex items-center justify-center ${side === "strategy" ? "bg-accent-orange/10 text-accent-orange" : "bg-accent-indigo/10 text-accent-indigo"}`}>
                  <Icon className="size-5" />
                </div>
                <h2 className="text-xl font-bold tracking-tight">{title}</h2>
                <ArrowRight className="size-5 ml-auto text-slate-300 group-hover:text-accent-indigo group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-sm text-slate-500 mt-3">{blurb}</p>
              <ul className="mt-4 space-y-1.5">
                {bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-sm text-slate-600"><Check className="size-3.5 text-accent-indigo shrink-0" />{b}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-8">You can switch between the two at any time from the top of the sidebar.</p>
      </div>
    </div>
  );
}
