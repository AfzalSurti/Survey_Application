import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Plus, Search, Trash2, X } from "lucide-react";
import { client, fetchDashboard, fetchRecords, type DashboardSummary, type Project, type RecordItem, type ReportTemplate, type User } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PreviewModal } from "../components/PreviewModal";
import { ActionButton, GlassPanel, StatusBadge, roleLabel } from "../components/UI";

const Heading = ({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) => (
  <div className="page-heading">
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
    </div>
    {action}
  </div>
);

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

const SURVEY_COLUMNS_COMPLETE = [
  "Project Name",
  "Project No.",
  "Survey Type",
  "Key Person / Highway Engineer",
  "Head Survey Person (Field Person)",
  "Assign Date",
  "Complete Date",
] as const;

function SurveyRowsTable({ records, showComplete }: { records: RecordItem[]; showComplete?: boolean }) {
  const headers = showComplete === false ? SURVEY_COLUMNS_COMPLETE.slice(0, 6) : SURVEY_COLUMNS_COMPLETE;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} style={{ cursor: "default" }}>
              <td>{r.project_name || "—"}</td>
              <td className="mono">{r.project_number || "—"}</td>
              <td>{r.survey_type || "—"}</td>
              <td>{r.key_engineer_name || "—"}</td>
              <td>{r.head_surveyor_name || "—"}</td>
              <td>{fmt(r.assign_date)}</td>
              {showComplete !== false ? <td>{fmt(r.complete_date)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {!records.length && <div className="empty">No surveys in this list yet.</div>}
    </div>
  );
}

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  useEffect(() => {
    fetchDashboard()
      .then(setSummary)
      .catch(() =>
        setSummary({ total_projects: 0, complete_surveys: 0, ongoing_surveys: 0, complete_items: [], pending_items: [] }),
      );
  }, []);
  return (
    <>
      <Heading eyebrow="Operations overview" title="Survey intelligence, at a glance" />
      <div className="grid stats stats-two">
        <GlassPanel>
          <div className="stat-label">Complete Survey</div>
          <div className="stat-value">{summary?.complete_surveys ?? 0}</div>
          <div className="stat-sub">Total project: {summary?.total_projects ?? 0}</div>
        </GlassPanel>
        <GlassPanel>
          <div className="stat-label">On Going Survey</div>
          <div className="stat-value">{summary?.ongoing_surveys ?? 0}</div>
          <div className="stat-sub">Submitted or in-progress field work</div>
        </GlassPanel>
      </div>
      <div className="split" style={{ marginTop: 16 }}>
        <GlassPanel>
          <h2>Recent Complete Survey List</h2>
          <SurveyRowsTable records={summary?.complete_items ?? []} />
        </GlassPanel>
        <GlassPanel>
          <h2>Currently Pending Survey List</h2>
          <SurveyRowsTable records={summary?.pending_items ?? []} showComplete={false} />
        </GlassPanel>
      </div>
    </>
  );
}

