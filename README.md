# groundtruth — CV interview quiz

LeetCode-style practice quiz for computer vision and ML interview questions. Runs at `quiz.khayrul.me`.

- Works offline; progress is stored in the browser (IndexedDB).
- Optional Google/GitHub login syncs progress across devices.
- Anyone can import their own question deck (JSON, see `frontend/public/example-deck.json`).

## Run with Docker

```bash
cp .env.example .env   # set POSTGRES_PASSWORD and SECRET_KEY at minimum
./start_docker.sh      # or: docker compose up -d --build
```

App: `http://localhost:8080` · API: `/api/v1/*`. Production TLS and backups: `deploy/DEPLOY.md`.

## Local dev

```bash
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
- `deploy/` — TrueNAS runbook and backup script

## Question linter

```bash
node scripts/lint-questions.mjs          # distribution + duplicates
node scripts/lint-questions.mjs --strict # also word-count and keyword gates
```
