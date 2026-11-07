import { useEffect, useMemo, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { MONTHS, defaultReviewMonth, formatMonthKey, goalOwners, goalsOwnedBy, ownerKey, type StrategyGoal } from "../../lib/strategy-types";
import { $reminderContext, $lookupOwnerEmail, $sendGoalReminder, type EmailMatch, type ReminderLog } from "../../lib/reminders.server";

const OTHER = "__other__";
const mk = (year: number, i: number) => `${year}-${String(i + 1).padStart(2, "0")}`;
const SOURCE_TEXT: Record<EmailMatch["source"], string> = {
  saved: "Saved earlier",
  app_users: "Found from people who use this app",
  directory: "Found in the Databricks user directory",
  ambiguous: "More than one person has this name — pick the right one",
  none: "Not found — type their work email (you only need to do this once)",
};

/**
 * Admin-only "Send reminder" button + dialog for a goal page. Renders nothing for non-admins.
 * Defaults to the goal's first owner; can switch to the secondary owner or anyone else, and can
 * bundle that person's other goals that are missing the same month into one Teams message.
 */
export function ReminderButton({ goal, allGoals }: { goal: StrategyGoal; allGoals: StrategyGoal[] }) {
  const owners = useMemo(() => goalOwners(goal), [goal.owner, goal.secondaryOwner]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ctx, setCtx] = useState<{ canSend: boolean; matches: Record<string, EmailMatch>; history: ReminderLog[] } | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => $reminderContext({ data: { goalIds: [goal.id], names: owners } }).then(setCtx).catch(() => setCtx(null));
  useEffect(() => { load(); }, [goal.id, owners.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ctx?.canSend) return null;
  const last = ctx.history[0];
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}
        title={last ? `Last reminder: ${new Date(last.sentAt).toLocaleDateString()} to ${last.recipientName || last.recipientEmail}` : undefined}>
        <BellRing className="size-3.5" />Send reminder
      </Button>
      {open && <ReminderDialog goal={goal} allGoals={allGoals} owners={owners} ctx={ctx} onClose={() => setOpen(false)} onSent={load} />}
    </>
  );
}