export function Records() {
  const { user } = useAuth();
  const canCorrect = user?.role === "admin" || user?.role === "super_admin";
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [projectStructures, setProjectStructures] = useState<RecordItem[]>([]);
  const [activeStructureId, setActiveStructureId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editChainage, setEditChainage] = useState("");
  const [preview, setPreview] = useState<"excel" | "word" | null>(null);
  const [previewRecords, setPreviewRecords] = useState<RecordItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({
    project_name: "",
    project_number: "",
    survey_type: "",
    key_engineer_name: "",
    head_surveyor_name: "",
    assign_date: "",
    complete_date: "",
  });

  useEffect(() => {
    fetchRecords().then(setRecords).catch(() => setRecords([]));
  }, []);

  const activeStructure = projectStructures.find((r) => r.id === activeStructureId) || selected;

  useEffect(() => {
    if (activeStructure) {
      setEditJson(JSON.stringify(activeStructure.responses_json || {}, null, 2));
      setEditChainage(activeStructure.chainage);
    }
  }, [activeStructure]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const blob = JSON.stringify(r).toLowerCase();
      if (query && !blob.includes(query.toLowerCase())) return false;
      if (filters.project_name && !(r.project_name || "").toLowerCase().includes(filters.project_name.toLowerCase())) return false;
      if (filters.project_number && !(r.project_number || "").toLowerCase().includes(filters.project_number.toLowerCase())) return false;
      if (filters.survey_type && !(r.survey_type || "").toLowerCase().includes(filters.survey_type.toLowerCase())) return false;
      if (filters.key_engineer_name && !(r.key_engineer_name || "").toLowerCase().includes(filters.key_engineer_name.toLowerCase())) return false;
      if (filters.head_surveyor_name && !(r.head_surveyor_name || "").toLowerCase().includes(filters.head_surveyor_name.toLowerCase())) return false;
      if (filters.assign_date && fmt(r.assign_date) !== filters.assign_date && !(r.assign_date || "").includes(filters.assign_date)) return false;
      if (filters.complete_date && fmt(r.complete_date) !== filters.complete_date && !(r.complete_date || "").includes(filters.complete_date)) return false;
      return true;
    });
  }, [records, query, filters]);

  /** One display row per project (entire project data), using the newest structure as the summary row. */
  const projectRows = useMemo(() => {
    const byProject = new Map<string, RecordItem>();
    for (const r of filtered) {
      const key = r.project_id || r.id;
      const prev = byProject.get(key);
      if (!prev) {
        byProject.set(key, r);
        continue;
      }
      const prevTime = Date.parse(prev.complete_date || prev.updated_at || prev.created_at || "") || 0;
      const nextTime = Date.parse(r.complete_date || r.updated_at || r.created_at || "") || 0;
      if (nextTime >= prevTime) byProject.set(key, r);
    }
    return Array.from(byProject.values());
  }, [filtered]);

  const structuresForProject = (projectId: string) =>
    records.filter((r) => r.project_id === projectId);

  const openDetails = async (r: RecordItem) => {
    setSelected(r);
    setActiveStructureId(r.id);
    try {
      const siblings = await fetchRecords(r.project_id);
      const list = siblings.length ? siblings : [r];
      setProjectStructures(list);
      setRecords((prev) => {
        const byId = new Map(prev.map((x) => [x.id, x]));
        for (const s of list) byId.set(s.id, s);
        return Array.from(byId.values());
      });
    } catch {
      const siblings = structuresForProject(r.project_id);
      setProjectStructures(siblings.length ? siblings : [r]);
    }
  };

  const openPreview = async (mode: "excel" | "word", r: RecordItem) => {
    setBusy(true);
    try {
      const siblings = await fetchRecords(r.project_id);
      setPreviewRecords(siblings.length ? siblings : [r]);
      setPreview(mode);
    } catch {
      const siblings = structuresForProject(r.project_id);
      setPreviewRecords(siblings.length ? siblings : [r]);
      setPreview(mode);
    } finally {
      setBusy(false);
    }
  };

  const saveCorrections = async () => {
    if (!activeStructure || !canCorrect) return;
    try {
      const responses_json = JSON.parse(editJson);
      const updated = await client.patch<RecordItem>(`/records/${activeStructure.id}`, {
        chainage: editChainage,
        responses_json,
      });
      setRecords((x) => x.map((r) => (r.id === updated.id ? updated : r)));
      setProjectStructures((x) => x.map((r) => (r.id === updated.id ? updated : r)));
      setSelected((s) => (s?.id === updated.id ? updated : s));
      alert("Record data corrected.");
    } catch (e) {
      alert((e as Error).message || "Could not save corrections.");
    }
  };

  const downloadWord = async () => {
    const ids = previewRecords.map((r) => r.id);
    if (!ids.length) return alert("No records to download.");
    setBusy(true);
    try {
      await client.download("/reports/generate", { record_ids: ids }, "POST");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const downloadExcel = async () => {
    setBusy(true);
    try {
      await client.download("/exports/excel");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const filterFields: { key: keyof typeof filters; label: string }[] = [
    { key: "project_name", label: "Project Name" },
    { key: "project_number", label: "Project No." },
    { key: "survey_type", label: "Survey Type" },
    { key: "key_engineer_name", label: "Key Person / Highway Engineer" },
    { key: "head_surveyor_name", label: "Head Survey Person" },
    { key: "assign_date", label: "Assign Date" },
    { key: "complete_date", label: "Complete Date" },
  ];

  return (
    <>
      <Heading
        eyebrow="Review workspace"
        title="Survey records"
        action={<span className="muted">{projectRows.length} project(s) · {filtered.length} structure(s)</span>}
      />
      <GlassPanel>
        <div className="toolbar">
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#627b95" }} />
            <input
              className="field"
              style={{ paddingLeft: 32, width: "100%" }}
              placeholder="Search records"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="filter-row">
          {filterFields.map((f) => (
            <input
              key={f.key}
              className="field"
              placeholder={f.label}
              value={filters[f.key]}
              onChange={(e) => setFilters((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          ))}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {SURVEY_COLUMNS_COMPLETE.map((h) => (
                  <th key={h}>{h}</th>
                ))}
                <th>Status</th>
                <th>Excel Generation</th>
                <th>Report Generation</th>
              </tr>
            </thead>
            <tbody>
              {projectRows.map((r) => (
                <tr key={r.project_id || r.id}>
                  <td>{r.project_name || "—"}</td>
                  <td className="mono">{r.project_number || "—"}</td>
                  <td>{r.survey_type || "—"}</td>
                  <td>{r.key_engineer_name || "—"}</td>
                  <td>{r.head_surveyor_name || "—"}</td>
                  <td>{fmt(r.assign_date)}</td>
                  <td>{fmt(r.complete_date)}</td>
                  <td>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetails(r);
                      }}
                      title="Open record details"
                    >
                      <StatusBadge status={r.status} />
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link-btn preview-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPreview("excel", r);
                      }}
                    >
                      Preview
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link-btn preview-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPreview("word", r);
                      }}
                    >
                      Preview
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!projectRows.length && <div className="empty">No survey records match these filters.</div>}
        </div>
      </GlassPanel>

      <PreviewModal
        open={preview !== null}
        mode={preview}
        records={previewRecords}
        busy={busy}
        onClose={() => setPreview(null)}
        onDownloadWord={downloadWord}
        onDownloadExcel={downloadExcel}
      />

      {selected && (
        <aside className="glass drawer">
          <button className="drawer-close" onClick={() => setSelected(null)}>
            <X />
          </button>
          <p className="eyebrow">Record details</p>
          <h2>{selected.project_name || selected.chainage}</h2>
          <div className="kv">
            <span>Project</span>
            <strong>{selected.project_name || "—"}</strong>
          </div>
          <div className="kv">
            <span>Survey type</span>
            <strong>{selected.survey_type || "—"}</strong>
          </div>
          <div className="kv">
            <span>Structures</span>
            <strong>{projectStructures.length} surveyed</strong>
          </div>

          <h3 style={{ marginTop: 18 }}>All surveyed structures</h3>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Chainage</th>
                  <th>Structure</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {projectStructures.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setActiveStructureId(s.id)}
                    style={{
                      cursor: "pointer",
                      background: s.id === activeStructureId ? "rgba(27,79,140,0.08)" : undefined,
                    }}
                  >
                    <td className="mono">{s.chainage || "—"}</td>
                    <td>{(s.structure_category || "—").replace(/_/g, " ")}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeStructure && canCorrect ? (
            <>
              <h3>Correct data — {activeStructure.chainage || "structure"}</h3>
              <div className="form-row">
                <label>Chainage</label>
                <input className="field mono" value={editChainage} onChange={(e) => setEditChainage(e.target.value)} />
              </div>
              <div className="form-row">
                <label>Responses JSON</label>
                <textarea className="field code" value={editJson} onChange={(e) => setEditJson(e.target.value)} spellCheck={false} />
              </div>
              <button className="button" onClick={saveCorrections}>
                Save corrections
              </button>
            </>
          ) : activeStructure ? (
            <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: ".75rem" }}>
              {JSON.stringify(activeStructure.responses_json || {}, null, 2)}
            </pre>
          ) : null}
        </aside>
      )}
    </>
  );
}

