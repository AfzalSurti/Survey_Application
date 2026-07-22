import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { RecordItem } from "../api/client";
import { ActionButton } from "./UI";

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

const CATEGORY_TABS: { key: string; label: string }[] = [
  { key: "pre_survey", label: "Pre Survey Form" },
  { key: "overall", label: "Overall Survey Data" },
  { key: "pipe_culvert", label: "Pipe Culvert" },
  { key: "box_or_slab_culvert", label: "Box Culvert" },
  { key: "major_minor_bridge_girder", label: "Major Bridge" },
  { key: "minor_bridge_girder_or_box", label: "Minor Bridge (Box Type)" },
  { key: "grade_separated_structure", label: "Grade Separated Structure" },
];

const categoryLabel = (key?: string | null) =>
  CATEGORY_TABS.find((t) => t.key === key)?.label || (key || "Structure").replace(/_/g, " ");

type Props = {
  open: boolean;
  mode: "excel" | "word" | null;
  /** All structure records for the project (entire project data). */
  records: RecordItem[];
  onClose: () => void;
  onDownloadWord: () => void;
  onDownloadExcel: () => void;
  busy?: boolean;
};

/** Slide 4 Excel preview (tabbed sheets) + Slide 5 Word/report preview (scrollable structures). */
export function PreviewModal({ open, mode, records, onClose, onDownloadWord, onDownloadExcel, busy }: Props) {
  const [tab, setTab] = useState("pre_survey");

  const filteredByTab = useMemo(() => {
    if (tab === "pre_survey" || tab === "overall") return records;
    return records.filter((r) => r.structure_category === tab);
  }, [records, tab]);

  if (!open || !mode) return null;

  const sample = records[0];
  const preSurveyRows = [
    ["Project Number", sample?.project_number || ""],
    ["Project Code", sample?.project_number || ""],
    ["Short Name of Project", sample?.project_name || ""],
    ["Full Name of Project", sample?.project_name || ""],
    ["Key Person / Engineer", sample?.key_engineer_name || ""],
    ["Surveyor", sample?.head_surveyor_name || ""],
  ];

  return (
    <div className="preview-backdrop" role="dialog" aria-modal="true">
      <div className={`preview-panel glass ${mode === "excel" ? "preview-excel" : "preview-word"}`}>
        <div className="preview-toolbar">
          <strong>Preview</strong>
          <div className="landing-actions">
            {mode === "excel" ? (
              <ActionButton
                className="button"
                disabled={!records.length || busy}
                disabledReason={!records.length ? "No project records to download." : "Download already in progress."}
                onClick={onDownloadExcel}
              >
                Download File
              </ActionButton>
            ) : (
              <ActionButton
                className="button"
                disabled={!records.length || busy}
                disabledReason={!records.length ? "No project records to download." : "Download already in progress."}
                onClick={onDownloadWord}
              >
                Download File
              </ActionButton>
            )}
            <button className="button secondary" type="button" onClick={onClose} title="Close">
              <X size={16} /> Close
            </button>
          </div>
        </div>

        {mode === "excel" ? (
          <>
            <p className="muted">Excel generation preview — entire project data ({records.length} structure record(s)).</p>
            <div className="excel-sheet">
              {tab === "pre_survey" ? (
                <table className="excel-table">
                  <thead>
                    <tr>
                      <th>Question of Pre Survey Form</th>
                      <th>Answer of the Survey Form</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preSurveyRows.map(([q, a]) => (
                      <tr key={q}>
                        <td>{q}</td>
                        <td>{a || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : tab === "overall" ? (
                <table className="excel-table">
                  <thead>
                    <tr>
                      <th>Chainage</th>
                      <th>Structure Type</th>
                      <th>Status</th>
                      <th>Head Surveyor</th>
                      <th>Complete Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td className="mono">{r.chainage || "—"}</td>
                        <td>{categoryLabel(r.structure_category)}</td>
                        <td>{r.status}</td>
                        <td>{r.head_surveyor_name || "—"}</td>
                        <td>{fmt(r.complete_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="excel-table">
                  <thead>
                    <tr>
                      <th>Sr. No.</th>
                      <th>Chainage</th>
                      <th>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredByTab.flatMap((r, idx) => {
                      const entries = Object.entries(r.responses_json || {}).filter(
                        ([k]) => !["gps", "capturedAt", "structure_category"].includes(k),
                      );
                      if (!entries.length) {
                        return [
                          <tr key={`${r.id}-empty`}>
                            <td>{idx + 1}</td>
                            <td className="mono">{r.chainage}</td>
                            <td colSpan={2}>No field answers yet</td>
                          </tr>,
                        ];
                      }
                      return entries.map(([k, v], i) => (
                        <tr key={`${r.id}-${k}`}>
                          <td>{i === 0 ? idx + 1 : ""}</td>
                          <td className="mono">{i === 0 ? r.chainage : ""}</td>
                          <td>{k.replace(/_/g, " ")}</td>
                          <td>{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</td>
                        </tr>
                      ));
                    })}
                    {!filteredByTab.length && (
                      <tr>
                        <td colSpan={4}>No structures in this category yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="excel-tabs">
              {CATEGORY_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`excel-tab ${tab === t.key ? "active" : ""}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="muted">Report generation preview — scroll to see the entire report with all structures.</p>
            <div className="report-scroll">
              {records.map((r, idx) => {
                const entries = Object.entries(r.responses_json || {}).filter(
                  ([k]) => !["gps", "capturedAt", "structure_category"].includes(k),
                );
                const gps = r.responses_json?.gps as { latitude?: number; longitude?: number } | undefined;
                const rows: [string, string][] = [
                  ["Name of Road", String((r.responses_json as Record<string, unknown>)?.name_of_road ?? r.project_name ?? "—")],
                  ["Location of bridge / structure in Km.", `${r.chainage || "—"} — ${categoryLabel(r.structure_category).toUpperCase()}`],
                  [
                    "Coordinates",
                    gps?.latitude != null
                      ? `${gps.latitude}, ${gps.longitude}`
                      : r.latitude != null
                        ? `${r.latitude}, ${r.longitude}`
                        : "—",
                  ],
                  ...entries.map(([k, v]) => [k.replace(/_/g, " "), typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")] as [string, string]),
                ];
                return (
                  <section key={r.id} className="report-block">
                    <h3>
                      Table {idx + 1} {categoryLabel(r.structure_category)} at Chainage Km {r.chainage || "—"}
                    </h3>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Sr. No.</th>
                          <th>Description</th>
                          <th>Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([desc, data], i) => (
                          <tr key={`${r.id}-${i}`}>
                            <td>{i + 1}</td>
                            <td>{desc}</td>
                            <td>{data}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                );
              })}
              {!records.length && <div className="empty">No structures available for this project report.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
