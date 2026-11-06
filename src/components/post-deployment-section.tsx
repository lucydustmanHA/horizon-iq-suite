import React, { useState } from "react";
import { Plus, Save, Star, Trash2, X } from "lucide-react";
import { NotesEditor } from "./notes-editor";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import type { LiveMetric, LiveMonitoring } from "../lib/live-mock-data";
import { METRIC_UNITS, ROLLUP_OPTIONS } from "../lib/live-mock-data";
import { REVIEW_CYCLE_OPTIONS } from "../lib/live-review-utils";
import { sortMetricPeriods, getMetricRollupValue, formatMetricValue } from "../lib/live-review-utils";
import { $addMetric, $deleteMetric, $updateMetric } from "../lib/live.server";

export function PostDeploymentSection({
  useCaseId,
  monitoring,
  monDesc,
  setMonDesc,
  reviewCycle,
  onReviewCycleChange,
  monOwner,
  setMonOwner,
  monSaving,
  saveMonitoring,
  metrics,
  setMetrics,
  notesContent,
}: {
  useCaseId: string;
  monitoring: LiveMonitoring | null;
  monDesc: string;
  setMonDesc: (v: string) => void;
  reviewCycle: string;
  onReviewCycleChange: (v: string) => void;
  monOwner: string;
  setMonOwner: (v: string) => void;
  monSaving: boolean;
  saveMonitoring: () => void;
  metrics: LiveMetric[];
  setMetrics: (m: LiveMetric[]) => void;
  notesContent?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {/* Process section — no sub-tabs, metrics moved to main Metrics tab */}
      {(
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Post-Deployment Monitoring Process</p>
            <Button variant="outline" size="sm" className="gap-1" onClick={saveMonitoring} disabled={monSaving}>
              <Save className="size-3" />{monSaving ? "Saving…" : "Save"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Review Cycle</label>
              <Select value={reviewCycle} onValueChange={onReviewCycleChange}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{REVIEW_CYCLE_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Monitoring Owner</label>
              <Input value={monOwner} onChange={(e) => setMonOwner(e.target.value)} placeholder="Owner name" className="h-9 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">How We Monitor</label>
            <NotesEditor value={monDesc} onChange={setMonDesc} />
          </div>
          {!monitoring && !monDesc && !monOwner && (
            <p className="text-xs text-slate-400">Add the monitoring process here once the use case is deployed. This section remains available even if the use case later moves back to an earlier stage.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function MetricsTab({ useCaseId, metrics, setMetrics }: {
  useCaseId: string;
  metrics: LiveMetric[];
  setMetrics: (m: LiveMetric[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newPeriod, setNewPeriod] = useState("");
  const storageKey = `qx-metrics-cols-${useCaseId}`;
  const [periodOrder, setPeriodOrderRaw] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [sessionColumns, setSessionColumns] = useState<string[]>([]);

  const dbPeriods = sortMetricPeriods(Array.from(new Set(metrics.flatMap((m) => Object.keys(m.periodValues)))));

  const setPeriodOrder = (cols: string[]) => {
    const sanitized = cols.filter((col, idx) => dbPeriods.includes(col) && cols.indexOf(col) === idx);
    setPeriodOrderRaw(sanitized);
    localStorage.setItem(storageKey, JSON.stringify(sanitized));
  };

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const displayPeriods = [
    ...periodOrder.filter((col) => dbPeriods.includes(col)),
    ...dbPeriods.filter((col) => !periodOrder.includes(col)),
    ...sessionColumns.filter((col) => !dbPeriods.includes(col)),
  ];

  const addRow = async () => {
    if (!newName.trim()) return;
    const metric = await $addMetric({ data: { useCaseId, metricName: newName.trim(), unit: "%", target: null, starred: false } });
    setMetrics([...metrics, metric]);
    setNewName("");
  };

  const addPeriodColumn = () => {
    const col = newPeriod.trim();
    if (!col || displayPeriods.includes(col)) return;
    setSessionColumns((prev) => [...prev, col]);
    setNewPeriod("");
  };

  const deletePeriodColumn = (col: string) => {
    setPeriodOrder(periodOrder.filter((c) => c !== col));
    setSessionColumns((prev) => prev.filter((c) => c !== col));
    const updated = metrics.map((m) => {
      const newVals = { ...m.periodValues };
      delete newVals[col];
      return { ...m, periodValues: newVals };
    });
    setMetrics(updated);
    updated.forEach((m) => {
      $updateMetric({ data: { id: m.id, periodValues: m.periodValues } });
    });
  };

  const toggleStar = async (metric: LiveMetric) => {
    const newStarred = !metric.starred;
    setMetrics(metrics.map((m) => m.id === metric.id ? { ...m, starred: newStarred } : m));
    try {
      await $updateMetric({ data: { id: metric.id, starred: newStarred } });
    } catch (err) {
      console.error("Failed to update star:", err);
      setMetrics(metrics.map((m) => m.id === metric.id ? { ...m, starred: metric.starred } : m));
    }
  };

  const updateField = async (metric: LiveMetric, field: string, value: unknown) => {
    setMetrics(metrics.map((m) => m.id === metric.id ? { ...m, [field]: value } : m));
    await $updateMetric({ data: { id: metric.id, [field]: value } });
  };

  const deleteRow = async (metric: LiveMetric) => {
    setMetrics(metrics.filter((m) => m.id !== metric.id));
    await $deleteMetric({ data: { id: metric.id } });
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...displayPeriods];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setPeriodOrder(reordered);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left w-8"></th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase min-w-[150px]">Metric</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase w-16">Unit</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase w-16">Target</th>
                {displayPeriods.map((p, idx) => (
                  <th
                    key={p}
                    className="px-1 py-2 text-center text-xs font-semibold text-slate-500 uppercase min-w-[70px] cursor-grab select-none group whitespace-nowrap"
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="whitespace-nowrap">{p}</span>
                      <button onClick={() => deletePeriodColumn(p)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity ml-0.5" title="Remove column">
                        <X className="size-3" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-xs font-semibold text-slate-500 uppercase w-20">Trend</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase w-24">Roll-up</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0 && (
                <tr><td colSpan={7 + displayPeriods.length} className="px-4 py-8 text-center text-slate-400 italic">No metrics added yet. Add a metric row below.</td></tr>
              )}
              {metrics.map((metric) => {
                const periodVals = displayPeriods.map((p) => metric.periodValues[p] ?? null);
                const rvNum = getMetricRollupValue(metric, displayPeriods);
                const rollupVal = formatMetricValue(rvNum, metric.unit);

                return (
                  <tr key={metric.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2">
                      <button onClick={() => toggleStar(metric)} className={metric.starred ? "text-amber-500" : "text-slate-300 hover:text-amber-400"} title="Pin as KPI">
                        <Star className={`size-4 ${metric.starred ? "fill-amber-500" : ""}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2 min-w-[150px] max-w-[220px]">
                      <input
                        className="bg-transparent border-0 outline-none text-sm font-medium w-full whitespace-normal break-words"
                        value={metric.metricName}
                        onChange={(e) => setMetrics(metrics.map((m) => m.id === metric.id ? { ...m, metricName: e.target.value } : m))}
                        onBlur={(e) => updateField(metric, "metricName", e.target.value)}
                      />
                      <input
                        className="bg-transparent border-0 outline-none text-[10px] text-slate-400 w-full mt-0.5"
                        value={metric.description ?? ""}
                        placeholder="Add notes…"
                        onChange={(e) => setMetrics(metrics.map((m) => m.id === metric.id ? { ...m, description: e.target.value } : m))}
                        onBlur={(e) => updateField(metric, "description", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select value={metric.unit} onValueChange={(v) => updateField(metric, "unit", v)}>
                        <SelectTrigger className="h-7 text-xs border-slate-200 w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>{METRIC_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        className="bg-transparent border-0 outline-none text-sm w-14 text-center"
                        value={metric.target ?? ""}
                        placeholder="—"
                        onChange={(e) => setMetrics(metrics.map((m) => m.id === metric.id ? { ...m, target: e.target.value ? Number(e.target.value) : null } : m))}
                        onBlur={(e) => updateField(metric, "target", e.target.value ? Number(e.target.value) : null)}
                      />
                    </td>
                    {displayPeriods.map((p) => (
                      <td key={p} className="px-1 py-2 text-center">
                        <input
                          type="number"
                          className="bg-transparent border border-slate-200 rounded outline-none text-sm w-14 text-center py-1 focus:border-accent-indigo focus:ring-1 focus:ring-accent-indigo/20"
                          value={metric.periodValues[p] ?? ""}
                          placeholder="—"
                          onChange={(e) => {
                            const newVals = { ...metric.periodValues };
                            if (e.target.value) newVals[p] = Number(e.target.value); else delete newVals[p];
                            setMetrics(metrics.map((m) => m.id === metric.id ? { ...m, periodValues: newVals } : m));
                          }}
                          onBlur={() => updateField(metric, "periodValues", metric.periodValues)}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <Sparkline values={periodVals} target={metric.target} direction={metric.direction} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Select value={metric.rollup} onValueChange={(v) => updateField(metric, "rollup", v)}>
                          <SelectTrigger className="h-7 text-xs border-slate-200 w-20"><SelectValue /></SelectTrigger>
                          <SelectContent>{ROLLUP_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                        </Select>
                        <span className={`text-xs font-bold ${(() => {
                          if (rvNum === null || metric.target === null) return metric.starred ? "text-teal-600" : "text-slate-500";
                          const meets = metric.direction === "down" ? rvNum <= metric.target : rvNum >= metric.target;
                          return meets ? "text-teal-600" : "text-red-600";
                        })()}`}>{rollupVal}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => deleteRow(metric)} className="text-slate-300 hover:text-red-500"><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New metric name…" className="flex-1 h-9 text-sm min-w-40" onKeyDown={(e) => e.key === "Enter" && addRow()} />
          <Button size="sm" variant="outline" onClick={addRow} className="gap-1 h-9"><Plus className="size-3" />Add metric</Button>
          <div className="w-px h-6 bg-slate-200 mx-2" />
          <Input value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} placeholder="e.g. Jun-26, W28, Q3" className="w-40 h-9 text-sm" onKeyDown={(e) => e.key === "Enter" && addPeriodColumn()} />
          <Button size="sm" variant="outline" onClick={addPeriodColumn} className="gap-1 h-9"><Plus className="size-3" />Add column</Button>
        </div>
      </div>
      <p className="text-xs text-slate-400">★ Star rows to pin as KPIs. Drag column headers to reorder. Hover column headers to delete. Values save on blur.</p>
    </div>
  );
}

function Sparkline({ values, target, direction }: { values: (number | null)[]; target?: number | null; direction?: string }) {
  const filled = values.filter((v) => v !== null) as number[];
  if (filled.length < 2) return <span className="text-slate-300 text-xs">—</span>;

  const min = Math.min(...filled);
  const max = Math.max(...filled);
  const range = max - min || 1;
  const w = 64;
  const h = 24;
  const pad = 2;
  const points = filled.map((v, i) => {
    const x = pad + (i / (filled.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");

  const last = filled[filled.length - 1];
  const first = filled[0];
  const meetsTarget = target != null
    ? (direction === "down" ? last <= target : last >= target)
    : (direction === "down" ? last <= first : last >= first);
  const color = meetsTarget ? "#10b981" : "#ef4444";

  return (
    <svg width={w} height={h} className="inline-block">
      {target != null && (() => {
        const ty = h - pad - ((target - min) / range) * (h - pad * 2);
        const clampedY = Math.max(pad, Math.min(h - pad, ty));
        return <line x1={pad} y1={clampedY} x2={w - pad} y2={clampedY} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2,2" />;
      })()}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {(() => {
        const lastX = pad + ((filled.length - 1) / (filled.length - 1)) * (w - pad * 2);
        const lastY = h - pad - ((last - min) / range) * (h - pad * 2);
        return <circle cx={lastX} cy={lastY} r="2.5" fill={color} />;
      })()}
    </svg>
  );
}
