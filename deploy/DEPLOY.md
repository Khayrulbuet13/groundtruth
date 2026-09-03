# TrueNAS deploy runbook

## Prerequisites

- Docker on TrueNAS
- DNS `quiz.khayrul.me` → your box (or Cloudflare Tunnel)
- OAuth apps registered with callback `https://quiz.khayrul.me/api/v1/auth/{provider}/callback`

## First deploy

```bash
git clone <this-repo> && cd cv_quiz
cp .env.example .env   # set secrets; COOKIE_SECURE=1 behind https
docker compose up -d --build
```

Dev access: `http://<host>:8080` (frontend nginx serves the SPA, `/data` and proxies `/api`).

## Production TLS

1. Get certs (certbot) for `quiz.khayrul.me`
2. Mount `/etc/letsencrypt` into the nginx production profile
3. `docker compose --profile production up -d`

## Backup

Nightly cron on TrueNAS:

```bash
/path/to/cv_quiz/deploy/backup.sh
```

Dumps Postgres to `deploy/backups/`, keeps 30 days. Sync that folder to S3 if you want off-box copies.

User deck uploads land in `./raw-uploads/` on the host (bind-mounted to `/data/raw`). Gitignored; include it in TrueNAS snapshots.

## Smoke test

1. Load the site — only `index.json` is fetched until a topic is picked
2. `docker stop quiz-backend`, finish a quiz — no visible errors
3. Restart the backend, finish another quiz — one `POST /api/v1/sync` in the network tab
4. Log in on a second device — progress appears after sync
