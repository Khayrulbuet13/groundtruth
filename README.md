# groundtruth — CV interview quiz

LeetCode-style practice quiz for computer vision and ML interview questions. Runs at `gt.khayrul.me`.

- Works offline; progress is stored in the browser (IndexedDB).
- Optional Google/GitHub login syncs progress across devices.
- Anyone can import their own question deck (JSON, see `frontend/public/example-deck.json`).

## Run with Docker

```bash
cp .env.example .env   # then fill in the secrets, see Configuration below
./start_docker.sh      # or: docker compose up -d --build
```

App: `http://localhost:8080` · API: `/api/v1/*`. Production TLS and backups: `deploy/DEPLOY.md`.

## Configuration

All settings live in `.env`, which is gitignored — `.env.example` is the committed template listing
every variable. Nothing else needs editing to run the app.

```bash
cp .env.example .env
openssl rand -base64 36   # use for POSTGRES_PASSWORD
openssl rand -base64 36   # use for SECRET_KEY (must be >= 32 chars)
```

| Variable | Required | Notes |
|----------|----------|-------|
| `POSTGRES_PASSWORD` | yes | Compose refuses to start if unset |
| `SECRET_KEY` | yes | Signs session cookies; >= 32 chars, never `change-me` |
| `BASE_URL` | yes | Public origin the browser visits; OAuth callbacks are built from it |
| `QUIZ_HTTP_PORT` | no | Host port for the SPA, default `8080` |
| `COOKIE_SECURE` | no | `0` for local http, `1` behind https |
| `DEV_AUTH` | no | `1` enables the localhost-only "Dev login" button |
| `GITHUB_*` / `GOOGLE_*` | no | OAuth; omit them and login is simply hidden |

Remaining knobs (session TTL, upload limits) are commented at the bottom of `.env.example` with their
defaults from `backend/api/settings.py`.

### OAuth (optional)

The app is fully usable without it — progress is stored in the browser (IndexedDB) and just won't
follow you to another device. To enable cross-device sync, register either provider and set the
matching pair in `.env`:

- **GitHub** — Settings → Developer settings → OAuth Apps → New OAuth App.
  Authorization callback URL: `<BASE_URL>/api/v1/auth/github/callback`
- **Google** — Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application).
  Authorized redirect URI: `<BASE_URL>/api/v1/auth/google/callback`

The callback must match `BASE_URL` exactly, scheme and port included.

## Local dev

```bash
git config core.hooksPath .githooks       # once per clone: blocks committing secrets

# Question data (YAML -> frontend/public/data, also runs the linter)
cd scripts && npm ci && cd ../schema && npm ci && cd ..
node scripts/build-data.mjs

# Frontend (http://localhost:5173, proxies /api to :8000)
cd frontend && npm ci && npm run dev
npm test                                 # vitest

# Backend (needs Postgres from docker compose, or set DATABASE_URL)
cd backend && uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python ".[dev]"
.venv/bin/pytest tests -v
.venv/bin/python main.py                 # http://localhost:8000
```

Set `DEV_AUTH=1` and `COOKIE_SECURE=0` in `.env` to use the "Dev login" button on localhost.

## Layout

- `frontend/` — Vite + React SPA (Tailwind, IndexedDB, PWA)
- `backend/` — FastAPI: auth, run sync, deck archive
- `content/questions/*.yaml` — the question bank (edit here)
- `schema/` — deck JSON schema (zod), shared by frontend and build
- `scripts/` — `build-data.mjs` (YAML -> JSON chunks), `lint-questions.mjs`, `curate.mjs`
- `deploy/` — deploy runbook, host command templates, backup script

## Question linter

```bash
node scripts/lint-questions.mjs          # distribution + duplicates
node scripts/lint-questions.mjs --strict # also word-count and keyword gates
```
