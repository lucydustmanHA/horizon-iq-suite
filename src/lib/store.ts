import { create } from "zustand";
import { $getSettings, $upsertSettingOption, $removeSettingOption } from "./settings.server";
import { persist } from "zustand/middleware";
import type { UseCase, Stage, CommentEntry, ActivityEntry } from "./types";
import { $moveStage, $updateUseCase, $addComment } from "./use-cases.server";

interface PortfolioState {
  useCases: UseCase[];
  loadedAt: number;
  initialized: boolean;
  settings: Record<string, string[]>;
  settingsLoaded: boolean;
  setSettings: (s: Record<string, string[]>) => void;
  addSettingOption: (key: string, value: string) => void;
  removeSettingOption: (key: string, value: string) => void;
  searchQuery: string;
  setUseCases: (ucs: UseCase[]) => void;
  addUseCase: (uc: UseCase) => void;
  setSearchQuery: (q: string) => void;
  moveStage: (id: string, to: Stage) => void;
  updateUseCase: (id: string, patch: Partial<UseCase>) => void;
  addComment: (id: string, body: string, author?: string) => void;
  resetSeed: () => void;
}

function withActivity(uc: UseCase, entry: Omit<ActivityEntry, "id" | "date">): UseCase {
  const activity: ActivityEntry = {
    id: `${uc.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: new Date().toISOString(),
    ...entry,
  };
  return { ...uc, lastModifiedDate: activity.date, activity: [...uc.activity, activity] };
}

export const usePortfolio = create<PortfolioState>()(
  persist(
    (set) => ({
      useCases: [],
      loadedAt: Date.now(),
      initialized: false,
      settings: {},
      settingsLoaded: false,
      setSettings: (s) => set({ settings: s, settingsLoaded: true }),
      addSettingOption: (key, value) => {
        set((st) => { const cur = st.settings[key] ?? []; if (cur.includes(value)) return st; return { settings: { ...st.settings, [key]: [...cur, value] } }; });
        $upsertSettingOption({ data: { key, value } }).catch(console.error);
      },
      removeSettingOption: (key, value) => {
        set((st) => ({ settings: { ...st.settings, [key]: (st.settings[key] ?? []).filter((v) => v !== value) } }));
        $removeSettingOption({ data: { key, value } }).catch(console.error);
      },
      searchQuery: "",
      setUseCases: (ucs) => set({ useCases: ucs, initialized: true, loadedAt: Date.now() }),
      addUseCase: (uc) => set((s) => ({ useCases: [uc, ...s.useCases] })),
      setSearchQuery: (q) => set({ searchQuery: q }),
      moveStage: (id, to) => {
        const from = usePortfolio.getState().useCases.find((u) => u.id === id)?.stage ?? "";
        set((s) => ({
          useCases: s.useCases.map((uc) => {
            if (uc.id !== id || uc.stage === to) return uc;
            return withActivity({ ...uc, stage: to }, { type: "stage_change", message: `Moved from ${uc.stage} to ${to}`, actor: "You" });
          }),
        }));
        $moveStage({ data: { id, from, to } }).catch((err) => console.error("[DB] moveStage failed:", err));
      },
      updateUseCase: (id, patch) => {
        set((s) => ({
          useCases: s.useCases.map((uc) => {
            if (uc.id !== id) return uc;
            let next = { ...uc, ...patch };
            const entries: Array<Omit<ActivityEntry, "id" | "date">> = [];
            if (patch.status && patch.status !== uc.status)
              entries.push({ type: "status_change", message: `Status: ${uc.status} → ${patch.status}`, actor: "You" });
            if (patch.stage && patch.stage !== uc.stage)
              entries.push({ type: "stage_change", message: `Moved from ${uc.stage} to ${patch.stage}`, actor: "You" });
            if (patch.priority !== undefined && patch.priority !== uc.priority)
              entries.push({ type: "priority_change", message: `Priority changed`, actor: "You" });
            if (patch.useCaseOwner && patch.useCaseOwner !== uc.useCaseOwner)
              entries.push({ type: "owner_change", message: `Owner: ${uc.useCaseOwner} → ${patch.useCaseOwner}`, actor: "You" });
            for (const e of entries) next = withActivity(next, e);
            if (!entries.length) next.lastModifiedDate = new Date().toISOString();
            return next;
          }),
        }));
        $updateUseCase({ data: { id, patch } }).catch((err) => console.error("[DB] updateUseCase failed:", err));
      },
      addComment: (id, body, author = "You") => {
        set((s) => ({
          useCases: s.useCases.map((uc) => {
            if (uc.id !== id) return uc;
            const c: CommentEntry = { id: `${id}-c-${Date.now()}`, author, date: new Date().toISOString(), body };
            return withActivity({ ...uc, comments: [...uc.comments, c] }, { type: "comment", message: `${author} commented`, actor: author });
          }),
        }));
        $addComment({ data: { id, body, author } }).catch((err) => console.error("[DB] addComment failed:", err));
      },
      resetSeed: () => set({ useCases: [], loadedAt: Date.now() }),
    }),
    { name: "horizon-qx-portfolio-v1", partialize: (s) => ({ useCases: s.useCases, loadedAt: s.loadedAt, initialized: s.initialized }) },
  ),
);

/** Returns useCases filtered by current searchQuery */
export function useFilteredUseCases() {
  return usePortfolio((s) => {
    const q = s.searchQuery.toLowerCase().trim();
    if (!q) return s.useCases;
    return s.useCases.filter((u) =>
      u.title.toLowerCase().includes(q) ||
      u.description.toLowerCase().includes(q) ||
      u.workgroup.toLowerCase().includes(q) ||
      u.useCaseOwner.toLowerCase().includes(q) ||
      u.businessArea.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });
}
