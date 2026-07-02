
import { PRIORITY_LABEL, type Priority, type Stage } from "../lib/types";

const STAGE_STYLES: Record<Stage, string> = {
  Submitted:             "bg-slate-100 text-slate-600 ring-slate-200",
  Intake:                "bg-slate-100 text-slate-700 ring-slate-200",
  Discovery:             "bg-sky-50 text-sky-700 ring-sky-200",
  Development:           "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "Testing & Validation":"bg-amber-50 text-amber-700 ring-amber-200",
  Deployment:            "bg-teal-50 text-teal-700 ring-teal-200",
  Completed:             "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Archive:               "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

function base(className: string) {
  return "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset " + className;
}

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={base(STAGE_STYLES[stage] ?? "bg-slate-100 text-slate-600 ring-slate-200")}>{stage}</span>;
}

/** 2026 = green, 2027+ = amber/orange */
export function PriorityBadge({ priority }: { priority: Priority | null | undefined }) {
  if (!priority) return null;
  const cls = priority === 1
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : "bg-amber-50 text-amber-700 ring-amber-200";
  return <span className={base(cls)}>{PRIORITY_LABEL[priority]}</span>;
}

/** Flag badge for Blocked / Action Needed */
export function FlagBadge({ status }: { status: string }) {
  if (!status || (status !== "Blocked" && status !== "Action Needed")) return null;
  const cls = status === "Blocked"
    ? "bg-red-50 text-red-700 ring-red-200"
    : "bg-amber-50 text-amber-700 ring-amber-200";
  return <span className={base(cls)}>{status}</span>;
}

// Keep for backwards compat but hide everywhere
export function StatusBadge({ status }: { status: string }) {
  return <FlagBadge status={status} />;
}

export function RiskDot({ risk }: { risk?: number }) {
  if (!risk) return null;
  const color = risk >= 4 ? "bg-red-500" : risk === 3 ? "bg-amber-500" : "bg-emerald-500";
  return <span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><span className={`size-2 rounded-full ${color}`} />{risk}</span>;
}

export function OwnerAvatar({ name, size = 24 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full bg-slate-200 border border-white text-[10px] font-semibold text-slate-700 grid place-items-center"
      style={{ width: size, height: size }} title={name}>{initials}</div>
  );
}

/** Row / card highlight class for flagged items */
export function flagRowClass(status: string) {
  if (status === "Blocked") return "bg-red-50/40 hover:bg-red-50/70";
  if (status === "Action Needed") return "bg-amber-50/40 hover:bg-amber-50/70";
  return "";
}