/** Old sidebar pages removed — redirect into Records. */
export function Reports() {
  return <Navigate to="/app/records" replace />;
}
export function ExcelExport() {
  return <Navigate to="/app/records" replace />;
}

type UiQuestionType =
  | "short_question"
  | "multiple_selection"
  | "dropdown_1_row"
  | "dropdown_2_row"
  | "dropdown_3_row"
  | "dropdown_4_row";

type MatrixRow = string[];

type EditableQuestion = {
  id: string;
  label: string;
  uiType: UiQuestionType;
  required: boolean;
  /** Single-row / multi-select answer labels. */
  options: string[];
  /** Column headers for 2/3/4-row dropdown layouts. */
  columns: string[];
  /** Value rows for matrix-style dropdowns (2–4 cells each). */
  matrixRows: MatrixRow[];
};

const UI_TYPE_OPTIONS: { value: UiQuestionType; label: string }[] = [
  { value: "short_question", label: "Short Question" },
  { value: "multiple_selection", label: "Multiple Selection" },
  { value: "dropdown_1_row", label: "Drop Down with Single Row" },
  { value: "dropdown_2_row", label: "Drop Down With 02 Row" },
  { value: "dropdown_3_row", label: "Drop Down With 03 Row" },
  { value: "dropdown_4_row", label: "Drop Down With 04 Row" },
];

function defaultColumns(uiType: UiQuestionType): string[] {
  if (uiType === "dropdown_2_row") return ["Number of Pipe", "Number of Dia"];
  if (uiType === "dropdown_3_row") return ["Number of Pipe", "X", "Number of Dia"];
  if (uiType === "dropdown_4_row") return ["Column 1", "Column 2", "Column 3", "Column 4"];
  return [];
}

function colCount(uiType: UiQuestionType): number {
  if (uiType === "dropdown_2_row") return 2;
  if (uiType === "dropdown_3_row") return 3;
  if (uiType === "dropdown_4_row") return 4;
  return 0;
}

function needsOptions(uiType: UiQuestionType) {
  return uiType !== "short_question";
}

function isMatrixType(uiType: UiQuestionType) {
  return uiType === "dropdown_2_row" || uiType === "dropdown_3_row" || uiType === "dropdown_4_row";
}

function toUiType(q: Record<string, unknown>): UiQuestionType {
  const type = String(q.type || "text");
  const ui = String(q.ui || "");
  if (ui === "dropdown_2" || ui === "matrix_2") return "dropdown_2_row";
  if (ui === "dropdown_3" || ui === "matrix_3") return "dropdown_3_row";
  if (ui === "dropdown_4" || ui === "matrix_4") return "dropdown_4_row";
  if (type === "multiselect") return "multiple_selection";
  if (type === "select" || type === "condition_rating") return "dropdown_1_row";
  return "short_question";
}

function fromUiType(uiType: UiQuestionType): { type: string; ui?: string } {
  if (uiType === "multiple_selection") return { type: "multiselect", ui: "checkbox" };
  if (uiType === "dropdown_1_row") return { type: "select", ui: "dropdown" };
  if (uiType === "dropdown_2_row") return { type: "select", ui: "dropdown_2" };
  if (uiType === "dropdown_3_row") return { type: "select", ui: "dropdown_3" };
  if (uiType === "dropdown_4_row") return { type: "select", ui: "dropdown_4" };
  return { type: "text" };
}

function matrixToOptions(uiType: UiQuestionType, rows: MatrixRow[]): string[] {
  return rows
    .map((row) => {
      const cells = row.map((c) => c.trim()).filter((c, i) => (uiType === "dropdown_3_row" ? i !== 1 : true) && c);
      if (uiType === "dropdown_3_row") {
        const left = row[0]?.trim() || "";
        const right = row[2]?.trim() || "";
        return left && right ? `${left} x ${right}` : "";
      }
      if (uiType === "dropdown_2_row") {
        const left = row[0]?.trim() || "";
        const right = row[1]?.trim() || "";
        return left && right ? `${left} x ${right}` : left || right;
      }
      return cells.join(" | ");
    })
    .filter(Boolean);
}

