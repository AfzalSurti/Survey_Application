import NetInfo from "@react-native-community/netinfo";
import { api } from "@/api/client";
import { markPhotosSynced, markSynced, pendingPhotos, pendingSync } from "@/db";

export async function syncPending(): Promise<{ synced: number; error?: string }> {
  if (!(await NetInfo.fetch()).isConnected) return { synced: 0, error: "No network connection" };
  let synced = 0;
  try {
    for (const record of await pendingSync()) {
      const responses = JSON.parse(record.responses_json);
      await api.post("/api/sync/survey-records", {
        project_id: record.project_id,
        chainage: record.chainage,
        responses_json: responses,
        latitude: record.latitude,
        longitude: record.longitude,
        captured_at: record.capturedAt || record.captured_at,
        structure_category: record.category,
        schema_version: record.schemaVersion || record.schema_version || 1,
      });
      for (const photo of await pendingPhotos(record.id)) {
        const form = new FormData();
        form.append("survey_record_id", record.id);
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
      synced++;
    }
    return { synced };
  } catch (e) {
    return { synced, error: e instanceof Error ? e.message : "Sync failed" };
  }
}

export function registerSyncListener() {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) void syncPending();
  });
}
