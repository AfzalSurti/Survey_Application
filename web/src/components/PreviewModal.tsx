import { X } from "lucide-react";
import type { RecordItem } from "../api/client";
import { ActionButton } from "./UI";

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

type Props = {
  open: boolean;
  title: string;
  records: RecordItem[];
  onClose: () => void;
  onDownloadWord: () => void;
  onDownloadExcel: () => void;
  busy?: boolean;
};

/** Preview panel before generating Word report or Excel export. */
export function PreviewModal({ open, title, records, onClose, onDownloadWord, onDownloadExcel, busy }: Props) {
  if (!open) return null;
  return (
    <div className="preview-backdrop" role="dialog" aria-modal="true">
      <div className="preview-panel glass">
        <div className="preview-toolbar">
          <strong>{title}</strong>
          <div className="landing-actions">
            <ActionButton
              className="button"
              disabled={!records.length || busy}
              disabledReason={!records.length ? "Select at least one record to download." : "Download already in progress."}
              onClick={onDownloadWord}
            >
              Download PDF / Word
            </ActionButton>
            <ActionButton
              className="button"
              disabled={!records.length || busy}
              disabledReason={!records.length ? "Select at least one record to download." : "Download already in progress."}
              onClick={onDownloadExcel}
            >
              Download Excel
            </ActionButton>
            <button className="button secondary" type="button" onClick={onClose} title="Close">
              <X size={16} /> Close
            </button>
          </div>
        </div>
        <p className="muted">Preview of {records.length} selected survey row(s). Use the buttons above to download PDF/Word or Excel.</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Project No.</th>
                <th>Survey Type</th>
                <th>Key Person / Highway Engineer</th>
                <th>Head Survey Person</th>
                <th>Assign Date</th>
                <th>Complete Date</th>
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
                  <td>{fmt(r.complete_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!records.length && <div className="empty">No rows selected for preview.</div>}
        </div>
      </div>
    </div>
  );
}