function ReminderDialog({ goal, allGoals, owners, ctx, onClose, onSent }: {
  goal: StrategyGoal; allGoals: StrategyGoal[]; owners: string[];
  ctx: { matches: Record<string, EmailMatch>; history: ReminderLog[] }; onClose: () => void; onSent: () => void;
}) {
  const defMonth = defaultReviewMonth(goal.year);
  const [monthKey, setMonthKey] = useState(defMonth.startsWith(String(goal.year)) ? defMonth : mk(goal.year, 0));
  const monthIdx = Number(monthKey.slice(5, 7)) - 1;
  const [who, setWho] = useState<string>(owners[0] ?? OTHER);
  const [otherName, setOtherName] = useState("");
  const recipientName = who === OTHER ? otherName.trim() : who;
  const [match, setMatch] = useState<EmailMatch | null>(null);
  const [email, setEmail] = useState("");
  const [looking, setLooking] = useState(false);
  const [remember, setRemember] = useState(true);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  // Resolve the recipient's email whenever they change.
  const applyMatch = (m: EmailMatch | null) => { setMatch(m); setEmail(m?.email ?? ""); setRemember(!m || m.source === "none" || m.source === "ambiguous"); };
  useEffect(() => {
    if (who !== OTHER) { const m = ctx.matches[who]; if (m) { applyMatch(m); return; } }
    if (!recipientName) { applyMatch(null); return; }
    if (/@/.test(recipientName)) { applyMatch({ email: recipientName, source: "saved", candidates: [] }); return; }
    let live = true;
    setLooking(true);
    const t = setTimeout(() => {
      $lookupOwnerEmail({ data: { name: recipientName } }).then((m) => { if (live) applyMatch(m); }).catch(() => { if (live) applyMatch({ email: "", source: "none", candidates: [] }); }).finally(() => { if (live) setLooking(false); });
    }, who === OTHER ? 600 : 0);
    return () => { live = false; clearTimeout(t); setLooking(false); };
  }, [who, recipientName]); // eslint-disable-line react-hooks/exhaustive-deps

  // This goal + the recipient's other goals; pre-tick ones missing the selected month.
  const theirGoals = useMemo(() => {
    const list = recipientName && !/@/.test(recipientName) ? goalsOwnedBy(allGoals, recipientName) : [];
    return [goal, ...list.filter((g) => g.id !== goal.id)];
  }, [allGoals, goal, recipientName]);
  const missing = (g: StrategyGoal) => !(g.progress[monthIdx] ?? "").trim();
  const [picked, setPicked] = useState<Set<string>>(new Set([goal.id]));
  useEffect(() => { setPicked(new Set(theirGoals.filter((g) => g.id === goal.id || missing(g)).map((g) => g.id))); }, [theirGoals, monthIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const nameIsEmail = /@/.test(recipientName);
  const emailEdited = !!match && email.trim().toLowerCase() !== (match.email ?? "").toLowerCase();
  const showRemember = !!recipientName && !nameIsEmail && (!match || match.source === "none" || match.source === "ambiguous" || emailEdited);
  const canSend = !!email.trim() && picked.size > 0 && !sending && !looking;
  const goalHistory = ctx.history.slice(0, 3);

  const send = async () => {
    setSending(true);
    try {
      const goalIds = theirGoals.filter((g) => picked.has(g.id)).map((g) => g.id);
      const r = await $sendGoalReminder({ data: { recipientName, email: email.trim(), remember: showRemember && remember, monthKey, goalIds, note } });
      toast.success("Reminder sent", { description: `Teams message to ${r.sentTo} for ${r.goals} goal${r.goals === 1 ? "" : "s"}.` });
      onSent(); onClose();
    } catch (e) {
      toast.error("Reminder not sent", { description: String((e as Error)?.message ?? e) });
    } finally { setSending(false); }
  };

  const label = (t: string) => <label className="text-xs font-medium text-slate-500 mb-1 block">{t}</label>;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Send a Teams reminder</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>{label("Send to")}
              <Select value={who} onValueChange={setWho}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {owners.map((o, i) => <SelectItem key={o} value={o}>{o}{i === 0 ? " (owner)" : ""}</SelectItem>)}
                  <SelectItem value={OTHER}>Someone else…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>{label("Numbers needed for")}
              <Select value={monthKey} onValueChange={setMonthKey}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={mk(goal.year, i)}>{formatMonthKey(mk(goal.year, i))}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {who === OTHER && (
            <div>{label("Their name or work email")}<Input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="e.g. Jordan Lee" autoFocus /></div>
          )}
          {!!recipientName && (
            <div>{label("Teams / work email")}
              <div className="flex items-center gap-2">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@horizonair.com" className="h-9" />
                {looking && <Loader2 className="size-4 animate-spin text-slate-400 shrink-0" />}
              </div>
              {match && !looking && <p className={`text-[11px] mt-1 ${match.source === "none" || match.source === "ambiguous" ? "text-amber-700" : "text-slate-400"}`}>{nameIsEmail ? "Sending straight to this email" : SOURCE_TEXT[match.source]}</p>}
              {match?.source === "ambiguous" && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {match.candidates.map((c) => (
                    <button key={c.email} type="button" onClick={() => setEmail(c.email)}
                      className={`px-2 py-1 rounded-md border text-xs ${email === c.email ? "border-accent-indigo bg-indigo-50 text-accent-indigo" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{c.email}</button>
                  ))}
                </div>
              )}
              {showRemember && (
                <label className="flex items-center gap-2 mt-2 text-xs text-slate-600">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember this email for {recipientName}
                </label>
              )}
            </div>
          )}
          <div>{label(theirGoals.length > 1 ? `Goals to include — ${recipientName}'s goals missing ${MONTHS[monthIdx]} are ticked` : "Goal")}
            <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {theirGoals.map((g) => (
                <li key={g.id}>
                  <label className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" className="mt-0.5" checked={picked.has(g.id)} onChange={() => toggle(g.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-800">{g.objective}{g.id === goal.id && <span className="ml-1.5 text-[10px] text-slate-400">(this goal)</span>}</span>
                      <span className="block text-[11px] text-slate-500">{g.department} · {missing(g) ? <span className="text-amber-700">{MONTHS[monthIdx]} missing</span> : <>{MONTHS[monthIdx]}: {g.progress[monthIdx]}</>}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>{label("Add a note (optional)")}<Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. We review these on Thursday." className="text-sm" /></div>
          {goalHistory.length > 0 && (
            <div className="text-[11px] text-slate-500">
              <p className="font-medium text-slate-600 mb-0.5">Recent reminders for this goal</p>
              <ul className="space-y-0.5">
                {goalHistory.map((h, i) => <li key={i}>{new Date(h.sentAt).toLocaleString()} — {h.recipientName || h.recipientEmail} · {formatMonthKey(h.monthKey)}</li>)}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5" onClick={send} disabled={!canSend}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}Send {picked.size > 1 ? `${picked.size} goals` : "reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
