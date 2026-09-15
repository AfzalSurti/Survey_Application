import NetInfo from "@react-native-community/netinfo";
import { api, ensureAuth, isAuthErrorMessage } from "@/api/client";
import { markPhotoSynced, markSynced, pendingPhotos, pendingSync, setServerId } from "@/db";

type SyncRecordResponse = { id: string; sheets_row_id?: string | null; created?: boolean };
export type SyncProgress = { total: number; done: number; label: string };
type SyncResult = { synced: number; error?: string; authFailed?: boolean };

let syncInFlight: Promise<SyncResult> | null = null;

export async function syncPending(onProgress?: (p: SyncProgress) => void): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    if (!(await NetInfo.fetch()).isConnected) {
      return { synced: 0, error: "No network connection — will sync automatically when online." };
    }

    const authed = await ensureAuth();
    if (!authed) {
      return {
        synced: 0,
        authFailed: true,
        error: "Session expired — sign in again, then open Sync to upload pending surveys.",
      };
    }

    let synced = 0;
    const errors: string[] = [];
    let authFailed = false;
    const pending = await pendingSync();
    const total = pending.length;

    for (let i = 0; i < pending.length; i++) {
      const record = pending[i];
      const label = record.chainage || record.category || record.id;
      onProgress?.({ total, done: i, label: `Uploading ${label}…` });
      try {
        if (!record.project_id) {
          errors.push(`${label}: missing project — complete Structure Brief first.`);
          continue;
        }
        if (!record.chainage?.trim()) {
          errors.push(`${record.id}: chainage is required before sync.`);
          continue;
        }
        const responses = JSON.parse(record.responses_json);
        const { data: result } = await api.post<SyncRecordResponse>("/api/sync/survey-records", {
          client_id: record.id,
          project_id: record.project_id,
          chainage: record.chainage,
          responses_json: responses,
          latitude: record.latitude,
          longitude: record.longitude,
          captured_at: record.captured_at,
          structure_category: record.category,
          schema_version: record.schema_version || 1,
        });
        const serverId = result.id;
        await setServerId(record.id, serverId);

        // Each photo is uploaded and marked synced independently: one bad/missing
        // file must never block the rest, and a retry only resends what failed.
        const photos = await pendingPhotos(record.id);
        let photoFailures = 0;
        for (let p = 0; p < photos.length; p++) {
          const photo = photos[p];
          onProgress?.({ total, done: i, label: `${label}: photo ${p + 1}/${photos.length}…` });
          try {
            const form = new FormData();
            form.append("survey_record_id", serverId);
            form.append("file", {
              uri: photo.local_path,
              name: photo.file_name,
              type: "image/jpeg",
            } as unknown as Blob);
            await api.post("/api/sync/photos", form, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            await markPhotoSynced(photo.id);
          } catch (photoErr) {
            photoFailures += 1;
            const msg = photoErr instanceof Error ? photoErr.message : "Photo upload failed";
            if (isAuthErrorMessage(msg)) authFailed = true;
            errors.push(`${label} photo ${p + 1}/${photos.length}: ${msg}`);
          }
        }

        if (photoFailures === 0) {
          await markSynced(record.id);
          synced += 1;
        } else {
          // Record is safely on the server; leave it "pending" so only the
          // failed photo(s) are retried on the next sync.
          errors.push(`${label}: saved, but ${photoFailures} photo(s) still pending upload — will retry automatically.`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sync failed";
        if (isAuthErrorMessage(msg)) authFailed = true;
        errors.push(`${label}: ${msg}`);
      }
    }
    onProgress?.({ total, done: total, label: "" });

    if (errors.length) {
      return {
        synced,
        authFailed,
        error:
          synced > 0
            ? `Synced ${synced} record(s). Some issues: ${errors.slice(0, 3).join(" | ")}`
            : errors.slice(0, 3).join(" | "),
      };
    }
    return { synced };
  })().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export function registerSyncListener() {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) void syncPending();
  });
}
