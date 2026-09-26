import type { RecordItem } from "../api/client";

/**
 * Same table the PDF/DOCX report prints — a port of backend work_report.py
 * (build_question_index / _response_rows) so the on-screen preview and the
 * downloaded file always say the same thing. Keep the two in step.
 */

export type StoredSchema = { version: number; schema_json: Record<string, unknown> };
/** category -> questions in questionnaire order */
export type QuestionIndex = Record<string, { id: string; label: string; conditional: boolean }[]>;

const ROW_SKIP = new Set(["gps", "capturedAt", "structure_category", "photos", "chainage", "name_of_road", "observations", "recommendations"]);

export function buildQuestionIndex(schemas: StoredSchema[]): QuestionIndex {
  const index: QuestionIndex = {};
  const seen: Record<string, Set<string>> = {};
  // newest version first: its labels and order win, older-only questions are appended
  for (const { schema_json } of [...schemas].sort((a, b) => b.version - a.version)) {
    const categories = (schema_json.categories || {}) as Record<string, { questions?: Record<string, unknown>[] }>;
    for (const [category, body] of Object.entries(categories)) {
      const bucket = (index[category] ||= []);
      const known = (seen[category] ||= new Set());
      for (const q of body?.questions || []) {
        const id = q.id as string | undefined;
        if (!id || q.type === "photo_group" || known.has(id)) continue;
        known.add(id);
        bucket.push({ id, label: String(q.label || id), conditional: Boolean(q.show_if) });
      }
    }
  }
  return index;
}

export const categoryTitle = (key?: string | null) =>
  (key || "Structure").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export function reportRows(r: RecordItem, index?: QuestionIndex): [string, string][] {
  const responses = (r.responses_json || {}) as Record<string, unknown>;
  const gps = (responses.gps || {}) as { latitude?: number; longitude?: number };
  const lat = gps.latitude ?? r.latitude;
  const lon = gps.longitude ?? r.longitude;

  const rows: [string, string][] = [
    ["Name of Road / Project", String(responses.name_of_road || r.project_name || "")],
    ["Location of structure in Km.", `${r.chainage || ""} — ${categoryTitle(r.structure_category).toUpperCase()}`.replace(/^ — | — $/g, "")],
    ["Coordinates", lat != null && lon != null ? `${lat}, ${lon}` : ""],
  ];

  const asked = index?.[r.structure_category];
  let extras: string[];
  if (asked?.length) {
    const known = new Set<string>();
    for (const { id, label, conditional } of asked) {
      known.add(id);
      if (ROW_SKIP.has(id)) continue;
      const value = responses[id];
      const answered = !(value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length));
      if (!answered && conditional) continue; // hidden for this structure
      rows.push([label, answered ? fmt(value) : ""]);
    }
    extras = Object.keys(responses).filter((k) => !known.has(k) && !ROW_SKIP.has(k));
  } else {
    extras = Object.keys(responses).filter((k) => !ROW_SKIP.has(k));
  }
  for (const key of extras) rows.push([key.replace(/_/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()), fmt(responses[key])]);
  return rows;
}

/** 183+862 -> road order; unparseable chainages go last (same as the PDF). */
export function chainageOrder(a: RecordItem, b: RecordItem): number {
  const key = (r: RecordItem): [number, number] => {
    const m = /^\s*(\d+)\s*\+\s*(\d+)/.exec(r.chainage || "");
    return m ? [0, Number(m[1]) * 1000 + Number(m[2])] : [1, 0];
  };
  const [ga, na] = key(a);
  const [gb, nb] = key(b);
  return ga - gb || na - nb || (a.chainage || "").localeCompare(b.chainage || "");
}

/** Observations / recommendations as bullet text (a list from the new form, or lines of old free text). */
export function bulletItems(r: RecordItem, key: "observations" | "recommendations"): string[] {
  const value = (r.responses_json || {})[key];
  const lines = Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split(/\r?\n/) : [];
  return lines.map((l) => l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "").trim()).filter(Boolean);
}
