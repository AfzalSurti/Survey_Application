import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { apiBaseUrl } from "../lib/wakeServer";
import { client, type RecordItem } from "../api/client";
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

const SKIP_KEYS = new Set(["gps", "capturedAt", "structure_category", "photos"]);

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
  onDownloadExcel: () => void;
  busy?: boolean;
};

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

/** Same Q&A layout as Word report preview (Sr. No / Description / Data). */
function buildReportRows(r: RecordItem): [string, string][] {
  const responses = (r.responses_json || {}) as Record<string, unknown>;
  const gps = responses.gps as { latitude?: number; longitude?: number } | undefined;
  const lat = gps?.latitude ?? r.latitude;
  const lon = gps?.longitude ?? r.longitude;
  const coords = lat != null && lon != null ? `${lat}, ${lon}` : "—";

  const rows: [string, string][] = [
    ["Name of Road", String(responses.name_of_road ?? r.project_name ?? "—")],
    [
      "Location of bridge / structure in Km.",
      `${r.chainage || "—"} — ${categoryLabel(r.structure_category).toUpperCase()}`,
    ],
    ["Coordinates", coords],
  ];

  for (const [key, value] of Object.entries(responses)) {
    if (SKIP_KEYS.has(key) || key === "name_of_road") continue;
    const label = key.replace(/_/g, " ");
    const data = value == null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
    rows.push([label, data]);
  }
  return rows;
}

/** Excel preview (tabbed) + Work Report preview (Page-1 Q&A + Page-2+ photo grids). */
export function PreviewModal({ open, mode, records, onClose, onDownloadWord, onDownloadExcel, busy }: Props) {
  const [tab, setTab] = useState("pre_survey");
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({});
  const [photosLoading, setPhotosLoading] = useState(false);

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
            const blobUrl = await fetchPhotoObjectUrl(meta.id);
            if (blobUrl) {
              created.push(blobUrl);
              urls.push(blobUrl);
            } else if (meta.drive_url) {
              urls.push(meta.drive_url);
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
              <ActionButton
                className="button"
                disabled={!records.length || busy}
                disabledReason={!records.length ? "No project records to download." : "Download already in progress."}
                onClick={onDownloadWord}
              >
                Download Editable DOCX
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
                <div className="excel-category-reports">
                  {filteredByTab.map((r, idx) => {
                    const rows = buildReportRows(r);
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
              Work report preview — Page-1 Q&amp;A table grows with answers; Page-2+ photo grids expand automatically (4 per
              page). Download is an editable .docx.
            </p>
            {photosLoading && <p className="muted">Loading photos…</p>}
            <div className="report-scroll">
              {records.map((r, idx) => {
                const structureNo = idx + 1;
                const rows = buildReportRows(r);
                const photos = photoUrls[r.id] || [];
                const pages = chunk(photos, 4);
                return (
                  <div key={r.id} className="work-structure">
                    <section className="work-page">
                      <h3 className="work-header">{projectName}</h3>
                      <p className="work-title">Page-1 (Structure-{structureNo})</p>
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
                    </section>

                    {pages.map((pagePhotos, pageIdx) => {
                      const pageNo = pageIdx + 2;
                      const cells = Array.from({ length: 4 }, (_, i) => pagePhotos[i] ?? null);
                      return (
                        <section key={`${r.id}-photos-${pageIdx}`} className="work-page">
                          <h3 className="work-header">{projectName}</h3>
                          <p className="work-title">
                            Page-{pageNo} (Photos of Structure-{structureNo})
                          </p>
                          <div className="work-photo-grid">
                            {cells.map((src, i) => (
                              <div key={`${r.id}-p${pageIdx}-${i}`} className="work-photo-cell">
                                {src ? (
                                  <img src={src} alt={`Photo-${pageIdx * 4 + i + 1}`} />
                                ) : (
                                  <span className="work-photo-placeholder">Photo-{pageIdx * 4 + i + 1}</span>
                                )}
                              </div>
                            ))}
                          </div>
                          {!photos.length && pageIdx === 0 && (
                            <p className="work-empty">No photos captured for this structure.</p>
                          )}
                        </section>
                      );
                    })}
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
