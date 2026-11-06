
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { usePortfolio } from "../lib/store";
import { $upsertSettingOption, $removeSettingOption, $saveAppName } from "../lib/settings.server";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Plus, X, Moon, Sun, SlidersHorizontal, Sparkles, Target, DollarSign } from "lucide-react";
import { CostsPanel } from "../components/costs-panel";
import { STRATEGY_DEFAULTS, STRATEGY_SETTING_KEYS } from "../lib/strategy-types";

const TABS = [
  { key: "general", label: "General", icon: SlidersHorizontal, desc: "App name and appearance for everyone." },
  { key: "ai", label: "AI & Automation", icon: Sparkles, desc: "Dropdown options used on use cases. Changes apply everywhere immediately." },
  { key: "strategy", label: "Strategy", icon: Target, desc: "Departments, priorities, plan years, and deep-dive areas used across Strategy." },
  { key: "costs", label: "Costs & Usage", icon: DollarSign, desc: "What it costs to run this app on Databricks." },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabKey } => {
    const t = search.tab as string | undefined;
    return TABS.some((x) => x.key === t) ? { tab: t as TabKey } : {};
  },
  component: SettingsPage,
});

const SECTIONS = [
  { key: "workgroup",       label: "Workgroup" },
  { key: "business_area",  label: "Business Area" },
  { key: "strategic_focus",label: "Strategic Focus" },
  { key: "grouping",       label: "Grouping" },
  { key: "vendor",         label: "Vendor" },
  { key: "solution_type",  label: "Solution Type" },
  { key: "time_saved_unit",label: "Time Saved Units" },
] as const;

