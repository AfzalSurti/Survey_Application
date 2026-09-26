import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { apiBaseUrl } from "../lib/wakeServer";
import { client, type RecordItem } from "../api/client";
import { buildQuestionIndex, bulletItems, categoryTitle, chainageOrder, reportRows, type QuestionIndex, type StoredSchema } from "../lib/reportRows";
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

type PhotoMeta = {
  id: string;
  drive_url?: string | null;
  file_name?: string;
};

type Props = {
  open: boolean;
  mode: "excel" | "word" | null;
  /** All structure records for the project (entire project data). */
  records: RecordItem[];
  onClose: () => void;
  onDownloadWord: () => void;
  onDownloadPdf: () => void;
  onDownloadExcel: () => void;
  busy?: boolean;
};

/** A real embeddable image URL (Cloudinary CDN etc.), not a stub / Drive view link. */
function embeddableImageUrl(u?: string | null): string | null {
  if (!u || !/^https?:\/\//.test(u)) return null;
  if (u.includes("stub-") || u.includes("drive.google.com")) return null;
  return u;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length ? out : [[]];
}

async function fetchPhotoObjectUrl(photoId: string): Promise<string | null> {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${apiBaseUrl()}/api/reports/photos/${photoId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}

/** Excel preview (tabbed) + Work Report preview (Page-1 Q&A + Page-2+ photo grids). */
export function PreviewModal({ open, mode, records: unsortedRecords, onClose, onDownloadWord, onDownloadPdf, onDownloadExcel, busy }: Props) {
  const records = useMemo(() => [...unsortedRecords].sort(chainageOrder), [unsortedRecords]);
  const [tab, setTab] = useState("pre_survey");
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({});
  const [photosLoading, setPhotosLoading] = useState(false);
  const [questionIndex, setQuestionIndex] = useState<QuestionIndex | undefined>();

  // The report prints the questionnaire's own wording, in questionnaire order.
  useEffect(() => {
    if (!open || questionIndex) return;
    client
      .get<StoredSchema[]>("/schemas")
      .then((rows) => setQuestionIndex(buildQuestionIndex(rows)))
      .catch(() => setQuestionIndex({}));
  }, [open, questionIndex]);

  const filteredByTab = useMemo(() => {
    if (tab === "pre_survey" || tab === "overall") return records;
    return records.filter((r) => r.structure_category === tab);
  }, [records, tab]);

  useEffect(() => {
    if (!open || mode !== "word" || !records.length) {
      setPhotoUrls({});
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    setPhotosLoading(true);

    (async () => {
      const next: Record<string, string[]> = {};
      for (const record of records) {
        try {
          const metas = await client.get<PhotoMeta[]>(`/reports/records/${record.id}/photos`);
          const urls: string[] = [];
          for (const meta of metas) {
            const cdn = embeddableImageUrl(meta.drive_url);
            if (cdn) {
              urls.push(cdn);
              continue;
            }
            const blobUrl = await fetchPhotoObjectUrl(meta.id);
            if (blobUrl) {
              created.push(blobUrl);
              urls.push(blobUrl);
            }
          }
          next[record.id] = urls;
        } catch {
          next[record.id] = [];
        }
      }
      if (!cancelled) {
        setPhotoUrls(next);
        setPhotosLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [open, mode, records]);

  if (!open || !mode) return null;

  const sample = records[0];
  const projectName = sample?.project_name || "Project Name";
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
              <>
                <ActionButton
                  className="button"
                  disabled={!records.length || busy}
                  disabledReason={!records.length ? "No project records to download." : "Download already in progress."}
                  onClick={onDownloadPdf}
                >
                  Download PDF
                </ActionButton>
                <ActionButton
                  className="button secondary"
                  disabled={!records.length || busy}
                  disabledReason={!records.length ? "No project records to download." : "Download already in progress."}
                  onClick={onDownloadWord}
                >
                  Editable DOCX
                </ActionButton>
              </>
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
                        <td>{categoryTitle(r.structure_category)}</td>
                        <td>{r.status}</td>
                        <td>{r.head_surveyor_name || "—"}</td>
                        <td>{fmt(r.complete_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="excel-category-reports">
                  {filteredByTab.map((r, idx) => {
                    const rows = reportRows(r, questionIndex);
                    return (
                      <section key={r.id} className="report-block">
                        <h3>
                          Table {idx + 1} {categoryTitle(r.structure_category)} at Chainage Km {r.chainage || "—"}
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
                  {!filteredByTab.length && <div className="empty">No structures in this category yet.</div>}
                </div>
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
            <p className="muted">
              Project report preview — one table per structure (in chainage order) with its observations and recommendations, then its photos, two per page. The downloaded PDF also includes the cover page, contents, introduction and summary of structures. Download as
              ready-to-share PDF or editable .docx — photos are pulled from cloud storage.
            </p>
            {photosLoading && <p className="muted">Loading photos…</p>}
            <div className="report-scroll">
              {records.map((r, idx) => {
                const structureNo = idx + 1;
                const rows = reportRows(r, questionIndex);
                const photos = photoUrls[r.id] || [];
                const pages = chunk(photos, 2);
                return (
                  <div key={r.id} className="work-structure">
                    <section className="work-page">
                      <h3 className="work-header">{projectName}</h3>
                      <p className="work-title">
                        Table {structureNo} {categoryTitle(r.structure_category)} at Chainage Km {r.chainage || "—"}
                      </p>
                      <table className="work-table">
                        <thead>
                          <tr>
                            <th style={{ width: "12%" }}>Sr. No</th>
                            <th style={{ width: "44%" }}>Description</th>
                            <th style={{ width: "44%" }}>Data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(([desc, data], i) => (
                            <tr key={`${r.id}-qa-${i}`}>
                              <td>{i + 1}</td>
                              <td>{desc}</td>
                              <td>{data}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(["observations", "recommendations"] as const).map((key) => {
                        const items = bulletItems(r, key);
                        return items.length ? (
                          <div key={key}>
                            <p className="work-title" style={{ marginTop: 12 }}>
                              {key === "observations" ? "Observations:" : "Recommendations:"}
                            </p>
                            <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                              {items.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null;
                      })}
                    </section>

                    {pages.map((pagePhotos, pageIdx) => (
                      <section key={`${r.id}-photos-${pageIdx}`} className="work-page">
                        <p className="work-title" style={{ textAlign: "center", textDecoration: "underline" }}>
                          Chainage:- {r.chainage || "—"} {categoryTitle(r.structure_category).toUpperCase()}
                        </p>
                        <div className="work-photo-grid" style={{ gridTemplateColumns: "1fr" }}>
                          {pagePhotos.map((src, i) => (
                            <div key={`${r.id}-p${pageIdx}-${i}`} className="work-photo-cell">
                              <img src={src} alt={`Photo-${pageIdx * 2 + i + 1}`} style={{ maxHeight: 260 }} />
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                    {!photos.length && <p className="work-empty">No photographs available for this structure.</p>}
                  </div>
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
