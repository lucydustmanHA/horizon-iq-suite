/**
 * app-side.ts — which half of Horizon QX Business Transformation the user is in.
 * "ai" = AI & Automation (the original app, unchanged routes), "strategy" = /strategy/*.
 * The last-used side is remembered in localStorage; a missing value means first visit.
 */
export type AppSide = "ai" | "strategy";

const KEY = "qx-bt-side";

/** Routes shared by both sides — they render inside whichever shell the user came from. */
export const SHARED_PATHS = ["/settings", "/admin"];

export function getSavedSide(): AppSide | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "ai" || v === "strategy" ? v : null;
}

export function saveSide(side: AppSide) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, side);
}

export function isSharedPath(pathname: string) {
  return SHARED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function sideForPath(pathname: string, fallback: AppSide): AppSide {
  if (pathname === "/strategy" || pathname.startsWith("/strategy/")) return "strategy";
  if (isSharedPath(pathname)) return fallback;
  return "ai";
}

export const SIDE_HOME: Record<AppSide, string> = { ai: "/", strategy: "/strategy" };
