import NetInfo from "@react-native-community/netinfo";
import { api, ensureAuth, isAuthErrorMessage } from "@/api/client";
import { markPhotosSynced, markSynced, pendingPhotos, pendingSync, setServerId } from "@/db";

type SyncRecordResponse = { id: string; sheets_row_id?: string | null; created?: boolean };

let syncInFlight: Promise<{ synced: number; error?: string; authFailed?: boolean }> | null = null;

export async function syncPending(): Promise<{ synced: number; error?: string; authFailed?: boolean }> {
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
    for (const record of pending) {
      try {
        if (!record.project_id) {
          errors.push(`${record.chainage || record.id}: missing project — complete Structure Brief first.`);
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

        for (const photo of await pendingPhotos(record.id)) {
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
        }
        await markPhotosSynced(record.id);
        await markSynced(record.id);
        synced += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sync failed";
        if (isAuthErrorMessage(msg)) authFailed = true;
        errors.push(`${record.chainage || record.category || record.id}: ${msg}`);
      }
    }
    if (errors.length) {
      return {
        synced,
        authFailed,
        error:
          synced > 0
            ? `Synced ${synced} record(s). Some failed: ${errors.slice(0, 3).join(" | ")}`
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
