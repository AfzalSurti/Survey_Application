import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, Plus, Search, X } from "lucide-react";
import { client, fetchRecords, type Project, type RecordItem, type ReportTemplate, type User } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ActionButton, GlassPanel, StatusBadge } from "../components/UI";

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

function RecordsTable({ records, select }: { records: RecordItem[]; select?: (r: RecordItem) => void }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Chainage</th>
            <th>Category</th>
            <th>Status</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} onClick={() => select?.(r)}>
              <td className="mono">{r.chainage}</td>
              <td>{r.structure_category}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td>{fmt(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!records.length && <div className="empty">No survey records are available yet.</div>}
    </div>
  );
}

export function Dashboard() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  useEffect(() => {
    fetchRecords().then(setRecords).catch(() => setRecords([]));
  }, []);
  const statuses = ["approved", "submitted", "rejected", "draft"] as const;
  return (
    <>
      <Heading eyebrow="Operations overview" title="Survey intelligence, at a glance" />
      <div className="grid stats">
        {statuses.map((s) => (
          <GlassPanel key={s}>
            <div className="stat-label">{s} records</div>
            <div className="stat-value">{records.filter((r) => r.status === s).length}</div>
            <StatusBadge status={s} />
          </GlassPanel>
        ))}
      </div>
      <div className="split" style={{ marginTop: 16 }}>
        <GlassPanel>
          <h2>Recent submissions</h2>
          <RecordsTable records={records.slice(0, 6)} />
        </GlassPanel>
        <GlassPanel>
          <h2>Review completion</h2>
          <div className="stat-value">
            {records.length ? Math.round((records.filter((r) => r.status === "approved").length / records.length) * 100) : 0}%
          </div>
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
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editChainage, setEditChainage] = useState("");

  useEffect(() => {
    fetchRecords().then(setRecords).catch(() => setRecords([]));
  }, []);
  useEffect(() => {
    if (selected) {
      setEditJson(JSON.stringify(selected.responses_json || {}, null, 2));
      setEditChainage(selected.chainage);
    }
  }, [selected]);

  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (status === "all" || r.status === status) &&
          JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
      ),
    [records, query, status],
  );

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
    if (!selected) {
      alert("Select a survey record first before saving corrections.");
      return;
    }
    if (!canCorrect) {
      alert("Only admin or super admin can correct survey answers. Your role cannot edit record data.");
      return;
    }
    if (!editChainage.trim()) {
      alert("Chainage cannot be empty.");
      return;
    }
    try {
      const responses_json = JSON.parse(editJson);
      const updated = await client.patch<RecordItem>(`/records/${selected.id}`, {
        chainage: editChainage,
        responses_json,
      });
      setRecords((x) => x.map((r) => (r.id === updated.id ? updated : r)));
      setSelected(updated);
      alert("Record data corrected.");
    } catch (e) {
      alert((e as Error).message || "Could not save corrections. Check that Responses JSON is valid.");
    }
  };

  return (
    <>
      <Heading eyebrow="Review workspace" title="Survey records" action={<span className="muted">{filtered.length} visible</span>} />
      <GlassPanel>
        <div className="toolbar">
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#627b95" }} />
            <input className="field" style={{ paddingLeft: 32 }} placeholder="Search records" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <RecordsTable records={filtered} select={setSelected} />
      </GlassPanel>
      {selected && (
        <aside className="glass drawer">
          <button className="drawer-close" onClick={() => setSelected(null)}>
            <X />
          </button>
          <p className="eyebrow">Record details</p>
          <h2>{selected.chainage}</h2>
          <div style={{ margin: "12px 0" }}>
            <StatusBadge status={selected.status} />
          </div>
          <div className="kv">
            <span>Category</span>
            <strong>{selected.structure_category}</strong>
          </div>
          <div className="kv">
            <span>Schema version</span>
            <strong>v{selected.schema_version}</strong>
          </div>
          {canCorrect ? (
            <>
              <h3 style={{ marginTop: 20 }}>Correct data</h3>
              <p className="muted">Admins can fix answers. Form fields/architecture are super-admin only.</p>
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
          ) : (
            <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: ".75rem" }}>
              {JSON.stringify(selected.responses_json || {}, null, 2)}
            </pre>
          )}
          {canCorrect && (
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="button" onClick={() => setStatusAction("approved")}>
                Approve
              </button>
              <button className="button danger" onClick={() => setStatusAction("rejected")}>
                Reject
              </button>
            </div>
          )}
        </aside>
      )}
    </>
  );
}

export function Reports() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchRecords()
      .then((r) => setRecords(r.filter((x) => x.status === "approved")))
      .catch(() => setRecords([]));
  }, []);
  const generate = async () => {
    setBusy(true);
    try {
      await client.download("/reports/generate", { record_ids: ids }, "POST");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        eyebrow="Documentation"
        title="Generate a field report"
        action={
          <ActionButton
            disabled={!ids.length || busy}
            disabledReason={
              busy
                ? "Report generation is already running. Please wait."
                : "Select at least one approved survey record in the table before downloading a DOCX report."
            }
            onClick={generate}
          >
            <Download size={15} /> {busy ? "Generating…" : "Download DOCX"}
          </ActionButton>
        }
      />
      <GlassPanel>
        <p>Select approved survey records.</p>
        <RecordsTable records={records} select={(r) => setIds((v) => (v.includes(r.id) ? v.filter((id) => id !== r.id) : [...v, r.id]))} />
        <p className="muted">{ids.length} selected</p>
      </GlassPanel>
    </>
  );
}

