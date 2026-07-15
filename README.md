# GDRPL Survey

**GDRPL Survey** (Geo Design and Research Pvt. Ltd.) — highway structure & utility inventory survey system.

| Layer | Stack |
|---|---|
| Database | Neon Postgres |
| Backend | FastAPI + SQLAlchemy 2.0 async + Alembic |
| Web | React + TypeScript (Vite) — Phase 4 |
| Mobile | React Native (Expo) — Phase 2 |

## Phase 1 — Backend foundation

```bash
cd backend
python -m venv .venv
# Windows
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Ensure repo-root .env has DATABASE_URL (Neon connection string)
cd ..
# then from backend:
cd backend
alembic upgrade head
python -m seeds.seed_data
uvicorn app.main:app --reload --port 8000
```

### Demo accounts (from seed)

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@gdrpl.com` | `ChangeMe123!` |
| Surveyor | `surveyor@gdrpl.com` | `Surveyor123!` |

### Key endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `GET/POST/PATCH /api/users` (super_admin)
- `GET /api/schemas/active`

Logo: `assets/gdrpl-logo.png`
