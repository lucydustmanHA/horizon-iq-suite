
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePortfolio } from "../lib/store";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Plus, X } from "lucide-react";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

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
    setDraft("");
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{label}</h3>
      <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
        {options.map((o) => (
          <span key={o} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full group">
            {o}
            <button onClick={() => removeSettingOption(settingKey, o)} className="text-slate-400 hover:text-status-danger transition-colors opacity-0 group-hover:opacity-100 ml-0.5">
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

function SettingsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage dropdown options used across the app. Changes apply everywhere immediately and are saved to the database.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => <OptionList key={s.key} settingKey={s.key} label={s.label} />)}
      </div>
    </div>
  );
}
