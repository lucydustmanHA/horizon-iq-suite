import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import {
  $loadPortfolios,
  $createPortfolio,
  $updatePortfolio,
  $deletePortfolio,
  type Portfolio,
} from "../lib/portfolios.server";

export const Route = createFileRoute("/portfolios/")({
  component: PortfoliosPage,
});

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

function PortfoliosPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    $loadPortfolios()
      .then((p) => { setPortfolios(p); setLoading(false); })
      .catch((err) => { console.error(err); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditId(null);
    setName("");
    setDescription("");
    setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    setDialogOpen(true);
  };

  const openEdit = (p: Portfolio) => {
    setEditId(p.id);
    setName(p.name);
    setDescription(p.description);
    setColor(p.color);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await $updatePortfolio({ data: { id: editId, name: name.trim(), description, color } });
      } else {
        await $createPortfolio({ data: { name: name.trim(), description, color } });
      }
      load();
      setDialogOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this portfolio? Use cases won\u2019t be deleted.")) return;
    await $deletePortfolio({ data: { id } });
    load();
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Group related use cases for bulk management and reporting.
          </p>
        </div>
        <Button
          className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5"
          onClick={openCreate}
        >
          <Plus className="size-4" />
          New Portfolio
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : portfolios.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-10 mx-auto text-slate-300 mb-3"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
          <p className="text-sm text-muted-foreground">No portfolios yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Create one to start grouping use cases.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {portfolios.map((p) => (
            <div
              key={p.id}
              className="relative group border rounded-lg bg-white p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div
                  className="size-3 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <div className="flex-1 min-w-0">
                  <Link
                    to="/portfolios/$id"
                    params={{ id: p.id }}
                    className="text-sm font-semibold hover:text-accent-indigo transition-colors line-clamp-1"
                  >
                    {p.name}
                  </Link>
                  {p.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {p.useCaseCount} use case{p.useCaseCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="absolute top-3 right-3 hidden group-hover:flex gap-1">
                <button
                  onClick={() => openEdit(p)}
                  className="p-1 rounded hover:bg-slate-100"
                >
                  <Pencil className="size-3.5 text-slate-400" />
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-1 rounded hover:bg-red-50"
                >
                  <Trash2 className="size-3.5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Portfolio" : "New Portfolio"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Data Platform Modernization"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional summary of this portfolio’s scope"
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`size-6 rounded-full border-2 transition-all ${
                      color === c ? "border-slate-800 scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="bg-accent-indigo hover:bg-accent-indigo/90 text-white"
              onClick={handleSave}
              disabled={saving || !name.trim()}
            >
              {saving ? "Saving…" : editId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
