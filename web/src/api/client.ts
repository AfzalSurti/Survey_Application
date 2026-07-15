export type Role = "surveyor" | "admin" | "super_admin";
export type User = { id: string; name: string; email: string; role: Role; organization?: string; is_active: boolean; created_at?: string };
export type Project = {
  id: string;
  name: string;
  project_number: string;
  highway_number: string;
  created_by: string;
  created_at: string;
  surveyor_ids: string[];
};
export type RecordItem = {
  id: string;
  project_id: string;
  surveyor_id: string;
  structure_category: string;
  chainage: string;
  schema_version: number;
  responses_json: Record<string, unknown>;
  latitude?: number | null;
  longitude?: number | null;
  captured_at?: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  sync_status: string;
  created_at?: string;
  updated_at?: string;
};

const api = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail || body);
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
};

export const client = {
  get: <T>(path: string) => api<T>(path),
  post: <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => api<T>(path, { method: "DELETE" }),
  download: async (path: string, body?: unknown, method = "GET") => {
    const token = localStorage.getItem("access_token");
    const r = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error("Download could not be generated.");
    const link = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(await r.blob()),
      download: r.headers.get("content-disposition")?.match(/filename="?([^"]+)/)?.[1] || "gdrpl-export",
    });
    link.click();
    URL.revokeObjectURL(link.href);
  },
};

export async function fetchRecords(): Promise<RecordItem[]> {
  const page = await client.get<{ items: RecordItem[] }>("/records?page_size=200");
  return page.items ?? [];
}
