# GDRPL Survey

**GDRPL Survey** (Geo Design and Research Pvt. Ltd.) — highway structure & utility inventory survey system.

| Layer | Stack | Path |
|---|---|---|
| Database | Neon Postgres | `.env` `DATABASE_URL` |
| Backend | FastAPI + SQLAlchemy 2 async + Alembic | `backend/` |
| Mobile | React Native Expo (dev client) | `mobile/` |
| Web admin | React + TypeScript + Vite | `web/` |

## Quick start

### Backend
```powershell
cd backend
.\.venv\Scripts\Activate.ps1   # or: python -m venv .venv && pip install -r requirements.txt
alembic upgrade head
python -m seeds.seed_data
uvicorn app.main:app --reload --port 8000
```

### Web admin
```powershell
cd web
npm install
npm run dev
```
Open http://localhost:5173

### Mobile
```powershell
cd mobile
npm install
npx expo start --dev-client
```
Set API base URL in Settings (Android emulator: `http://10.0.2.2:8000`, device: your LAN IP).

## Demo accounts
| Role | Email | Password |
|---|---|---|
| Surveyor | `surveyor@gdrpl.com` | `Surveyor123!` |
| Admin | `admin.ops@gdrpl.com` | `Admin123!` |
| Super Admin | `admin@gdrpl.com` | `ChangeMe123!` |

## API surface
- Auth: `/api/auth/login`, `/refresh`, `/me`
- Users: `/api/users` (super_admin)
- Schemas: `/api/schemas`, `/active`
- Projects / pre-survey: `/api/projects`, `/api/pre-survey`
- Records: `/api/records`, status approve/reject
- Sync: `/api/sync/survey-records`, `/api/sync/photos`
- Reports: `/api/reports/generate` (DOCX)
- Export: `/api/exports/excel`
- Settings: `/api/settings`

Logo: `assets/gdrpl-logo.png`

## Questionnaire schema
Forms are data: each survey module stores versioned JSON (`questionnaire_schemas`), served by `/api/schemas`.
The seed (`backend/seeds/`) creates v1, then v2 once (never overriding a version a super admin published).
Edit forms in the web admin → *Questionnaire schema* → **Publish new version**.

Optional keys on a question (older apps ignore them and simply show everything, optional):

| Key | Meaning |
|---|---|
| `show_if` | only shown while the condition holds |
| `required_if` | compulsory while the condition holds (pair with `"required": false`) |
| `prefill_from` | mirrors another answer until the surveyor edits it ("same as wing wall") |
| `allow_other` | dropdown also accepts a hand-typed value |

Condition: `{"q": "<id>", "in": [..]}` · `{"q": "<id>", "not_in": [..]}` · `{"any": [..]}` · `{"all": [..]}`
(`in` matches a dropdown answer, or any selected item of a multi-select).