function parseQuestion(q: Record<string, unknown>): EditableQuestion {
  const uiType = toUiType(q);
  const options = Array.isArray(q.options)
    ? q.options.map((o) => (typeof o === "string" ? o : String((o as { label?: string; value?: string }).label || (o as { value?: string }).value || "")))
    : [];
  const columns = Array.isArray(q.columns) ? q.columns.map(String) : defaultColumns(uiType);
  let matrixRows: MatrixRow[] = Array.isArray(q.matrix_rows)
    ? (q.matrix_rows as unknown[]).map((r) => (Array.isArray(r) ? r.map(String) : [String(r)]))
    : [];

  if (isMatrixType(uiType) && !matrixRows.length && options.length) {
    matrixRows = options.map((opt) => {
      if (uiType === "dropdown_2_row" || uiType === "dropdown_3_row") {
        const parts = opt.split(/\s*[x×]\s*/i);
        if (uiType === "dropdown_3_row") return [parts[0] || "", "X", parts[1] || ""];
        return [parts[0] || "", parts[1] || ""];
      }
      return opt.split(/\s*\|\s*/);
    });
  }

  const n = colCount(uiType);
  if (isMatrixType(uiType) && !matrixRows.length) {
    matrixRows = [Array.from({ length: n }, (_, i) => (uiType === "dropdown_3_row" && i === 1 ? "X" : ""))];
  }

  return {
    id: String(q.id || `q_${Date.now()}`),
    label: String(q.label || ""),
    uiType,
    required: q.required !== false,
    options: options.length ? options : needsOptions(uiType) && !isMatrixType(uiType) ? [""] : [],
    columns: columns.length ? columns : defaultColumns(uiType),
    matrixRows,
  };
}

