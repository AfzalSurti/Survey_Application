# GDRPL Survey mobile

Offline-first Expo dev-client application for field surveys. It stores project details, survey records, photos, cached schemas, and a sync queue in SQLite; credentials and the API base URL are in SecureStore.

## Run

```bash
cd mobile
npm install
npx expo prebuild
npx expo run:android
```

For subsequent development runs, use `npm start` and open the installed development client. Expo Go cannot load all native modules used by this app.

## API

Android emulator defaults to `http://10.0.2.2:8000`; iOS/web defaults to `http://localhost:8000`. Change it in Settings when testing on a physical device. Login uses `/api/auth/login`; schemas use `/api/schemas/{module}/active`; synchronization posts records to `/api/sync/survey-records` and photos as multipart to `/api/sync/survey-records/{id}/photos`.

Camera and location permissions are configured in `app.json`. The logo is copied to `assets/gdrpl-logo.png`.
