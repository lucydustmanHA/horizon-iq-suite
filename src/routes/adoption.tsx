import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { Upload, Plus, Trash2, Pencil, Check, X, TrendingUp, Users, Clock, Zap, AlertTriangle, Info, CalendarRange } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, ReferenceLine } from "recharts";
import { $loadSnapshots, $getSnapshotStats, $getGrowthComparison, $uploadCopilotCsv, $deleteSnapshot, $loadTrainings, $addTraining, $updateTraining, $deleteTraining } from "../lib/adoption.server";
import type { CopilotSnapshot, CopilotStats, GrowthComparison, Training } from "../lib/adoption.server";

/**
 * Period-normalized rate. Every volume number on this page goes through this so a
 * 180-day report and a 28-day report are never compared as raw totals.
 * Returns null (not 0) for a measure the report does not cover.
 */
function perDay(prompts: number | null, days: number): number | null {
  if (prompts == null || !days) return null;
  return Math.round((prompts / days) * 10) / 10;
}

interface TrendPoint {
  date: string;
  periodDays: number;
  scope: "horizon_only" | "all_company";
  horizon: number | null;
  alaska: number | null;
  total: number | null;
  // Per-active-account intensity. This is what makes a 302-account org comparable
  // to a 3,812-account one — absolute volume only ever shows the size difference.
  horizonPerActive: number | null;
  alaskaPerActive: number | null;
  totalPerActive: number | null;
  horizonPromptsRaw: number;
  horizonAccounts: number;
  horizonActive: number;
  alaskaActive: number;
}

/** "volume" = prompts/day (how much). "perActive" = prompts/active account/day (how heavily). */
type ChartMode = "volume" | "perActive";

export const Route = createFileRoute("/adoption")({ component: AdoptionPage });