export function SchemaEditor() {
  const [module, setModule] = useState("structure_inventory");
  const [modules, setModules] = useState<{ value: string; label: string }[]>([
    { value: "structure_inventory", label: "Structure Inventory" },
    { value: "utility_shifting", label: "Utility Shifting" },
  ]);
  const [rawSchema, setRawSchema] = useState<Record<string, unknown>>({});
  const [categoryKey, setCategoryKey] = useState("");
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [history, setHistory] = useState<EditableQuestion[][]>([]);
  const [message, setMessage] = useState("");
  const [draftOption, setDraftOption] = useState<Record<string, string>>({});

  const toKey = (label: string) =>
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

  const labelize = (key: string) =>
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const refreshModules = async () => {
    try {
      const rows = await client.get<{ module: string }[]>("/schemas");
      const seen = new Set<string>();
      const next: { value: string; label: string }[] = [];
      for (const row of rows) {
        if (seen.has(row.module)) continue;
        seen.add(row.module);
        next.push({ value: row.module, label: labelize(row.module) });
      }
      if (!next.length) {
        next.push(
          { value: "structure_inventory", label: "Structure Inventory" },
          { value: "utility_shifting", label: "Utility Shifting" },
        );
      }
      setModules(next);
    } catch {
      /* keep defaults */
    }
  };

  const categoryKeys = useMemo(() => {
    const cats = (rawSchema.categories || {}) as Record<string, unknown>;
    return Object.keys(cats);
  }, [rawSchema]);

  const pushHistory = (current: EditableQuestion[]) => {
    setHistory((h) => [...h.slice(-39), current.map((q) => ({ ...q, options: [...q.options], columns: [...q.columns], matrixRows: q.matrixRows.map((r) => [...r]) }))]);
  };

  const applyQuestions = (updater: (prev: EditableQuestion[]) => EditableQuestion[]) => {
    setQuestions((prev) => {
      pushHistory(prev);
      return updater(prev);
    });
  };

  const undo = () => {
    setHistory((h) => {
      if (!h.length) {
        setMessage("Nothing to undo.");
        return h;
      }
      const prev = h[h.length - 1];
      setQuestions(prev);
      setMessage("Undid last change (one step back).");
      return h.slice(0, -1);
    });
  };

  const loadCategory = (schema: Record<string, unknown>, key: string) => {
    const cats = (schema.categories || {}) as Record<string, { questions?: Record<string, unknown>[] }>;
    const list = (cats[key]?.questions || []).map(parseQuestion);
    setQuestions(list);
    setHistory([]);
  };

  const load = () => {
    client
      .get<{ module: string; schema_json: Record<string, unknown>; version: number }[]>(`/schemas?module=${module}`)
      .then((s) => {
        const x = s[0];
        if (!x) {
          setMessage("No schema for this module yet. Add a structure and publish, or create a new survey.");
          setRawSchema({ categories: {} });
          setCategoryKey("");
          setQuestions([]);
          return;
        }
        setRawSchema(x.schema_json || {});
        const cats = Object.keys((x.schema_json?.categories || {}) as object);
        const key = categoryKey && cats.includes(categoryKey) ? categoryKey : cats[0] || "";
        setCategoryKey(key);
        if (key) loadCategory(x.schema_json, key);
        else {
          setQuestions([]);
          setHistory([]);
        }
        setMessage(`Loaded schema v${x.version}`);
      })
      .catch((e) => setMessage((e as Error).message));
  };

  useEffect(() => {
    refreshModules();
  }, []);

  useEffect(load, [module]);

  useEffect(() => {
    if (categoryKey && rawSchema.categories) loadCategory(rawSchema, categoryKey);
  }, [categoryKey]);

  const addSurvey = async () => {
    const label = window.prompt("New survey name (e.g. Bridge Inspection)");
    if (!label?.trim()) return;
    const key = toKey(label);
    if (!key) {
      alert("Enter a valid survey name.");
      return;
    }
    if (modules.some((m) => m.value === key)) {
      setModule(key);
      setMessage(`Switched to existing survey “${labelize(key)}”.`);
      return;
    }
    try {
      await client.post("/schemas", {
        module: key,
        schema_json: { categories: {} },
        is_active: true,
      });
      await refreshModules();
      setModule(key);
      setMessage(`Created survey “${labelize(key)}”. Add structures, then publish questions.`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const addStructure = () => {
    const label = window.prompt("New structure name (e.g. pipe culvert)");
    if (!label?.trim()) return;
    const key = toKey(label);
    if (!key) {
      alert("Enter a valid structure name.");
      return;
    }
    const cats = { ...((rawSchema.categories || {}) as Record<string, unknown>) };
    if (cats[key]) {
      setCategoryKey(key);
      setMessage(`Structure “${labelize(key)}” already exists.`);
      return;
    }
    cats[key] = { questions: [] };
    setRawSchema({ ...rawSchema, categories: cats });
    setCategoryKey(key);
    setQuestions([]);
    setHistory([]);
    setMessage(`Added structure “${labelize(key)}”. Add questions, then Publish new version.`);
  };

  const removeStructure = () => {
    if (!categoryKey) {
      alert("Select a structure to remove.");
      return;
    }
    if (!window.confirm(`Remove structure “${labelize(categoryKey)}” from this survey? Publish to save the change.`)) return;
    const cats = { ...((rawSchema.categories || {}) as Record<string, unknown>) };
    delete cats[categoryKey];
    const nextKeys = Object.keys(cats);
    setRawSchema({ ...rawSchema, categories: cats });
    setCategoryKey(nextKeys[0] || "");
    setQuestions([]);
    setHistory([]);
    setMessage(`Removed “${labelize(categoryKey)}”. Click Publish new version to save.`);
  };

  const updateQuestion = (id: string, patch: Partial<EditableQuestion>, trackUndo = false) => {
    if (trackUndo) {
      applyQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)));
      return;
    }
    setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const removeAnswer = (qid: string, index: number) => {
    applyQuestions((list) =>
      list.map((q) => {
        if (q.id !== qid) return q;
        if (isMatrixType(q.uiType)) {
          const matrixRows = q.matrixRows.filter((_, i) => i !== index);
          return { ...q, matrixRows: matrixRows.length ? matrixRows : [Array.from({ length: colCount(q.uiType) }, (_, i) => (q.uiType === "dropdown_3_row" && i === 1 ? "X" : ""))] };
        }
        const options = q.options.filter((_, i) => i !== index);
        return { ...q, options: options.length ? options : [""] };
      }),
    );
  };

  const addAnswerPanel = (id: string) => {
    applyQuestions((list) =>
      list.map((q) => {
        if (q.id !== id) return q;
        if (isMatrixType(q.uiType)) {
          const n = colCount(q.uiType);
          const row = Array.from({ length: n }, (_, i) => (q.uiType === "dropdown_3_row" && i === 1 ? "X" : ""));
          return { ...q, matrixRows: [...q.matrixRows, row] };
        }
        const next = draftOption[id]?.trim() || "";
        return { ...q, options: [...q.options, next] };
      }),
    );
    setDraftOption((d) => ({ ...d, [id]: "" }));
  };

  const addQuestion = () => {
    applyQuestions((list) => [
      ...list,
      {
        id: `q_${Date.now()}`,
        label: "",
        uiType: "short_question",
        required: true,
        options: [],
        columns: [],
        matrixRows: [],
      },
    ]);
  };

  const save = async () => {
    try {
      if (!categoryKey && Object.keys((rawSchema.categories || {}) as object).length === 0) {
        alert("Add at least one structure before publishing.");
        return;
      }
      const cats = { ...((rawSchema.categories || {}) as Record<string, unknown>) };
      if (categoryKey) {
        cats[categoryKey] = {
          ...((cats[categoryKey] as object) || {}),
          questions: questions.map((q) => {
            const mapped = fromUiType(q.uiType);
            const item: Record<string, unknown> = {
              id: q.id,
              label: q.label.trim() || q.id,
              type: mapped.type,
              required: q.required,
            };
            if (mapped.ui) item.ui = mapped.ui;
            if (q.uiType === "multiple_selection" || q.uiType === "dropdown_1_row") {
              item.options = q.options.map((o) => o.trim()).filter(Boolean);
            }
            if (isMatrixType(q.uiType)) {
              item.columns = q.columns;
              item.matrix_rows = q.matrixRows;
              item.options = matrixToOptions(q.uiType, q.matrixRows);
            }
            return item;
          }),
        };
      }
      const schema_json = { ...rawSchema, categories: cats };
      await client.post("/schemas", { module, schema_json, is_active: true });
      setRawSchema(schema_json);
      setMessage("New schema version published. Surveyors will see the updated form.");
      setHistory([]);
      await refreshModules();
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const renderAnswerEditor = (q: EditableQuestion) => {
    if (q.uiType === "short_question") return null;

    if (q.uiType === "multiple_selection" || q.uiType === "dropdown_1_row") {
      return (
        <div className="schema-answers">
          {q.options.map((opt, i) => (
            <div key={`${q.id}-opt-${i}`} className="schema-answer-row">
              <input
                className="field schema-answer"
                value={opt}
                placeholder={i === 0 ? "Answer (fixed panel)" : "Answer option"}
                onChange={(e) => {
                  const next = [...q.options];
                  next[i] = e.target.value;
                  updateQuestion(q.id, { options: next });
                }}
              />
              <button type="button" className="schema-trash" title="Remove answer panel" onClick={() => removeAnswer(q.id, i)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="schema-answer-row">
            <input
              className="field schema-answer draft"
              value={draftOption[q.id] || ""}
              placeholder="Type here"
              onChange={(e) => setDraftOption((d) => ({ ...d, [q.id]: e.target.value }))}
            />
          </div>
        </div>
      );
    }

    // 02 / 03 / 04 row matrix layouts
    return (
      <div className="schema-matrix">
        <div className={`schema-matrix-headers cols-${colCount(q.uiType)}`}>
          {q.columns.map((col, i) => (
            <input
              key={`${q.id}-col-${i}`}
              className="field schema-answer"
              value={col}
              disabled={q.uiType === "dropdown_3_row" && i === 1}
              onChange={(e) => {
                const columns = [...q.columns];
                columns[i] = e.target.value;
                updateQuestion(q.id, { columns });
              }}
            />
          ))}
        </div>
        {q.matrixRows.map((row, ri) => (
          <div key={`${q.id}-row-${ri}`} className={`schema-matrix-row cols-${colCount(q.uiType)}`}>
            {row.map((cell, ci) => (
              <input
                key={`${q.id}-cell-${ri}-${ci}`}
                className="field schema-answer"
                value={cell}
                disabled={q.uiType === "dropdown_3_row" && ci === 1}
                placeholder="Type here"
                onChange={(e) => {
                  const matrixRows = q.matrixRows.map((r) => [...r]);
                  matrixRows[ri][ci] = e.target.value;
                  if (q.uiType === "dropdown_3_row") matrixRows[ri][1] = "X";
                  updateQuestion(q.id, { matrixRows });
                }}
              />
            ))}
            <button type="button" className="schema-trash" title="Remove answer panel" onClick={() => removeAnswer(q.id, ri)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <Heading
        eyebrow="Super admin"
        title="Questionnaire schema"
        action={
          <button className="button" onClick={save}>
            Publish new version
          </button>
        }
      />
      <GlassPanel>
        <p className="muted">Make the form here and publish a new version — no coding required. Only super admin can change form architecture.</p>
        <div className="toolbar schema-toolbar-actions">
          <select className="field" value={module} onChange={(e) => setModule(e.target.value)} title="Survey type">
            {modules.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button className="button secondary" type="button" onClick={addSurvey} title="Add a new survey type">
            <Plus size={14} /> Add Survey
          </button>
          <select className="field" value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} title="Structure type">
            {!categoryKeys.length && <option value="">No structures yet</option>}
            {categoryKeys.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <button className="button secondary" type="button" onClick={addStructure} title="Add a new structure type">
            <Plus size={14} /> Add Structure
          </button>
          <button className="button secondary" type="button" onClick={removeStructure} title="Remove selected structure" disabled={!categoryKey}>
            <Trash2 size={14} /> Remove Structure
          </button>
          <button className="button secondary" type="button" onClick={undo} title="Undo last change (like Ctrl+Z)">
            Back
          </button>
        </div>

        <div className="schema-builder">
          {questions.map((q, index) => (
            <div key={q.id} className="schema-question">
              <div className="schema-question-row">
                <div className="schema-question-main">
                  <label className="schema-label">Question:- {index + 1}</label>
                  <input
                    className="field schema-question-input"
                    value={q.label}
                    placeholder="Question text"
                    onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                  />
                  {renderAnswerEditor(q)}
                </div>
                <div className="schema-type-col">
                  <label className="schema-label">
                    Question Type <span className="schema-icon filter" title="Filter" />
                  </label>
                  <select
                    className="field schema-type"
                    value={q.uiType}
                    onChange={(e) => {
                      const uiType = e.target.value as UiQuestionType;
                      const n = colCount(uiType);
                      updateQuestion(
                        q.id,
                        {
                          uiType,
                          columns: defaultColumns(uiType),
                          options:
                            uiType === "short_question"
                              ? []
                              : uiType === "multiple_selection" || uiType === "dropdown_1_row"
                                ? q.options.length
                                  ? q.options
                                  : [""]
                                : [],
                          matrixRows: isMatrixType(uiType)
                            ? q.matrixRows.length && colCount(q.uiType) === n
                              ? q.matrixRows
                              : [Array.from({ length: n }, (_, i) => (uiType === "dropdown_3_row" && i === 1 ? "X" : ""))]
                            : [],
                        },
                        true,
                      );
                    }}
                  >
                    {UI_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {needsOptions(q.uiType) ? (
                    <button className="button secondary schema-add-answer" type="button" onClick={() => addAnswerPanel(q.id)}>
                      Add Answer Panel
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="toolbar" style={{ marginTop: 16 }}>
          <button className="button secondary" type="button" onClick={addQuestion}>
            Add Question
          </button>
        </div>
        {message && <p className="muted">{message}</p>}
      </GlassPanel>
    </>
  );
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "surveyor", project_ids: [] as string[] });
  useEffect(() => {
    client.get<User[]>("/users").then(setUsers).catch(() => {});
    client.get<Project[]>("/projects").then(setProjects).catch(() => {});
  }, []);
  const toggleProject = (id: string) =>
    setForm((f) => ({
      ...f,
      project_ids: f.project_ids.includes(id) ? f.project_ids.filter((x) => x !== id) : [...f.project_ids, id],
    }));
  const add = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      alert("Name, email, and password are required to create a user.");
      return;
    }
    try {
      const u = await client.post<User>("/users", {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        project_ids: form.project_ids,
      });
      setUsers([u, ...users]);
      setForm({ name: "", email: "", password: "", role: "surveyor", project_ids: [] });
    } catch (e) {
      alert((e as Error).message || "Could not create user.");
    }
  };
  return (
    <>
      <Heading eyebrow="Super admin" title="Team access" />
      <div className="split">
        <GlassPanel>
          <h2>Create user</h2>
          {(["name", "email", "password"] as const).map((k) => (
            <div className="form-row" key={k}>
              <label>{k[0].toUpperCase() + k.slice(1)}</label>
              <input className="field" type={k === "password" ? "password" : k === "email" ? "email" : "text"} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="form-row">
            <label>Role</label>
            <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="surveyor">Field</option>
            </select>
          </div>
          <div className="form-row">
            <label>Assign projects (optional — Field, Admin, Super Admin can survey)</label>
            <div style={{ display: "grid", gap: 6 }}>
              {projects.map((p) => (
                <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={form.project_ids.includes(p.id)} onChange={() => toggleProject(p.id)} />
                  <span>{p.name} <span className="mono muted">({p.project_number})</span></span>
                </label>
              ))}
              {!projects.length && <span className="muted">Create a project first.</span>}
            </div>
          </div>
          <button className="button" onClick={add}><Plus size={15} /> Create user</button>
        </GlassPanel>
        <GlassPanel>
          <h2>List of Added Employee</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Employee Name</th><th>Email Ids</th><th>Role</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="mono">{u.email}</td>
                    <td>{roleLabel(u.role)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      </div>
    </>
  );
}

export function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [fieldUsers, setFieldUsers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    project_number: "",
    highway_number: "",
    key_engineer_id: "",
    surveyor_id: "",
  });
  const [selected, setSelected] = useState<Project | null>(null);
  const [assignIds, setAssignIds] = useState<string[]>([]);

  const reload = () => {
    client.get<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
    client.get<User[]>("/users").then((all) => setFieldUsers(all.filter((u) => u.is_active))).catch(() => setFieldUsers([]));
  };
  useEffect(reload, []);

  const create = async () => {
    if (busy) return;
    if (!form.name.trim() || !form.project_number.trim() || !form.highway_number.trim()) {
      alert("Project name, project number, and highway number are all required.");
      return;
    }
    const number = form.project_number.trim();
    if (projects.some((p) => p.project_number === number)) {
      alert(`A project with number “${number}” already exists. Delete it first or use a different number.`);
      return;
    }
    const surveyor_ids = form.surveyor_id ? [form.surveyor_id] : user?.id ? [user.id] : [];
    setBusy(true);
    try {
      const created = await client.post<Project>("/projects", {
        name: form.name.trim(),
        project_number: number,
        highway_number: form.highway_number.trim(),
        key_engineer_id: form.key_engineer_id || null,
        surveyor_ids,
      });
      setForm({ name: "", project_number: "", highway_number: "", key_engineer_id: "", surveyor_id: "" });
      setProjects((list) => [created, ...list.filter((p) => p.id !== created.id)]);
    } catch (e) {
      alert((e as Error).message || "Could not create project.");
      reload();
    } finally {
      setBusy(false);
    }
  };

  const removeProject = async (p: Project, e: MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (
      !window.confirm(
        `Delete project “${p.name}” (#${p.project_number})?\n\nThis also deletes its survey records and photos. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await client.delete(`/projects/${p.id}`);
      setProjects((list) => list.filter((x) => x.id !== p.id));
      if (selected?.id === p.id) {
        setSelected(null);
        setAssignIds([]);
      }
    } catch (err) {
      alert((err as Error).message || "Could not delete project.");
    } finally {
      setBusy(false);
    }
  };

  const openAssign = (p: Project) => {
    setSelected(p);
    setAssignIds(p.surveyor_ids || []);
  };

  const saveAssign = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const updated = await client.put<Project>(`/projects/${selected.id}/assignments`, { surveyor_ids: assignIds });
      setProjects((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      setSelected(updated);
      alert("Assignments updated.");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const selectedSurveyor = fieldUsers.find((u) => u.id === form.surveyor_id);

  return (
    <>
      <Heading eyebrow="Super admin" title="Project Key Engineer and Surveyor Assign" />
      <div className="split">
        <GlassPanel>
          <h2>Create project</h2>
          <div className="form-row"><label>Project name</label><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={busy} /></div>
          <div className="form-row"><label>Project number</label><input className="field" value={form.project_number} onChange={(e) => setForm({ ...form, project_number: e.target.value })} disabled={busy} /></div>
          <div className="form-row"><label>Highway number</label><input className="field" value={form.highway_number} onChange={(e) => setForm({ ...form, highway_number: e.target.value })} disabled={busy} /></div>
          <div className="form-row">
            <label>Name of Key Engineer / Highway Engineer</label>
            <select className="field" value={form.key_engineer_id} onChange={(e) => setForm({ ...form, key_engineer_id: e.target.value })} disabled={busy}>
              <option value="">Select key engineer</option>
              {fieldUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email}) — {roleLabel(u.role)}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Name of Surveyor (Field person)</label>
            <select className="field" value={form.surveyor_id} onChange={(e) => setForm({ ...form, surveyor_id: e.target.value })} disabled={busy}>
              <option value="">Use logged-in user ({user?.email})</option>
              {fieldUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email}) — {roleLabel(u.role)}</option>
              ))}
            </select>
          </div>
          <p className="muted">
            Email for field assignment: <strong className="mono">{selectedSurveyor?.email || user?.email || "—"}</strong>
            {" "}(auto-assigned to this project so they can continue survey work).
          </p>
          <button className="button" onClick={create} disabled={busy}>
            <Plus size={15} /> {busy ? "Working…" : "Create project"}
          </button>
        </GlassPanel>
        <GlassPanel>
          <h2>All projects ({projects.length})</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Number</th><th>Key Engineer</th><th>Field users</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} onClick={() => openAssign(p)} style={{ cursor: "pointer" }}>
                    <td>{p.name}</td>
                    <td className="mono">{p.project_number}</td>
                    <td>{p.key_engineer_name || "—"}</td>
                    <td>{p.surveyor_ids?.length || 0}</td>
                    <td>
                      <button
                        type="button"
                        className="schema-trash"
                        title="Delete project"
                        disabled={busy}
                        onClick={(e) => removeProject(p, e)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!projects.length && (
                  <tr>
                    <td colSpan={5} className="muted">No projects yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {selected && (
            <div style={{ marginTop: 16 }}>
              <h3>Assign field users — {selected.name}</h3>
              {fieldUsers.map((s) => (
                <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input type="checkbox" checked={assignIds.includes(s.id)} onChange={() => setAssignIds((ids) => ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id])} />
                  {s.name} ({s.email}) — {roleLabel(s.role)}
                </label>
              ))}
              <button className="button" onClick={saveAssign} disabled={busy}>Save assignments</button>
            </div>
          )}
        </GlassPanel>
      </div>
    </>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState(() =>
    JSON.parse(localStorage.getItem("gdrpl-settings") || '{"minPhotos":4,"syncInterval":15,"googleProject":""}'),
  );
  const save = async () => {
    try {
      await client.patch("/settings", {
        min_photo_count: { value: settings.minPhotos },
        sync_interval_minutes: { value: settings.syncInterval },
      });
      localStorage.setItem("gdrpl-settings", JSON.stringify(settings));
      alert("Settings saved.");
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <>
      <Heading eyebrow="Super admin" title="Application settings" />
      <GlassPanel>
        <div className="form-row">
          <label>Minimum required photos</label>
          <input className="field" type="number" value={settings.minPhotos} onChange={(e) => setSettings({ ...settings, minPhotos: +e.target.value })} />
        </div>
        <div className="form-row">
          <label>Mobile sync interval (minutes)</label>
          <input className="field" type="number" value={settings.syncInterval} onChange={(e) => setSettings({ ...settings, syncInterval: +e.target.value })} />
        </div>
        <button className="button" onClick={save}>
          Save settings
        </button>
      </GlassPanel>
    </>
  );
}

export function Templates() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [module, setModule] = useState("structure_inventory");
  const [activate, setActivate] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  const load = () =>
    client
      .get<ReportTemplate[]>("/templates")
      .then(setTemplates)
      .catch((e) => setMessage((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  const upload = async () => {
    if (!isSuper) {
      alert("Only super admin can upload report templates.");
      return;
    }
    if (!name.trim()) {
      alert("Enter a template name before uploading.");
      return;
    }
    if (!file) {
      alert("Choose a .docx file to upload.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      alert("Only .docx Word templates are supported.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("module", module);
      form.append("activate", String(activate));
      form.append("file", file);
      await client.upload("/templates", form);
      setName("");
      setFile(null);
      setMessage("Template uploaded. Report generation will use the active template for that module.");
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activateTpl = async (t: ReportTemplate) => {
    if (!isSuper) {
      alert("Only super admin can activate templates.");
      return;
    }
    try {
      await client.post(`/templates/${t.id}/activate`);
      setMessage(`“${t.name}” is now active for ${t.module.replace("_", " ")}.`);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const removeTpl = async (t: ReportTemplate) => {
    if (!isSuper) {
      alert("Only super admin can delete templates.");
      return;
    }
    if (t.is_builtin) {
      alert("The built-in default template cannot be deleted.");
      return;
    }
    if (t.is_active) {
      alert("Activate another template first, then delete this one. The active template cannot be removed.");
      return;
    }
    if (!window.confirm(`Delete template “${t.name}”? This cannot be undone.`)) return;
    try {
      await client.delete(`/templates/${t.id}`);
      setMessage("Template deleted.");
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <>
      <Heading eyebrow="Documentation" title="Report templates" />
      <div className="split">
        <GlassPanel>
          <h2>Upload DOCX template</h2>
          <p className="muted">
            Optional legacy DOCX templates. <strong>Records → Preview Word Report</strong> downloads an editable work
            report (Q&amp;A page + photo pages) generated automatically from survey data.
          </p>
          {!isSuper ? (
            <p className="notice">View-only: ask a super admin to upload or activate templates.</p>
          ) : (
            <>
              <div className="form-row">
                <label>Template name</label>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NH structure report v2" />
              </div>
              <div className="form-row">
                <label>Module</label>
                <input
                  className="field"
                  value={module}
                  onChange={(e) => setModule(e.target.value)}
                  placeholder="e.g. structure_inventory"
                />
              </div>
              <div className="form-row">
                <label>DOCX file</label>
                <input
                  className="field"
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
                Activate immediately for this module
              </label>
              <ActionButton
                disabled={busy}
                disabledReason="Upload is already in progress. Please wait."
                onClick={upload}
              >
                {busy ? "Uploading…" : "Upload template"}
              </ActionButton>
            </>
          )}
          {message && <p className="muted" style={{ marginTop: 12 }}>{message}</p>}
        </GlassPanel>
        <GlassPanel>
          <h2>Available templates</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Module</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} style={{ cursor: "default" }}>
                    <td>
                      <strong>{t.name}</strong>
                      <div className="muted mono">{t.file_name}</div>
                    </td>
                    <td>{t.module.replace(/_/g, " ")}</td>
                    <td>{t.is_active ? <span className="badge approved">active</span> : <span className="muted">inactive</span>}</td>
                    <td>
                      <div className="toolbar" style={{ marginBottom: 0 }}>
                        <ActionButton
                          className="button secondary"
                          disabled={t.is_active}
                          disabledReason="This template is already active for its module."
                          onClick={() => activateTpl(t)}
                        >
                          Activate
                        </ActionButton>
                        <button className="button secondary" type="button" onClick={() => client.download(`/templates/${t.id}/download`).catch((e) => alert((e as Error).message))}>
                          Download
                        </button>
                        {!t.is_builtin && (
                          <ActionButton
                            className="button danger"
                            disabled={t.is_active}
                            disabledReason="Activate another template first, then delete this one."
                            onClick={() => removeTpl(t)}
                          >
                            Delete
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!templates.length && <div className="empty">No templates loaded yet.</div>}
          </div>
        </GlassPanel>
      </div>
    </>
  );
}
