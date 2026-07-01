import { PRIORITY_LABEL, type Priority, type Stage, type Status } from "../lib/types";

const STAGE_STYLES: Record<Stage, string> = {
  Submitted: "bg-slate-100 text-slate-600 ring-slate-200",
  Intake: "bg-slate-100 text-slate-700 ring-slate-200",
  Discovery: "bg-sky-50 text-sky-700 ring-sky-200",
  Development: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "Testing & Validation": "bg-amber-50 text-amber-700 ring-amber-200",
  Deployment: "bg-teal-50 text-teal-700 ring-teal-200",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Archive: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

const STATUS_STYLES: Record<Status, string> = {
  "Not Started": "bg-slate-100 text-slate-600 ring-slate-200",
  "In Progress": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Blocked: "bg-red-50 text-red-700 ring-red-200",
  "On Hold": "bg-amber-50 text-amber-700 ring-amber-200",
  Live: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Retired: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

const PRIORITY_STYLES: Record<Priority, string> = {
  1: "bg-slate-100 text-slate-600 ring-slate-200",
  2: "bg-slate-100 text-slate-700 ring-slate-200",
  3: "bg-sky-50 text-sky-700 ring-sky-200",
  4: "bg-orange-50 text-orange-700 ring-orange-200",
  5: "bg-red-50 text-red-700 ring-red-200",
};

function base(className: string) {
  return (
    "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset " +
    className
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={base(STAGE_STYLES[stage])}>{stage}</span>;
}
export function StatusBadge({ status }: { status: Status }) {
  return <span className={base(STATUS_STYLES[status])}>{status}</span>;
}
export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={base(PRIORITY_STYLES[priority])}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function RiskDot({ risk }: { risk: number }) {
  const color =
    risk >= 4 ? "bg-red-500" : risk === 3 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`size-2 rounded-full ${color}`} />
      {risk}
    </span>
  );
}

export function OwnerAvatar({ name, size = 24 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="rounded-full bg-slate-200 border border-white text-[10px] font-semibold text-slate-700 grid place-items-center"
      style={{ width: size, height: size }}
      title={name}
    >
      {initials}
    </div>
  );
}