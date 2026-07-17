import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Plus, Search, X } from "lucide-react";
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editChainage, setEditChainage] = useState("");
  const [preview, setPreview] = useState<"excel" | "word" | null>(null);
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
  useEffect(() => {
    if (selected) {
      setEditJson(JSON.stringify(selected.responses_json || {}, null, 2));
      setEditChainage(selected.chainage);
    }
  }, [selected]);

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

  const selectedRecords = filtered.filter((r) => selectedIds.includes(r.id));
  const toggleRow = (r: RecordItem) => {
    setSelected(r);
    setSelectedIds((ids) => (ids.includes(r.id) ? ids.filter((id) => id !== r.id) : [...ids, r.id]));
  };

  const setStatusAction = async (next: "approved" | "rejected") => {
    if (!selected) return;
    try {
      const updated = await client.patch<RecordItem>(`/records/${selected.id}/status`, { status: next });
      setRecords((x) => x.map((r) => (r.id === updated.id ? updated : r)));
      setSelected(updated);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const saveCorrections = async () => {
    if (!selected || !canCorrect) return;
    try {
      const responses_json = JSON.parse(editJson);
      const updated = await client.patch<RecordItem>(`/records/${selected.id}`, { chainage: editChainage, responses_json });
      setRecords((x) => x.map((r) => (r.id === updated.id ? updated : r)));
      setSelected(updated);
      alert("Record data corrected.");
    } catch (e) {
      alert((e as Error).message || "Could not save corrections.");
    }
  };

  const downloadWord = async () => {
    const ids = selectedRecords.map((r) => r.id);
    if (!ids.length) return alert("Select at least one record.");
    setBusy(true);
    try { await client.download("/reports/generate", { record_ids: ids }, "POST"); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };
  const downloadExcel = async () => {
    setBusy(true);
    try { await client.download("/exports/excel"); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
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
      <Heading eyebrow="Review workspace" title="Survey records" action={<span className="muted">{selectedIds.length} selected · {filtered.length} visible</span>} />
      <div className="records-layout">
        <GlassPanel>
          <div className="toolbar">
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#627b95" }} />
              <input className="field" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search records" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="filter-row">
            {filterFields.map((f) => (
              <input key={f.key} className="field" placeholder={f.label} value={filters[f.key]} onChange={(e) => setFilters((s) => ({ ...s, [f.key]: e.target.value }))} />
            ))}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  {SURVEY_COLUMNS_COMPLETE.map((h) => (<th key={h}>{h}</th>))}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => toggleRow(r)}>
                    <td><input type="checkbox" checked={selectedIds.includes(r.id)} readOnly /></td>
                    <td>{r.project_name || "—"}</td>
                    <td className="mono">{r.project_number || "—"}</td>
                    <td>{r.survey_type || "—"}</td>
                    <td>{r.key_engineer_name || "—"}</td>
                    <td>{r.head_surveyor_name || "—"}</td>
                    <td>{fmt(r.assign_date)}</td>
                    <td>{fmt(r.complete_date)}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <div className="empty">No survey records match these filters.</div>}
          </div>
        </GlassPanel>
        <div className="records-actions">
          <ActionButton className="button" disabled={!selectedIds.length} disabledReason="Select one or more rows first." onClick={() => setPreview("excel")}>CSV/Excel Generation</ActionButton>
          <ActionButton className="button secondary" disabled={!selectedIds.length} disabledReason="Select rows, then preview Excel." onClick={() => setPreview("excel")}>Preview Excel</ActionButton>
          <ActionButton className="button" disabled={!selectedIds.length} disabledReason="Select one or more rows first." onClick={() => setPreview("word")}>Report Generation</ActionButton>
          <ActionButton className="button secondary" disabled={!selectedIds.length} disabledReason="Select rows, then preview the Word report." onClick={() => setPreview("word")}>Preview Word Report</ActionButton>
        </div>
      </div>
      <PreviewModal open={preview !== null} title={preview === "excel" ? "Excel preview" : "Word report preview"} records={selectedRecords} busy={busy} onClose={() => setPreview(null)} onDownloadWord={downloadWord} onDownloadExcel={downloadExcel} />
      {selected && (
        <aside className="glass drawer">
          <button className="drawer-close" onClick={() => setSelected(null)}><X /></button>
          <p className="eyebrow">Record details</p>
          <h2>{selected.chainage}</h2>
          <div style={{ margin: "12px 0" }}><StatusBadge status={selected.status} /></div>
          <div className="kv"><span>Project</span><strong>{selected.project_name || "—"}</strong></div>
          <div className="kv"><span>Survey type</span><strong>{selected.survey_type || "—"}</strong></div>
          {canCorrect ? (
            <>
              <h3 style={{ marginTop: 20 }}>Correct data</h3>
              <div className="form-row"><label>Chainage</label><input className="field mono" value={editChainage} onChange={(e) => setEditChainage(e.target.value)} /></div>
              <div className="form-row"><label>Responses JSON</label><textarea className="field code" value={editJson} onChange={(e) => setEditJson(e.target.value)} spellCheck={false} /></div>
              <button className="button" onClick={saveCorrections}>Save corrections</button>
              <div className="toolbar" style={{ marginTop: 12 }}>
                <button className="button" onClick={() => setStatusAction("approved")}>Approve</button>
                <button className="button danger" onClick={() => setStatusAction("rejected")}>Reject</button>
              </div>
            </>
          ) : (
            <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: ".75rem" }}>{JSON.stringify(selected.responses_json || {}, null, 2)}</pre>
          )}
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

export function SchemaEditor() {
  const [module, setModule] = useState("structure_inventory");
  const [json, setJson] = useState("{}");
  const [message, setMessage] = useState("");
  const load = () => {
    client
      .get<{ module: string; schema_json: object; version: number }[]>(`/schemas?module=${module}`)
      .then((s) => {
        const x = s[0];
        if (x) setJson(JSON.stringify(x.schema_json, null, 2));
        else setMessage("No schema for this module yet.");
      })
      .catch((e) => setMessage((e as Error).message));
  };
  useEffect(load, [module]);
  const save = async () => {
    try {
      const schema_json = JSON.parse(json);
      await client.post("/schemas", { module, schema_json, is_active: true });
      setMessage("New schema version published. Surveyors will see the updated form.");
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <>
      <Heading eyebrow="Super admin" title="Questionnaire schema" action={<button className="button" onClick={save}>Publish new version</button>} />
      <GlassPanel>
        <p className="muted">Only super admin can add/remove/reorder questions. Admin cannot change form architecture.</p>
        <div className="toolbar">
          <select className="field" value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="structure_inventory">Structure Inventory</option>
            <option value="utility_shifting">Utility Shifting</option>
          </select>
        </div>
        <textarea className="field code" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
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
    if (!form.name.trim() || !form.project_number.trim() || !form.highway_number.trim()) {
      alert("Project name, project number, and highway number are all required.");
      return;
    }
    const surveyor_ids = form.surveyor_id ? [form.surveyor_id] : user?.id ? [user.id] : [];
    try {
      await client.post("/projects", {
        name: form.name,
        project_number: form.project_number,
        highway_number: form.highway_number,
        key_engineer_id: form.key_engineer_id || null,
        surveyor_ids,
      });
      setForm({ name: "", project_number: "", highway_number: "", key_engineer_id: "", surveyor_id: "" });
      reload();
    } catch (e) {
      alert((e as Error).message || "Could not create project.");
    }
  };

  const openAssign = (p: Project) => {
    setSelected(p);
    setAssignIds(p.surveyor_ids || []);
  };

  const saveAssign = async () => {
    if (!selected) return;
    try {
      const updated = await client.put<Project>(`/projects/${selected.id}/assignments`, { surveyor_ids: assignIds });
      setProjects((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      setSelected(updated);
      alert("Assignments updated.");
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const selectedSurveyor = fieldUsers.find((u) => u.id === form.surveyor_id);

  return (
    <>
      <Heading eyebrow="Super admin" title="Project Key Engineer and Surveyor Assign" />
      <div className="split">
        <GlassPanel>
          <h2>Create project</h2>
          <div className="form-row"><label>Project name</label><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="form-row"><label>Project number</label><input className="field" value={form.project_number} onChange={(e) => setForm({ ...form, project_number: e.target.value })} /></div>
          <div className="form-row"><label>Highway number</label><input className="field" value={form.highway_number} onChange={(e) => setForm({ ...form, highway_number: e.target.value })} /></div>
          <div className="form-row">
            <label>Name of Key Engineer / Highway Engineer</label>
            <select className="field" value={form.key_engineer_id} onChange={(e) => setForm({ ...form, key_engineer_id: e.target.value })}>
              <option value="">Select key engineer</option>
              {fieldUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email}) — {roleLabel(u.role)}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Name of Surveyor (Field person)</label>
            <select className="field" value={form.surveyor_id} onChange={(e) => setForm({ ...form, surveyor_id: e.target.value })}>
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
          <button className="button" onClick={create}><Plus size={15} /> Create project</button>
        </GlassPanel>
        <GlassPanel>
          <h2>All projects</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Number</th><th>Key Engineer</th><th>Field users</th></tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} onClick={() => openAssign(p)}>
                    <td>{p.name}</td>
                    <td className="mono">{p.project_number}</td>
                    <td>{p.key_engineer_name || "—"}</td>
                    <td>{p.surveyor_ids?.length || 0}</td>
                  </tr>
                ))}
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
              <button className="button" onClick={saveAssign}>Save assignments</button>
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
  const [module, setModule] = useState<"structure_inventory" | "utility_shifting">("structure_inventory");
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
            Uploaded templates are stored in the database and used by <strong>Report generation</strong>. Use{" "}
            <code className="mono">{"{{ project_name }}"}</code>, <code className="mono">{"{{ chainage }}"}</code>,{" "}
            <code className="mono">{"{{ structure_category }}"}</code>, <code className="mono">{"{{ observations }}"}</code>,{" "}
            <code className="mono">{"{{ recommendations }}"}</code> placeholders in Word.
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
                <select className="field" value={module} onChange={(e) => setModule(e.target.value as typeof module)}>
                  <option value="structure_inventory">Structure Inventory</option>
                  <option value="utility_shifting">Utility Survey</option>
                </select>
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
