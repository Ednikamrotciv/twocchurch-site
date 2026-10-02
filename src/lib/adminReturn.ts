export type PanelMode = "edit" | "list" | "status" | "tools";

export type PanelView =
  | { kind: "home" }
  | { kind: "unsaved" }
  | { kind: "job"; jobId: string }
  | { kind: "section"; sectionId: string; entryKey?: string; title: string };

export type AdminReturn = { path: string; mode: PanelMode; view: PanelView; open: boolean; at: number };

export const ADMIN_RETURN_MS = 5 * 60 * 1000;

const RETURN_KEY = "wom.cms.exitReturn";

export function isPanelMode(m: unknown): m is PanelMode {
  return m === "edit" || m === "list" || m === "status" || m === "tools";
}

export function readAdminReturn(): AdminReturn | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw);
    if (!r || typeof r.path !== "string" || !r.path.startsWith("/")) return null;
    if (!isPanelMode(r.mode)) return null;
    if (typeof r.open !== "boolean") return null;
    const v = r.view;
    if (!v || typeof v.kind !== "string") return null;
    if (v.kind !== "home" && v.kind !== "unsaved" && v.kind !== "job" && v.kind !== "section") return null;
    if (v.kind === "job" && typeof v.jobId !== "string") return null;
    if (v.kind === "section" && (typeof v.sectionId !== "string" || typeof v.title !== "string")) return null;
    if (v.kind === "section" && v.entryKey !== undefined && typeof v.entryKey !== "string") return null;
    return { path: r.path, mode: r.mode, view: v as PanelView, open: r.open, at: typeof r.at === "number" ? r.at : 0 };
  } catch {
    return null;
  }
}

export function clearAdminReturn() {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {}
}