function OptionList({ settingKey, label }: { settingKey: string; label: string }) {
  const { settings, addSettingOption, removeSettingOption } = usePortfolio();
  const options = settings[settingKey] ?? [];
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || options.includes(v)) return;
    addSettingOption(settingKey, v);
    $upsertSettingOption({ data: { key: settingKey, value: v } }).catch(console.error);
    setDraft("");
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{label}</h3>
      <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
        {options.map((o) => (
          <span key={o} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full group">
            {o}
            <button onClick={() => { removeSettingOption(settingKey, o); $removeSettingOption({ data: { key: settingKey, value: o } }).catch(console.error); }} className="text-slate-400 hover:text-status-danger transition-colors opacity-0 group-hover:opacity-100 ml-0.5">
              <X className="size-3" />
            </button>
          </span>
        ))}
        {options.length === 0 && <p className="text-xs text-slate-400 italic">No options yet</p>}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add new ${label.toLowerCase()} option…`}
          className="h-8 text-sm flex-1"
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="sm" variant="outline" className="h-8 px-3 gap-1" onClick={add} disabled={!draft.trim() || options.includes(draft.trim())}>
          <Plus className="size-3" /> Add
        </Button>
      </div>
    </div>
  );
}

function DarkModeToggle() {
  const darkMode = usePortfolio((s) => s.darkMode);
  const setDarkMode = usePortfolio((s) => s.setDarkMode);
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Appearance</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Switch between light and dark mode for the entire app.</p>
      <button
        onClick={() => setDarkMode(!darkMode)}
        className={`flex items-center gap-3 w-full rounded-lg border-2 p-4 transition-all ${
          darkMode
            ? "border-accent-indigo bg-slate-800 text-white"
            : "border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300"
        }`}
      >
        {darkMode ? <Moon className="size-5" /> : <Sun className="size-5" />}
        <div className="text-left">
          <p className="text-sm font-medium">{darkMode ? "Dark Mode" : "Light Mode"}</p>
          <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            {darkMode ? "Click to switch to light mode" : "Click to switch to dark mode"}
          </p>
        </div>
        <div className={`ml-auto w-10 h-6 rounded-full relative transition-colors ${
          darkMode ? "bg-accent-indigo" : "bg-slate-300"
        }`}>
          <div className={`absolute top-1 size-4 rounded-full bg-white shadow transition-transform ${
            darkMode ? "translate-x-5" : "translate-x-1"
          }`} />
        </div>
      </button>
    </div>
  );
}

const APP_NAMES = [
  { value: "Horizon QX", label: "Horizon QX", desc: "The OG. Where it all started." },
  { value: "Waypoint", label: "Waypoint", desc: "Every stage is a waypoint on the flight plan." },
  { value: "Trellis", label: "Trellis", desc: "A structure that helps innovation grow." },
  { value: "Stoke", label: "Stoke", desc: "Fuel what's next." },
  { value: "Prism", label: "Prism", desc: "Every angle of innovation." },
  { value: "Onyx", label: "Onyx", desc: "Sharp. Premium. Serious operators only." },
  { value: "Lumen", label: "Lumen", desc: "Bringing light to buried work." },
  { value: "Arcline", label: "Arcline", desc: "The arc from inception to impact." },
  { value: "Scount", label: "Scount", desc: "It's not a typo. It's a lifestyle. 🐾" },
] as const;

function AppNamePicker() {
  const appName = usePortfolio((s) => s.appName ?? "Horizon QX");
  const setAppName = usePortfolio((s) => s.setAppName);
  const handleSelect = (name: string) => {
    setAppName(name);
    $saveAppName({ data: { name } }).catch(console.error);
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">App Name</h3>
      <p className="text-xs text-slate-500 mb-4">What should we call this thing? Pick a name — it updates the sidebar instantly.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {APP_NAMES.map((n) => (
          <button key={n.value} onClick={() => handleSelect(n.value)}
            className={`text-left rounded-lg border-2 p-3 transition-all ${appName === n.value ? "border-accent-indigo bg-indigo-50/50" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
            <p className={`text-sm font-semibold ${appName === n.value ? "text-accent-indigo" : "text-slate-800"}`}>{n.label}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{n.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Strategy list setting. Until someone edits a list it uses the built-in defaults;
 * the first edit saves the defaults plus the change so nothing silently disappears.
 */
function StrategyOptionList({ settingKey, label, hint, numeric }: { settingKey: string; label: string; hint?: string; numeric?: boolean }) {
  const { settings, addSettingOption, removeSettingOption } = usePortfolio();
  const saved = settings[settingKey] ?? [];
  const usingDefaults = saved.length === 0;
  const options = usingDefaults ? (STRATEGY_DEFAULTS[settingKey] ?? []) : saved;
  const [draft, setDraft] = useState("");
  const persistDefaults = (skip?: string) => {
    if (!usingDefaults) return;
    for (const o of options) if (o !== skip) { addSettingOption(settingKey, o); $upsertSettingOption({ data: { key: settingKey, value: o } }).catch(console.error); }
  };
  const add = () => {
    const v = draft.trim();
    if (!v || options.includes(v) || (numeric && !/^\d{4}$/.test(v))) return;
    persistDefaults();
    addSettingOption(settingKey, v);
    $upsertSettingOption({ data: { key: settingKey, value: v } }).catch(console.error);
    setDraft("");
  };
  const remove = (o: string) => {
    if (usingDefaults) { persistDefaults(o); return; }
    removeSettingOption(settingKey, o);
    $removeSettingOption({ data: { key: settingKey, value: o } }).catch(console.error);
  };
  const sorted = numeric ? [...options].sort() : options;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
        {usingDefaults && options.length > 0 && <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Defaults</span>}
      </div>
      {hint && <p className="text-xs text-slate-500 mb-3">{hint}</p>}
      <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
        {sorted.map((o) => (
          <span key={o} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full group">
            {o}
            <button onClick={() => remove(o)} className="text-slate-400 hover:text-status-danger transition-colors opacity-0 group-hover:opacity-100 ml-0.5"><X className="size-3" /></button>
          </span>
        ))}
        {sorted.length === 0 && <p className="text-xs text-slate-400 italic">{numeric ? "This year and next are always available" : "No options yet"}</p>}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={numeric ? "e.g. 2028" : `Add ${label.toLowerCase()}…`}
          className="h-8 text-sm flex-1" onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="sm" variant="outline" className="h-8 px-3 gap-1" onClick={add} disabled={!draft.trim() || options.includes(draft.trim())}>
          <Plus className="size-3" /> Add
        </Button>
      </div>
    </div>
  );
}

function SettingsPage() {
  const { tab = "general" } = Route.useSearch();
  const navigate = useNavigate();
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings & Admin</h1>
        <p className="text-sm text-slate-500 mt-1">Shared by Strategy and AI & Automation. Changes are saved to the database and apply for everyone.</p>
      </header>
      <div className="flex flex-col md:flex-row gap-6">
        <nav className="md:w-52 shrink-0 flex md:flex-col gap-1" aria-label="Settings sections">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => navigate({ to: "/settings", search: key === "general" ? {} : { tab: key }, replace: true })}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors ${tab === key ? "bg-white border border-slate-200 shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900 hover:bg-white/60 border border-transparent"}`}>
              <Icon className={`size-4 ${tab === key ? "text-accent-indigo" : ""}`} />{label}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{current.label}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{current.desc}</p>
          </div>
          {tab === "general" && (<><AppNamePicker /><DarkModeToggle /></>)}
          {tab === "ai" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SECTIONS.map((s) => <OptionList key={s.key} settingKey={s.key} label={s.label} />)}
            </div>
          )}
          {tab === "strategy" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StrategyOptionList settingKey={STRATEGY_SETTING_KEYS.department} label="Departments" hint="Shown in the Strategy sidebar and on every goal." />
              <StrategyOptionList settingKey={STRATEGY_SETTING_KEYS.priority} label="Strategic Priorities" hint="The pillars goals roll up to." />
              <StrategyOptionList settingKey={STRATEGY_SETTING_KEYS.year} label="Plan Years" hint="Extra years for the year dropdown. Years with data appear automatically." numeric />
              <StrategyOptionList settingKey={STRATEGY_SETTING_KEYS.deepDiveArea} label="Deep Dive Areas" hint="Groups for deep-dive action items." />
            </div>
          )}
          {tab === "costs" && <CostsPanel />}
        </div>
      </div>
    </div>
  );
}