export function ExcelExport() {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Heading eyebrow="Data portability" title="Excel export" />
      <GlassPanel>
        <ActionButton
          disabled={busy}
          disabledReason="Excel export is already preparing. Please wait."
          onClick={async () => {
            setBusy(true);
            try {
              await client.download("/exports/excel");
            } catch (e) {
              alert((e as Error).message || "Excel export failed. Check your connection and try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={15} /> {busy ? "Preparing…" : "Download .xlsx"}
        </ActionButton>
      </GlassPanel>
    </>
  );
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
    if (form.role === "surveyor" && !form.project_ids.length) {
      const ok = window.confirm(
        "This surveyor has no assigned projects. They will not see any project on mobile until you assign one. Create anyway?",
      );
      if (!ok) return;
    }
    try {
      const u = await client.post<User>("/users", {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        project_ids: form.role === "surveyor" ? form.project_ids : [],
      });
      setUsers([u, ...users]);
      setForm({ name: "", email: "", password: "", role: "surveyor", project_ids: [] });
    } catch (e) {
      alert((e as Error).message || "Could not create user. The email may already exist.");
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
              <input
                className="field"
                type={k === "password" ? "password" : k === "email" ? "email" : "text"}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="form-row">
            <label>Role</label>
            <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="surveyor">surveyor</option>
              <option value="admin">admin</option>
              <option value="super_admin">super_admin</option>
            </select>
          </div>
          {form.role === "surveyor" && (
            <div className="form-row">
              <label>Assign projects (optional)</label>
              <div style={{ display: "grid", gap: 6 }}>
                {projects.map((p) => (
                  <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={form.project_ids.includes(p.id)} onChange={() => toggleProject(p.id)} />
                    <span>
                      {p.name} <span className="mono muted">({p.project_number})</span>
                    </span>
                  </label>
                ))}
                {!projects.length && <span className="muted">Create a project first, or assign later in Projects.</span>}
              </div>
            </div>
          )}
          <button className="button" onClick={add}>
            <Plus size={15} /> Create user
          </button>
        </GlassPanel>
        <GlassPanel>
          <h2>Directory</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="mono">{u.email}</td>
                    <td>{u.role}</td>
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [surveyors, setSurveyors] = useState<User[]>([]);
  const [form, setForm] = useState({ name: "", project_number: "", highway_number: "", surveyor_ids: [] as string[] });
  const [selected, setSelected] = useState<Project | null>(null);
  const [assignIds, setAssignIds] = useState<string[]>([]);

  const reload = () => {
    client.get<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
    client.get<User[]>("/users?role=surveyor").then(setSurveyors).catch(() => setSurveyors([]));
  };
  useEffect(reload, []);

  const toggle = (ids: string[], id: string, set: (v: string[]) => void) =>
    set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  const create = async () => {
    if (!form.name.trim() || !form.project_number.trim() || !form.highway_number.trim()) {
      alert("Project name, project number, and highway number are all required.");
      return;
    }
    try {
      await client.post("/projects", form);
      setForm({ name: "", project_number: "", highway_number: "", surveyor_ids: [] });
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

  return (
    <>
      <Heading eyebrow="Super admin" title="Projects & surveyor assignment" />
      <div className="split">
        <GlassPanel>
          <h2>Create project</h2>
          {(["name", "project_number", "highway_number"] as const).map((k) => (
            <div className="form-row" key={k}>
              <label>{k.replace("_", " ")}</label>
              <input className="field" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="form-row">
            <label>Assign surveyors now (optional)</label>
            {surveyors.map((s) => (
              <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={form.surveyor_ids.includes(s.id)} onChange={() => toggle(form.surveyor_ids, s.id, (v) => setForm({ ...form, surveyor_ids: v }))} />
                {s.name} <span className="muted mono">({s.email})</span>
              </label>
            ))}
          </div>
          <button className="button" onClick={create}>
            <Plus size={15} /> Create project
          </button>
        </GlassPanel>
        <GlassPanel>
          <h2>All projects</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Number</th>
                  <th>Highway</th>
                  <th>Surveyors</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} onClick={() => openAssign(p)}>
                    <td>{p.name}</td>
                    <td className="mono">{p.project_number}</td>
                    <td>{p.highway_number}</td>
                    <td>{p.surveyor_ids?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && (
            <div style={{ marginTop: 16 }}>
              <h3>Assign surveyors — {selected.name}</h3>
              {surveyors.map((s) => (
                <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input type="checkbox" checked={assignIds.includes(s.id)} onChange={() => toggle(assignIds, s.id, setAssignIds)} />
                  {s.name} ({s.email})
                </label>
              ))}
              <button className="button" onClick={saveAssign}>
                Save assignments
              </button>
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
