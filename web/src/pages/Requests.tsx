import { useEffect, useState } from "react";
import { client } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ActionButton, GlassPanel } from "../components/UI";

type AdminRequestItem = {
  id: string;
  created_by: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  resolved_at?: string | null;
  author_name?: string | null;
  author_email?: string | null;
};

export function RequestsPage() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const canSubmit = user?.role === "admin" || user?.role === "super_admin";
  const [items, setItems] = useState<AdminRequestItem[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    category: "question",
    subject: "",
    message: "",
  });

  const load = () =>
    client
      .get<AdminRequestItem[]>("/requests")
      .then(setItems)
      .catch((e) => setNotice((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!form.subject.trim() || !form.message.trim()) {
      alert("Subject and message are required.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await client.post("/requests", form);
      setForm({ category: "question", subject: "", message: "" });
      setNotice("Request sent to Super Admin.");
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      await client.patch(`/requests/${id}`, { status });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{isSuper ? "Super admin" : "Admin"}</p>
          <h1>{isSuper ? "Admin requests inbox" : "Request / Suggestion"}</h1>
        </div>
      </div>
      <div className="split">
        {canSubmit && (
          <GlassPanel>
            <h2>Send to Super Admin</h2>
            <p className="muted">
              Need any request or suggestion on questions, survey flow, or report format? Send it here for Super Admin review.
            </p>
            <div className="form-row">
              <label>Category</label>
              <select className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="question">Question / questionnaire</option>
                <option value="flow">Survey flow</option>
                <option value="report_format">Report format</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-row">
              <label>Subject</label>
              <input className="field" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Short title" />
            </div>
            <div className="form-row">
              <label>Message</label>
              <textarea
                className="field code"
                style={{ minHeight: 140 }}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Describe your request or suggestion…"
              />
            </div>
            <ActionButton disabled={busy} disabledReason="Sending…" onClick={submit}>
              {busy ? "Sending…" : "Submit request"}
            </ActionButton>
            {notice && <p className="muted" style={{ marginTop: 12 }}>{notice}</p>}
          </GlassPanel>
        )}
        <GlassPanel>
          <h2>{isSuper ? "All requests" : "My requests"}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {isSuper && <th>From</th>}
                  <th>Category</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Date</th>
                  {isSuper && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} style={{ cursor: "default" }}>
                    {isSuper && (
                      <td>
                        {r.author_name}
                        <div className="muted mono">{r.author_email}</div>
                      </td>
                    )}
                    <td>{r.category.replace(/_/g, " ")}</td>
                    <td>
                      <strong>{r.subject}</strong>
                      <div className="muted" style={{ fontSize: ".78rem", marginTop: 4 }}>
                        {r.message.slice(0, 120)}
                        {r.message.length > 120 ? "…" : ""}
                      </div>
                    </td>
                    <td>
                      <span className="badge approved">{r.status.replace(/_/g, " ")}</span>
                    </td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    {isSuper && (
                      <td>
                        <div className="toolbar" style={{ marginBottom: 0 }}>
                          <button className="button secondary" type="button" onClick={() => setStatus(r.id, "in_review")}>
                            In review
                          </button>
                          <button className="button" type="button" onClick={() => setStatus(r.id, "resolved")}>
                            Resolve
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length && <div className="empty">No requests yet.</div>}
          </div>
        </GlassPanel>
      </div>
    </>
  );
}