// ---------------------------------------------------------------------------
// CSV parser (handles quoted fields)
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') { inQ = false; } else { field += ch; } }
    else if (ch === '"') { inQ = true; }
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) { row.push(field); field = ""; if (row.some(c => c.trim())) rows.push(row); row = []; if (ch === "\r") i++; }
    else { field += ch; }
  }
  if (field || row.length) { row.push(field); if (row.some(c => c.trim())) rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

// Module-level cache — survives across navigations so the adoption page
// renders instantly on return visits instead of flashing "Loading…".
let _snapCache: CopilotSnapshot[] | null = null;
let _trainCache: Training[] | null = null;

function AdoptionPage() {
  const [snapshots, setSnapshots] = useState<CopilotSnapshot[]>(_snapCache ?? []);
  const [stats, setStats] = useState<CopilotStats | null>(null);
  const [trainings, setTrainings] = useState<Training[]>(_trainCache ?? []);
  const [selectedSnap, setSelectedSnap] = useState<number | null>(_snapCache?.[0]?.id ?? null);
  const [comparison, setComparison] = useState<GrowthComparison | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState("all");
  // Default to per-account: absolute volume mostly draws the population difference
  // (Alaska is ~17x Horizon), which buries the adoption story. Prompts/day is still
  // one click away, shown in the KPI card, and always in the chart tooltip.
  const [chartMode, setChartMode] = useState<ChartMode>("perActive");
  const [loaded, setLoaded] = useState(_snapCache !== null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Training form
  const [showAdd, setShowAdd] = useState(false);
  const [tDate, setTDate] = useState(""); const [tTitle, setTTitle] = useState("");
  const [tAtt, setTAtt] = useState(""); const [tLen, setTLen] = useState("1"); const [tDesc, setTDesc] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([$loadSnapshots(), $loadTrainings()]).then(([s, t]) => {
      _snapCache = s; _trainCache = t;
      setSnapshots(s); setTrainings(t);
      if (s.length > 0) setSelectedSnap((prev) => prev ?? s[0].id);
      setLoaded(true);
    }).catch((e) => { console.error(e); setLoaded(true); });
  }, []);

  // Keep module cache in sync so returning to this page is instant.
  useEffect(() => { if (snapshots.length > 0) _snapCache = snapshots; }, [snapshots]);
  useEffect(() => { _trainCache = trainings; }, [trainings]);

  useEffect(() => {
    if (selectedSnap == null) { setStats(null); return; }
    const domain = domainFilter === "all" ? undefined : domainFilter;
    $getSnapshotStats({ data: { snapshotId: selectedSnap, domain } }).then(setStats).catch(console.error);
  }, [selectedSnap, domainFilter]);

  const currentSnap = snapshots.find((s) => s.id === selectedSnap) ?? null;

  /**
   * Baseline selection — prefers an EQUAL-LENGTH window.
   *
   * Comparing a 28-day file against a 180-day file is what produced the old
   * headline figures. So we pick the most recent EARLIER report covering the same
   * number of days, which needs no normalization to be valid. This also makes the
   * page self-maintaining: drop in another 28-day export like the Oct 7 one and it
   * automatically becomes the current period, compared against the previous 28-day
   * report rather than against whatever happens to be oldest.
   *
   * Only when no equal-length report exists do we fall back to the nearest earlier
   * report — and in that case the UI leads with a per-day rate, never a raw total.
   */
  const baselineSnap = useMemo(() => {
    if (!currentSnap) return null;
    const earlier = snapshots
      .filter((s) => s.id !== currentSnap.id && s.reportDate < currentSnap.reportDate)
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    return earlier.find((s) => s.reportPeriodDays === currentSnap.reportPeriodDays) ?? earlier[0] ?? null;
  }, [snapshots, currentSnap]);

  useEffect(() => {
    if (!currentSnap || !baselineSnap) { setComparison(null); return; }
    $getGrowthComparison({ data: { currentId: currentSnap.id, baselineId: baselineSnap.id } })
      .then(setComparison)
      .catch((err) => { console.error(err); setComparison(null); });
  }, [currentSnap?.id, baselineSnap?.id]);

  /**
   * The growth measures, kept separate and separately labelled:
   *  - windowPct    : like-for-like total change. Only defined for equal windows.
   *  - dailyFactor  : daily-average multiple. Valid across unequal windows, but it
   *                   includes roster growth, so it is NOT per-user growth.
   *  - cohort*      : same-account change, which strips roster growth out entirely.
   */
  const headline = useMemo(() => {
    if (!comparison || comparison.baselinePrompts <= 0) return null;
    const c = comparison;
    const baseRate = c.baselinePrompts / c.baselinePeriodDays;
    const curRate = c.currentPrompts / c.currentPeriodDays;
    return {
      equalWindow: c.equalWindow,
      windowPct: c.equalWindow ? (c.currentPrompts / c.baselinePrompts - 1) * 100 : null,
      dailyFactor: Math.round((curRate / baseRate) * 100) / 100,
      baseRate: Math.round(baseRate * 10) / 10,
      curRate: Math.round(curRate * 10) / 10,
      cohortPct: c.cohortBaselinePrompts > 0 ? (c.cohortCurrentPrompts / c.cohortBaselinePrompts - 1) * 100 : null,
      cohortDailyFactor: c.cohortBaselinePrompts > 0
        ? Math.round(((c.cohortCurrentPrompts / c.currentPeriodDays) / (c.cohortBaselinePrompts / c.baselinePeriodDays)) * 100) / 100
        : null,
    };
  }, [comparison]);

  /**
   * Every KPI card is stamped with the population it actually measures, so an
   * all-company card can never sit silently beside a Horizon-only headline.
   */
  const scopeLabel = !currentSnap ? null
    : domainFilter === "horizonair.com" ? "Horizon"
    : domainFilter === "alaskaair.com" ? "Alaska"
    : currentSnap.scope === "horizon_only" ? "Horizon only (file covers no other org)"
    : "All orgs";

  // When the active filter matches nothing in this file, show dashes rather than 0.
  const noData = !stats || stats.matchedRows === 0;

  // Training aggregates
  const trainingStats = useMemo(() => {
    let totalAttendees = 0;
    let personHours = 0;
    for (const t of trainings) {
      const att = Number(t.attendees) || 0;
      const hrs = Number(t.lengthHours) || 0;
      totalAttendees += att;
      personHours += att * hrs;
    }
    return { sessions: trainings.length, totalAttendees, personHours: Math.round(personHours * 10) / 10 };
  }, [trainings]);

  // Trend data from all snapshots (sorted by date ascending)
  const trendData = useMemo<TrendPoint[]>(() =>
    [...snapshots].sort((a, b) => a.reportDate.localeCompare(b.reportDate)).map((s) => ({
      date: s.reportDate,
      periodDays: s.reportPeriodDays,
      scope: s.scope,
      // Horizon appears in every export, so this series is always continuous.
      horizon: perDay(s.horizonPrompts, s.reportPeriodDays),
      // null — NOT 0 — so recharts draws a GAP. A Horizon-only export simply has
      // nothing to say about Alaska; plotting 0 would assert Alaska sent no prompts.
      alaska: s.alaskaAccounts > 0 ? perDay(s.alaskaPrompts, s.reportPeriodDays) : null,
      total: s.scope === "all_company" ? perDay(s.totalPrompts, s.reportPeriodDays) : null,
      // Per-active-account rates: divide by the accounts that actually reported usage,
      // then by the window length. Nulls propagate exactly as above, so a measure the
      // report does not cover stays a gap rather than becoming a zero.
      horizonPerActive: s.horizonActiveAccounts > 0
        ? Math.round((s.horizonPrompts / s.horizonActiveAccounts / s.reportPeriodDays) * 100) / 100
        : null,
      alaskaPerActive: s.alaskaPrompts != null && s.alaskaActiveAccounts > 0
        ? Math.round((s.alaskaPrompts / s.alaskaActiveAccounts / s.reportPeriodDays) * 100) / 100
        : null,
      totalPerActive: s.scope === "all_company" && s.activeUsers > 0
        ? Math.round((s.totalPrompts / s.activeUsers / s.reportPeriodDays) * 100) / 100
        : null,
      horizonPromptsRaw: s.horizonPrompts,
      horizonAccounts: s.horizonAccounts,
      horizonActive: s.horizonActiveAccounts,
      alaskaActive: s.alaskaActiveAccounts,
    })),
  [snapshots]);

  const horizonOnlyDates = useMemo(
    () => snapshots.filter((s) => s.scope === "horizon_only").map((s) => s.reportDate).sort(),
    [snapshots]);

  // CSV upload handler
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const rawText = await file.text();
      // Strip UTF-8 BOM and any leading/trailing whitespace
      const text = rawText.replace(/^\uFEFF/, "").replace(/^\s+/, "");
      const parsed = parseCsv(text);
      if (parsed.length < 2) { alert("CSV appears empty"); setUploading(false); return; }
      const hdr = parsed[0].map((h) => h.trim().replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "").toLowerCase());
      const emailIdx = hdr.findIndex((h) => h.includes("user principal") || h.includes("userprincipalname") || h.includes("user email"));
      const nameIdx = hdr.findIndex((h) => h.includes("display name") || h.includes("displayname"));
      const lastActIdx = hdr.findIndex((h) => h.includes("last activity date") && !h.includes("copilot") && !h.includes("utc"));
      const periodIdx = hdr.findIndex((h) => h.includes("report period"));
      const refreshIdx = hdr.findIndex((h) => h.includes("report refresh") || h.includes("reportrefreshdate"));
      const allIdx = hdr.findIndex((h) => h.includes("all apps") && (h.includes("prompts") || h.includes("submitted")));
      const workIdx = hdr.findIndex((h) => h.includes("chat (work)") || (h.includes("work") && h.includes("prompts")));
      const webIdx = hdr.findIndex((h) => h.includes("chat (web)") || (h.includes("web") && h.includes("prompts")));
      const daysIdx = hdr.findIndex((h) => h.includes("active usage days") || h.includes("activeusagedays"));

      if (emailIdx < 0 || allIdx < 0) { alert(`Could not find required columns.\n\nDetected headers (${hdr.length}):\n${hdr.slice(0, 10).map((h, i) => `${i}: "${h}"`).join("\n")}\n\nNeed: User Principal Name + Prompts for All Apps`); setUploading(false); return; }

      const reportDate = refreshIdx >= 0 && parsed[1][refreshIdx] ? parsed[1][refreshIdx].trim() : new Date().toISOString().split("T")[0];
      const periodDays = periodIdx >= 0 && parsed[1][periodIdx] ? Number(parsed[1][periodIdx].trim()) || 28 : 28;

      const rows = parsed.slice(1).map((r) => ({
        email: (r[emailIdx] ?? "").trim(),
        name: nameIdx >= 0 ? (r[nameIdx] ?? "").trim() : "",
        lastActivity: lastActIdx >= 0 ? (r[lastActIdx] ?? "").trim() : "",
        promptsAll: Number((r[allIdx] ?? "0").trim()) || 0,
        promptsWork: workIdx >= 0 ? Number((r[workIdx] ?? "0").trim()) || 0 : 0,
        promptsWeb: webIdx >= 0 ? Number((r[webIdx] ?? "0").trim()) || 0 : 0,
        activeDays: daysIdx >= 0 ? Number((r[daysIdx] ?? "0").trim()) || 0 : 0,
      }));
      // Deliberately NOT filtered here — $uploadCopilotCsv owns summary-row removal
      // and de-duplication, so the counts it reports back are authoritative.

      // Guard against loading the same reporting period twice, which is the usual
      // cause of a phantom jump in the trend line.
      const dupe = snapshots.find((s) => s.reportDate === reportDate && s.reportPeriodDays === periodDays);
      if (dupe && !confirm(`A ${periodDays}-day report dated ${reportDate} is already loaded${dupe.filename ? ` (${dupe.filename})` : ""}.\n\nLoad this file as an additional snapshot anyway?`)) {
        setUploading(false); e.target.value = ""; return;
      }

      const result = await $uploadCopilotCsv({ data: { filename: file.name, reportDate, periodDays, rows } });
      const refreshed = await $loadSnapshots();
      setSnapshots(refreshed);
      setSelectedSnap(result.snapshotId);

      // Tell the user exactly what was ingested and how it was classified, so a
      // mis-scoped or double-counted file is caught at upload time.
      const loadedSnap = refreshed.find((s) => s.id === result.snapshotId);
      setUploadNote([
        `${reportDate} · ${periodDays}-day window`,
        `${result.inserted.toLocaleString()} account rows loaded`,
        loadedSnap ? (loadedSnap.scope === "horizon_only" ? "detected scope: Horizon-only export" : "detected scope: all-company export") : null,
        result.summaryRowsDropped > 0 ? `${result.summaryRowsDropped} summary/total row(s) excluded` : null,
        result.duplicatesDropped > 0 ? `${result.duplicatesDropped} duplicate account row(s) collapsed` : null,
      ].filter(Boolean).join(" · "));
    } catch (err) { console.error(err); alert("Upload failed: " + String(err)); }
    setUploading(false);
    e.target.value = "";
  };

  const handleDeleteSnap = async (id: number) => {
    if (!confirm("Delete this upload? All usage data for this period will be removed.")) return;
    await $deleteSnapshot({ data: { id } });
    const refreshed = await $loadSnapshots();
    setSnapshots(refreshed);
    setSelectedSnap(refreshed.length > 0 ? refreshed[0].id : null);
  };

  // Training handlers
  const handleAddTraining = async () => {
    if (!tTitle.trim() || !tDate) return;
    const t = await $addTraining({ data: { trainingDate: tDate, title: tTitle.trim(), attendees: Number(tAtt) || 0, lengthHours: Number(tLen) || 1, description: tDesc.trim() } });
    setTrainings((prev) => [t, ...prev]);
    setTDate(""); setTTitle(""); setTAtt(""); setTLen("1"); setTDesc(""); setShowAdd(false);
  };
  const handleDeleteTraining = async (id: number) => {
    setTrainings((prev) => prev.filter((t) => t.id !== id));
    await $deleteTraining({ data: { id } });
  };

  if (!loaded) return <div className="flex items-center justify-center h-screen"><p className="text-slate-400">Loading AI Adoption data…</p></div>;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Adoption</h1>
          <p className="text-sm text-slate-500 mt-1">Copilot usage, training impact, and AI literacy metrics. Volume is period-normalized; each report's scope is detected from its own contents.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="h-9 text-sm w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orgs</SelectItem>
              <SelectItem value="horizonair.com">Horizon Only</SelectItem>
              <SelectItem value="alaskaair.com">Alaska Only</SelectItem>
            </SelectContent>
          </Select>
          {snapshots.length > 1 && (
            <Select value={String(selectedSnap ?? "")} onValueChange={(v) => setSelectedSnap(Number(v))}>
              <SelectTrigger className="h-9 text-sm w-48"><SelectValue placeholder="Select period" /></SelectTrigger>
              <SelectContent>
                {snapshots.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.reportDate} ({s.reportPeriodDays}d)</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" className="gap-1.5 h-9" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="size-4" />{uploading ? "Uploading…" : "Upload Copilot CSV"}
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* Upload result note */}
      {uploadNote && (
        <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 text-teal-900 rounded-lg px-4 py-2.5 text-xs">
          <Check className="size-4 shrink-0 mt-0.5" />
          <span className="flex-1">{uploadNote}</span>
          <button onClick={() => setUploadNote(null)} className="text-teal-500 hover:text-teal-800"><X className="size-3.5" /></button>
        </div>
      )}

      {/* Scope warning — a file that looks all-company but is mostly Horizon */}
      {currentSnap?.scopeWarning && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-2.5 text-xs">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>{currentSnap.scopeWarning}</span>
        </div>
      )}

      {/* Growth callout — three separately-labelled, period-aware measures */}
      {headline && comparison && currentSnap && baselineSnap && (
        <div className="bg-gradient-to-r from-teal-700 to-teal-900 text-white rounded-xl px-6 py-4">
          <div className="flex items-start gap-3">
            <TrendingUp className="size-6 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              {headline.equalWindow ? (
                <p className="text-sm font-medium">
                  Horizon Copilot prompts {headline.windowPct! >= 0 ? "rose" : "fell"}{" "}
                  <span className="font-bold">{Math.abs(headline.windowPct!).toFixed(2)}%</span>{" "}
                  between the {baselineSnap.reportPeriodDays}-day windows ending {baselineSnap.reportDate} and {currentSnap.reportDate}
                  <span className="ml-1.5 text-white/70 font-normal">
                    ({comparison.baselinePrompts.toLocaleString()} → {comparison.currentPrompts.toLocaleString()} prompts)
                  </span>
                </p>
              ) : (
                <p className="text-sm font-medium">
                  Horizon Copilot volume went from <span className="font-bold">{headline.baseRate.toLocaleString()}</span> to{" "}
                  <span className="font-bold">{headline.curRate.toLocaleString()}</span> prompts per day
                  <span className="ml-1.5 bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">{headline.dailyFactor}× daily rate</span>
                </p>
              )}

              <p className="text-xs text-white/80">
                {comparison.commonAccounts > 0 && headline.cohortPct != null && (
                  <>
                    Among the <span className="font-semibold">{comparison.commonAccounts.toLocaleString()}</span> accounts present in both reports:{" "}
                    <span className="font-semibold">
                      {headline.equalWindow
                        ? `${headline.cohortPct >= 0 ? "+" : ""}${headline.cohortPct.toFixed(2)}%`
                        : `${headline.cohortDailyFactor}× per day`}
                    </span>
                    {". "}
                  </>
                )}
                Reporting accounts {comparison.baselineAccounts.toLocaleString()} → {comparison.currentAccounts.toLocaleString()}
                {comparison.newAccounts > 0 && <> ({comparison.newAccounts} new, contributing {comparison.newAccountPrompts.toLocaleString()} prompts)</>}.
              </p>

              {!headline.equalWindow && (
                <p className="text-[11px] text-white/70 flex items-start gap-1.5">
                  <Info className="size-3.5 shrink-0 mt-0.5" />
                  <span>
                    The two reports cover different windows ({baselineSnap.reportPeriodDays}d vs {currentSnap.reportPeriodDays}d), so this is a
                    daily average — not a calendar-month total — and it reflects more accounts reporting, not just heavier use per person.
                    Load another {currentSnap.reportPeriodDays}-day report to get a like-for-like comparison.
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* "Not measured" notice — shown instead of zero-filled cards */}
      {currentSnap && noData && (
        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-4 py-2.5 text-xs">
          <Info className="size-4 shrink-0 mt-0.5" />
          <span>
            The {currentSnap.reportDate} report contains no {domainFilter === "alaskaair.com" ? "Alaska" : "matching"} accounts — it is a Horizon-only export.
            The cards below read "—" rather than 0 because this report does not measure that population.
          </span>
        </div>
      )}

      {/* KPI Cards — all five on one row once there is room, wrapping 2-up then 3-up below that */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          icon={Zap}
          label="PROMPTS IN WINDOW"
          value={noData ? null : stats!.totalPrompts}
          format="number"
          scope={scopeLabel}
          sub={currentSnap ? `${currentSnap.reportPeriodDays}-day window ending ${currentSnap.reportDate}` : "Upload a report to get started"}
        />
        <KpiCard
          icon={CalendarRange}
          label="PROMPTS / DAY"
          value={noData || !currentSnap ? null : stats!.totalPrompts / currentSnap.reportPeriodDays}
          format="decimal"
          scope={scopeLabel}
          sub="period-normalized — the figure to compare across reports"
        />
        <KpiCard
          icon={Users}
          label="ACTIVE ACCOUNTS"
          value={noData ? null : stats!.activeUsers}
          format="number"
          scope={scopeLabel}
          sub={noData ? "\u2014" : `of ${stats!.totalUsers.toLocaleString()} accounts in this report (not a license count)`}
        />
        <KpiCard
          icon={TrendingUp}
          label="PROMPTS / ACCT / DAY"
          value={noData || !currentSnap || stats!.activeUsers === 0 ? null : stats!.totalPrompts / stats!.activeUsers / currentSnap.reportPeriodDays}
          format="decimal"
          scope={scopeLabel}
          sub={noData || !currentSnap ? "\u2014" : `${(stats!.avgPromptsPerUser).toFixed(1)} per ${currentSnap.reportPeriodDays}-day window`}
        />
        {/* Training sits in the same row but carries no scope badge — it is not a
            Copilot usage measure and is not affected by the org filter. */}
        <KpiCard icon={Clock} label="TRAINING PERSON-HRS" value={trainingStats.personHours} format="number" sub={`${trainingStats.sessions} session${trainingStats.sessions !== 1 ? "s" : ""} \u00b7 ${trainingStats.totalAttendees.toLocaleString()} total attendees`} />
      </div>

      {/* Trend Chart */}
      {trendData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1 gap-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {chartMode === "volume" ? "Prompts Per Day (period-normalized)" : "Prompts Per Active Account Per Day"}
            </p>
            {/* Volume answers "how much". Per-account answers "how heavily" — the only fair
                way to read a 302-account org against a 3,812-account one on one axis. */}
            <div className="flex rounded-md border border-slate-200 overflow-hidden shrink-0">
              {([["volume", "Volume"], ["perActive", "Per account"]] as const).map(([m, lbl]) => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${chartMode === m ? "bg-teal-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          {trendData.length === 1 && <p className="text-[10px] text-slate-400 italic mb-1">Upload more reports to see the trend line grow</p>}
          <p className="text-[11px] text-slate-400 mb-3">
            {chartMode === "volume"
              ? "Each point divides that report's prompts by its own window length, so a 180-day file and a 28-day file sit on the same scale. Org lines reflect very different population sizes — switch to Per account to compare adoption fairly."
              : "Each point divides prompts by the accounts that actually reported usage, then by the window length. This removes the population-size difference, so Horizon and Alaska can be read against each other directly."}
            {" "}Hover any point to see both prompts/day and prompts per account.
          </p>
          {currentSnap && (
            <div className="flex items-center gap-4 mb-2 text-[11px] font-medium">
              <span className="text-teal-700">
                Horizon: {perDay(currentSnap.horizonPrompts, currentSnap.reportPeriodDays)?.toLocaleString() ?? "\u2014"} prompts/day
              </span>
              {currentSnap.alaskaActiveAccounts > 0 && (
                <span className="text-[#0b3d91]">
                  Alaska: {perDay(currentSnap.alaskaPrompts, currentSnap.reportPeriodDays)?.toLocaleString() ?? "\u2014"} prompts/day
                </span>
              )}
            </div>
          )}
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              {/* One axis only. A dual axis carrying the same unit invites misreading and
                  lets any visual story be manufactured by rescaling; the mode toggle
                  removes the need for it. */}
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false}
                tickFormatter={(v: number) => chartMode === "volume"
                  ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))
                  : v.toFixed(1)} />
              <Tooltip content={<TrendTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              {/* connectNulls={false} is what turns a missing measure into a visible GAP
                  instead of a line dropping to zero. Every series honours the org filter,
                  so selecting one org never leaves another org's line on the chart. */}
              {(domainFilter === "all" || domainFilter === "horizonair.com") &&
                <Line type="monotone" dataKey={chartMode === "volume" ? "horizon" : "horizonPerActive"} name={chartMode === "volume" ? "Horizon / day" : "Horizon / acct / day"} stroke="#419dab" strokeWidth={2.5} dot={{ r: 4, fill: "#419dab" }} activeDot={{ r: 6 }} connectNulls={false} />}
              {(domainFilter === "all" || domainFilter === "alaskaair.com") &&
                <Line type="monotone" dataKey={chartMode === "volume" ? "alaska" : "alaskaPerActive"} name={chartMode === "volume" ? "Alaska / day" : "Alaska / acct / day"} stroke="#0b3d91" strokeWidth={2.5} dot={{ r: 4, fill: "#0b3d91" }} activeDot={{ r: 6 }} connectNulls={false} />}
              {domainFilter === "all" &&
                <Line type="monotone" dataKey={chartMode === "volume" ? "total" : "totalPerActive"} name={chartMode === "volume" ? "All orgs / day" : "All orgs / acct / day"} stroke="#64748b" strokeWidth={1.5} strokeDasharray="5 5" dot={{ r: 3, fill: "#64748b" }} connectNulls={false} />}
            </LineChart>
          </ResponsiveContainer>
          {horizonOnlyDates.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1.5">
              <Info className="size-3.5 shrink-0 mt-0.5 text-slate-400" />
              <span>
                The Alaska and All-orgs lines break at {horizonOnlyDates.join(", ")} because those reports are Horizon-only exports.
                A gap means <em>not measured</em> — which is not the same as zero usage.
              </span>
            </p>
          )}
        </div>
      )}

      {/* Snapshot cards */}
      {snapshots.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 space-y-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Uploaded Reports</p>
          <div className="flex flex-wrap gap-2">
            {snapshots.map((s) => (
              <div key={s.id} className={`group flex items-center gap-2 border rounded-lg px-3 py-2 transition-colors cursor-pointer ${s.id === selectedSnap ? "border-teal-400 bg-teal-50" : "border-slate-200 hover:border-teal-300"}`} onClick={() => setSelectedSnap(s.id)}>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-700">{s.reportDate}</span>
                    <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border font-semibold ${s.scope === "horizon_only" ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {s.scope === "horizon_only" ? "Horizon only" : "All orgs"}
                    </span>
                    <span className="text-[9px] text-slate-400">{s.reportPeriodDays}d</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {s.horizonPrompts.toLocaleString()} Horizon prompts · {perDay(s.horizonPrompts, s.reportPeriodDays)}/day · {s.horizonActiveAccounts} active
                  </span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteSnap(s.id); }} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all" title="Delete">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {snapshots.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <Upload className="size-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No Copilot data yet</p>
          <p className="text-slate-400 text-sm mt-1 mb-4">Upload a Microsoft Copilot Activity CSV to see usage metrics and org breakdowns.</p>
          <Button variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Upload CSV
          </Button>
        </div>
      )}

      {/* Training Log */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Training Log</p>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? <><X className="size-3" /> Cancel</> : <><Plus className="size-3" /> Add Session</>}
          </Button>
        </div>

        {showAdd && (
          <div className="px-5 pb-3 flex flex-wrap gap-2 items-end border-b border-slate-100">
            <div><label className="text-[10px] text-slate-500 block mb-0.5">Date</label><Input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} className="h-8 text-sm w-32" /></div>
            <div className="flex-1 min-w-48"><label className="text-[10px] text-slate-500 block mb-0.5">Title</label><Input value={tTitle} onChange={(e) => setTTitle(e.target.value)} placeholder="Meeting title" className="h-8 text-sm" /></div>
            <div><label className="text-[10px] text-slate-500 block mb-0.5">Attendees</label><Input type="number" value={tAtt} onChange={(e) => setTAtt(e.target.value)} className="h-8 text-sm w-20" /></div>
            <div><label className="text-[10px] text-slate-500 block mb-0.5">Hours</label><Input type="number" step="0.25" value={tLen} onChange={(e) => setTLen(e.target.value)} className="h-8 text-sm w-20" /></div>
            <div className="flex-1 min-w-48"><label className="text-[10px] text-slate-500 block mb-0.5">Description</label><Input value={tDesc} onChange={(e) => setTDesc(e.target.value)} placeholder="Notes" className="h-8 text-sm" /></div>
            <Button size="sm" className="h-8 bg-teal-700 hover:bg-teal-800 text-white gap-1" onClick={handleAddTraining} disabled={!tTitle.trim() || !tDate}><Check className="size-3" /> Save</Button>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-5 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase">Date</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase">Meeting Title</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase"># Attendees</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase">Length (hrs)</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase">Description</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {trainings.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-sm">No training sessions recorded yet. Click "Add Session" to start tracking.</td></tr>
            )}
            {trainings.map((t) => (
              <TrainingRow key={t.id} training={t} onDelete={() => handleDeleteTraining(t.id)} onUpdate={async (patch) => { await $updateTraining({ data: { id: t.id, ...patch } }); const refreshed = await $loadTrainings(); setTrainings(refreshed); }} />
            ))}
          </tbody>
        </table>
        {trainings.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-6 text-xs text-slate-500 bg-slate-50">
            <span><strong className="text-slate-700">{trainingStats.sessions}</strong> sessions</span>
            <span><strong className="text-slate-700">{trainingStats.totalAttendees.toLocaleString()}</strong> total attendees</span>
            <span><strong className="text-slate-700">{trainingStats.personHours.toLocaleString()}</strong> person-hours</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function KpiCard({ icon: Icon, label, value, format, sub, scope }: { icon: React.ElementType; label: string; value: number | null; format: "number" | "decimal"; sub: string; scope?: string | null }) {
  // null renders an em dash: the measure is not covered by this report, not zero.
  const display = value == null ? "\u2014" : format === "decimal" ? value.toFixed(1) : value.toLocaleString();
  return (
    // p-4 until xl so five cards still breathe at ~1024px wide.
    <div className="bg-white border border-slate-200 rounded-xl p-4 xl:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="size-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0"><Icon className="size-4 text-teal-600" /></div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${value == null ? "text-slate-300" : "text-slate-900"}`}>{display}</p>
      {scope && <p className="text-[9px] uppercase tracking-wide text-slate-400 mt-1 font-semibold">Scope: {scope}</p>}
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

/**
 * Maps either mode's dataKey back to the org it represents, so the tooltip can show
 * the volume AND per-account figure for that org no matter which mode is active.
 */
const SERIES_META: Record<string, { label: string; volume: keyof TrendPoint; perActive: keyof TrendPoint }> = {
  horizon: { label: "Horizon", volume: "horizon", perActive: "horizonPerActive" },
  horizonPerActive: { label: "Horizon", volume: "horizon", perActive: "horizonPerActive" },
  alaska: { label: "Alaska", volume: "alaska", perActive: "alaskaPerActive" },
  alaskaPerActive: { label: "Alaska", volume: "alaska", perActive: "alaskaPerActive" },
  total: { label: "All orgs", volume: "total", perActive: "totalPerActive" },
  totalPerActive: { label: "All orgs", volume: "total", perActive: "totalPerActive" },
};

/**
 * Chart tooltip that states the window length and scope of the hovered report, and
 * says "not covered by this report" for a missing measure rather than showing 0.
 */
function TrendTooltip({ active, payload, label }: {
  active?: boolean;
  label?: string;
  payload?: { name: string; value: number | null; color: string; dataKey: string; payload: TrendPoint }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs space-y-1">
      <p className="font-semibold text-slate-700">{label}</p>
      <p className="text-[11px] text-slate-400">
        {row.periodDays}-day window · {row.scope === "horizon_only" ? "Horizon-only export" : "all-company export"}
      </p>
      {/* Always show BOTH measures per org, whichever mode the chart is in — the
          absolute per-day volume stays visible without needing a second axis. */}
      {payload.map((p) => {
        const meta = SERIES_META[p.dataKey];
        if (!meta) return null;
        const vol = row[meta.volume] as number | null;
        const per = row[meta.perActive] as number | null;
        return (
          <p key={p.dataKey} style={{ color: p.color }}>
            <span className="font-semibold">{meta.label}</span>{": "}
            {vol == null && per == null ? (
              <span className="text-slate-400 italic">not covered by this report</span>
            ) : (
              <>
                {vol == null ? "\u2014" : vol.toLocaleString()} /day
                <span className="text-slate-400">{" · "}</span>
                {per == null ? "\u2014" : per.toFixed(2)} /acct/day
              </>
            )}
          </p>
        );
      })}
      <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
        Horizon total in window: {row.horizonPromptsRaw.toLocaleString()} across {row.horizonAccounts.toLocaleString()} accounts
        {row.horizonActive !== row.horizonAccounts && <> ({row.horizonActive.toLocaleString()} active)</>}
      </p>
    </div>
  );
}

function TrainingRow({ training: t, onDelete, onUpdate }: { training: Training; onDelete: () => void; onUpdate: (patch: Partial<Training>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState(t.trainingDate); const [ti, setTi] = useState(t.title);
  const [at, setAt] = useState(String(t.attendees)); const [ln, setLn] = useState(String(t.lengthHours)); const [ds, setDs] = useState(t.description);
  useEffect(() => { setD(t.trainingDate); setTi(t.title); setAt(String(t.attendees)); setLn(String(t.lengthHours)); setDs(t.description); }, [t]);
  const save = async () => {
    await onUpdate({ trainingDate: d, title: ti, attendees: Number(at) || 0, lengthHours: Number(ln) || 1, description: ds });
    setEditing(false);
  };
  const fmtDate = (iso: string) => { const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }); };
  if (editing) return (
    <tr className="border-b border-slate-100 bg-teal-50/30">
      <td className="px-5 py-2"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} className="h-7 text-xs w-28" /></td>
      <td className="px-3 py-2"><Input value={ti} onChange={(e) => setTi(e.target.value)} className="h-7 text-xs" /></td>
      <td className="px-3 py-2"><Input type="number" value={at} onChange={(e) => setAt(e.target.value)} className="h-7 text-xs w-16 text-right" /></td>
      <td className="px-3 py-2"><Input type="number" step="0.25" value={ln} onChange={(e) => setLn(e.target.value)} className="h-7 text-xs w-16 text-right" /></td>
      <td className="px-3 py-2"><Input value={ds} onChange={(e) => setDs(e.target.value)} className="h-7 text-xs" /></td>
      <td className="px-3 py-2 flex gap-1"><button onClick={save} className="text-teal-600 hover:text-teal-800"><Check className="size-4" /></button><button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600"><X className="size-4" /></button></td>
    </tr>
  );
  return (
    <tr className="border-b border-slate-100 group hover:bg-slate-50 transition-colors">
      <td className="px-5 py-2.5 text-slate-600">{fmtDate(t.trainingDate)}</td>
      <td className="px-3 py-2.5 font-medium text-slate-800">{t.title}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{t.attendees}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{t.lengthHours}</td>
      <td className="px-3 py-2.5 text-slate-500">{t.description}</td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-accent-indigo"><Pencil className="size-3.5" /></button>
          <button onClick={onDelete} className="text-slate-400 hover:text-red-500"><Trash2 className="size-3.5" /></button>
        </div>
      </td>
    </tr>
  );
}
