import NetInfo from "@react-native-community/netinfo";
import { api, ensureAuth, isAuthErrorMessage } from "@/api/client";
import { markPhotoSynced, markSynced, pendingPhotos, pendingSync, setServerId } from "@/db";

type SyncRecordResponse = { id: string; sheets_row_id?: string | null; created?: boolean };
type SyncResult = { synced: number; error?: string; authFailed?: boolean };

export type SyncItemStatus = "queued" | "uploading" | "synced" | "error";
export type SyncItem = { id: string; label: string; status: SyncItemStatus; detail?: string };
/** Full live snapshot — every record's current state, not just one line of text. */
export type SyncSnapshot = { items: SyncItem[]; synced: number; total: number };

let syncInFlight: Promise<SyncResult> | null = null;

export async function syncPending(onProgress?: (s: SyncSnapshot) => void): Promise<SyncResult> {
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

    const pending = await pendingSync();
    let synced = 0;
    const errors: string[] = [];
    let authFailed = false;

    const items: SyncItem[] = pending.map((r) => ({
      id: r.id,
      label: r.chainage || r.category || r.id,
      status: "queued",
    }));
    const emit = () => onProgress?.({ items: items.map((it) => ({ ...it })), synced, total: items.length });
    emit();

    for (let i = 0; i < pending.length; i++) {
      const record = pending[i];
      const baseLabel = record.chainage || record.category || record.id;
      items[i].status = "uploading";
      emit();
      try {
        if (!record.project_id) {
          throw new Error("missing project — complete Structure Brief first.");
        }
        if (!record.chainage?.trim()) {
          throw new Error("chainage is required before sync.");
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
          items[i].label = `${baseLabel} — photo ${p + 1}/${photos.length}`;
          emit();
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
            errors.push(`${baseLabel} photo ${p + 1}/${photos.length}: ${msg}`);
          }
        }
        items[i].label = baseLabel;

        if (photoFailures === 0) {
          await markSynced(record.id);
          synced += 1;
          items[i].status = "synced";
        } else {
          // Record is safely on the server; leave it "pending" so only the
          // failed photo(s) are retried on the next sync.
          items[i].status = "error";
          items[i].detail = `saved, but ${photoFailures} photo(s) still pending — will retry`;
          errors.push(`${baseLabel}: saved, but ${photoFailures} photo(s) still pending upload — will retry automatically.`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sync failed";
        if (isAuthErrorMessage(msg)) authFailed = true;
        items[i].status = "error";
        items[i].detail = msg;
        errors.push(`${baseLabel}: ${msg}`);
      }
      emit();
    }

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
