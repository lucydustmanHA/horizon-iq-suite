import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UseCase, Stage, CommentEntry, ActivityEntry } from "./types";
import { generateSeedUseCases } from "./mock-data";
import { $moveStage, $updateUseCase, $addComment } from "./use-cases.server";

interface PortfolioState {
  useCases: UseCase[];
  loadedAt: number;
  initialized: boolean;
  setUseCases: (ucs: UseCase[]) => void;
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
  return {
    ...uc,
    lastModifiedDate: activity.date,
    activity: [...uc.activity, activity],
  };
}

export const usePortfolio = create<PortfolioState>()(
  persist(
    (set) => ({
      useCases: [],
      loadedAt: Date.now(),
      initialized: false,
      setUseCases: (ucs) =>
        set({ useCases: ucs, initialized: true, loadedAt: Date.now() }),
      moveStage: (id, to) => {
        const from = usePortfolio.getState().useCases.find((u) => u.id === id)?.stage ?? "";
        set((s) => ({
          useCases: s.useCases.map((uc) => {
            if (uc.id !== id || uc.stage === to) return uc;
            return withActivity({ ...uc, stage: to }, {
              type: "stage_change",
              message: `Moved from ${uc.stage} to ${to}`,
              actor: "You",
            });
          }),
        }));
        $moveStage({ data: { id, from, to } }).catch((err) =>
          console.error("[DB] moveStage failed:", err)
        );
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
            if (patch.priority && patch.priority !== uc.priority)
              entries.push({ type: "priority_change", message: `Priority: ${uc.priority} → ${patch.priority}`, actor: "You" });
            if (patch.useCaseOwner && patch.useCaseOwner !== uc.useCaseOwner)
              entries.push({ type: "owner_change", message: `Owner: ${uc.useCaseOwner} → ${patch.useCaseOwner}`, actor: "You" });
            for (const e of entries) next = withActivity(next, e);
            if (!entries.length) next.lastModifiedDate = new Date().toISOString();
            return next;
          }),
        }));
        $updateUseCase({ data: { id, patch } }).catch((err) =>
          console.error("[DB] updateUseCase failed:", err)
        );
      },
      addComment: (id, body, author = "You") => {
        set((s) => ({
          useCases: s.useCases.map((uc) => {
            if (uc.id !== id) return uc;
            const c: CommentEntry = {
              id: `${id}-c-${Date.now()}`,
              author,
              date: new Date().toISOString(),
              body,
            };
            return withActivity(
              { ...uc, comments: [...uc.comments, c] },
              { type: "comment", message: `${author} commented`, actor: author },
            );
          }),
        }));
        $addComment({ data: { id, body, author } }).catch((err) =>
          console.error("[DB] addComment failed:", err)
        );
      },
      resetSeed: () => set({ useCases: [], loadedAt: Date.now() }),
    }),
    { name: "horizon-qx-portfolio-v1" },
  ),
);