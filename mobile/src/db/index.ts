import * as SQLite from "expo-sqlite";
import { newId } from "@/lib/id";
import { SurveyRecord } from "@/types";

let db: SQLite.SQLiteDatabase;
export async function initDb() {
  db ??= await SQLite.openDatabaseAsync("gdrpl-survey.db");
  await db.execAsync(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS pre_survey (
      id TEXT PRIMARY KEY,
      head_surveyor TEXT,
      organization TEXT,
      project_id TEXT,
      project_name TEXT,
      project_number TEXT,
      highway_number TEXT,
      synced INTEGER DEFAULT 0,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS survey_records (
      id TEXT PRIMARY KEY,
      module TEXT,
      category TEXT,
      chainage TEXT,
      responses_json TEXT,
      latitude REAL,
      longitude REAL,
      captured_at TEXT,
      status TEXT,
      sync_status TEXT,
      schema_version INTEGER,
      project_id TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS survey_photos (
      id TEXT PRIMARY KEY,
      survey_record_id TEXT,
      file_name TEXT,
      local_path TEXT,
      sync_status TEXT,
      taken_at TEXT
    );
    CREATE TABLE IF NOT EXISTS schema_cache (
      module TEXT PRIMARY KEY,
      version INTEGER,
      schema_json TEXT,
      cached_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT,
      entity_id TEXT,
      created_at TEXT
    );`);
  // best-effort migrations for older installs
  try {
    await db.execAsync("ALTER TABLE pre_survey ADD COLUMN project_id TEXT");
  } catch {
    /* exists */
  }
  try {
    await db.execAsync("ALTER TABLE survey_records ADD COLUMN project_id TEXT");
  } catch {
    /* exists */
  }
  return db;
}
const database = async () => db ?? initDb();

export async function savePreSurvey(values: Record<string, string>) {
  const d = await database();
  const id = newId();
  await d.runAsync(
    "INSERT OR REPLACE INTO pre_survey (id, head_surveyor, organization, project_id, project_name, project_number, highway_number, synced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
    id,
    values.headSurveyor,
    values.organization,
    values.projectId,
    values.projectName,
    values.projectNumber,
    values.highwayNumber,
    new Date().toISOString(),
  );
}

export async function getPreSurvey() {
  return (await database()).getFirstAsync<Record<string, string>>(
    "SELECT * FROM pre_survey ORDER BY created_at DESC LIMIT 1",
  );
}

export async function saveRecord(record: SurveyRecord & { projectId?: string }) {
  const d = await database();
  const pre = await getPreSurvey();
  await d.runAsync(
    "INSERT OR REPLACE INTO survey_records (id, module, category, chainage, responses_json, latitude, longitude, captured_at, status, sync_status, schema_version, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    record.id,
    record.module,
    record.category,
    record.chainage,
    JSON.stringify(record.responses),
    record.latitude ?? null,
    record.longitude ?? null,
    record.capturedAt,
    record.status,
    record.syncStatus,
    record.schemaVersion,
    record.projectId ?? pre?.project_id ?? null,
    new Date().toISOString(),
  );
  await d.runAsync(
    "INSERT INTO sync_queue VALUES (?, 'survey_record', ?, ?)",
    newId(),
    record.id,
    new Date().toISOString(),
  );
}

export async function addPhoto(recordId: string, uri: string) {
  const d = await database();
  await d.runAsync(
    "INSERT INTO survey_photos VALUES (?, ?, ?, ?, 'pending', ?)",
    newId(),
    recordId,
    uri.split("/").pop() ?? "photo.jpg",
    uri,
    new Date().toISOString(),
  );
}

export async function records() {
  return (await database()).getAllAsync<SurveyRecord & { responses_json: string }>(
    "SELECT * FROM survey_records ORDER BY created_at DESC",
  );
}

export async function dashboardCounts() {
  const d = await database();
  return d.getFirstAsync<{ total: number; pending: number; completed: number; photos: number }>(
    `SELECT (SELECT count(*) FROM survey_records) total,
            (SELECT count(*) FROM survey_records WHERE sync_status='pending') pending,
            (SELECT count(*) FROM survey_records WHERE status='submitted') completed,
            (SELECT count(*) FROM survey_photos) photos`,
  );
}

export async function pendingSync() {
  return (await database()).getAllAsync<{
    id: string;
    module: string;
    category: string;
    chainage: string;
    responses_json: string;
    latitude?: number;
    longitude?: number;
    captured_at?: string;
    status: string;
    sync_status: string;
    schema_version?: number;
    project_id?: string;
  }>("SELECT * FROM survey_records WHERE sync_status != 'synced' AND status = 'submitted'");
}

export async function pendingPhotos(id: string) {
  return (await database()).getAllAsync<{ id: string; local_path: string; file_name: string }>(
    "SELECT * FROM survey_photos WHERE survey_record_id=? AND sync_status!='synced'",
    id,
  );
}

export async function markSynced(id: string) {
  await (await database()).runAsync("UPDATE survey_records SET sync_status='synced' WHERE id=?", id);
}

export async function markPhotosSynced(id: string) {
  await (await database()).runAsync(
    "UPDATE survey_photos SET sync_status='synced' WHERE survey_record_id=?",
    id,
  );
}

export async function cachedSchema(module: string) {
  return (await database()).getFirstAsync<{ version: number; schema_json: string }>(
    "SELECT * FROM schema_cache WHERE module=?",
    module,
  );
}

export async function cacheSchema(module: string, version: number, schema: unknown) {
  await (await database()).runAsync(
    "INSERT OR REPLACE INTO schema_cache VALUES (?, ?, ?, ?)",
    module,
    version,
    JSON.stringify(schema),
    new Date().toISOString(),
  );
}
