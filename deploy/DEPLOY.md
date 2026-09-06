# Deploy groundtruth

## Placeholders

This runbook uses placeholders so it works on any host. Concrete values for a given deployment belong in
`deploy/HOSTEXEC.local.md` (gitignored) — copy `deploy/HOSTEXEC.example.md` to create it.

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `<DOMAIN>` | Public hostname | `gt.example.com` |
| `<DOCKER_HOST_IP>` | LAN IP of the box running compose | `10.0.0.50` |
| `<PROJECT_DIR>` | Path of the clone on that box | `/srv/groundtruth` |
| `<SSH_USER>` | Login on the Docker host | `deploy` |

## Architecture

The reference deployment puts Cloudflare in front of a plain-HTTP origin:

```
Browser → Cloudflare (HTTPS) → cloudflared
       → http://<DOCKER_HOST_IP>:8080 (gt-frontend nginx)
       → /api/ proxied to gt-backend (internal)
       → gt-postgres (internal)
```

TLS terminates at Cloudflare; the origin is plain HTTP on the LAN. Do **not** use the compose
`production` profile in this setup — that profile is for direct TLS with certbot, when there is no
tunnel in front. A plain VPS works too: point DNS at the box and either use the `production` profile or
put your own reverse proxy on `:8080`.

## Prerequisites

- Docker + compose on the host, reachable at `<DOCKER_HOST_IP>`
- The repo cloned to `<PROJECT_DIR>`
- A `.env` with a strong `SECRET_KEY` (≥32 chars) and `POSTGRES_PASSWORD` — see "Environment" below
- A public route to `<DOCKER_HOST_IP>:8080` (Cloudflare Tunnel, reverse proxy, or port-forward)

## First deploy

### 1. Configure

```bash
cd <PROJECT_DIR>
cp .env.example .env
# generate the two secrets — see README "Configuration"
```

Set `BASE_URL=https://<DOMAIN>` and `COOKIE_SECURE=1` for any HTTPS deployment.

### 2. Build and start

```bash
docker compose up -d --build
```

### 3. Verify the origin (before putting it behind HTTPS)

```bash
curl -I http://<DOCKER_HOST_IP>:8080/
curl http://<DOCKER_HOST_IP>:8080/api/v1/health
```

### 4. Publish it

For Cloudflare Tunnel — Zero Trust → Tunnels → your tunnel → Public Hostname:

| Field | Value |
|-------|-------|
| Subdomain | host part of `<DOMAIN>` |
| Domain | your zone |
| Service type | HTTP |
| URL | `<DOCKER_HOST_IP>:8080` |

Use `http://` — there is no TLS on the origin. DNS is created automatically.

Step-by-step host commands for an Incus/TrueNAS setup: `deploy/HOSTEXEC.example.md`.

### 5. Smoke test

1. Load `https://<DOMAIN>` — only `index.json` is fetched until a topic is picked
2. `docker stop gt-backend`, finish a quiz — no visible errors (offline mode)
3. `docker start gt-backend`, finish another quiz — one `POST /api/v1/sync` in the network tab
4. Log in on a second device (requires OAuth configured) — progress appears after sync

## Environment (.env)

```bash
cp .env.example .env   # then set secrets
# Required: POSTGRES_PASSWORD, SECRET_KEY (≥32 chars, not "change-me")
BASE_URL=https://<DOMAIN>
QUIZ_HTTP_PORT=8080
COOKIE_SECURE=1
DEV_AUTH=0
```

OAuth callbacks (when enabled): `https://<DOMAIN>/api/v1/auth/{provider}/callback`

## Common commands

```bash
ssh <SSH_USER>@<DOCKER_HOST_IP>
cd <PROJECT_DIR>

docker compose ps
docker compose logs gt-frontend
docker compose logs gt-backend
docker compose down && docker compose up -d
docker compose build && docker compose up -d   # after code changes

curl http://localhost:8080/api/v1/health
```

## Backup

Nightly cron on the Docker host (optional):

```bash
<PROJECT_DIR>/deploy/backup.sh
```

Dumps Postgres to `deploy/backups/`, keeps 30 days. User deck uploads live in `./raw-uploads/`
(bind-mounted to `/data/raw`); include both in your snapshot or off-box backup.

## Containers

| Name | Role | Exposed |
|------|------|---------|
| `gt-postgres` | PostgreSQL 17 | internal |
| `gt-backend` | FastAPI | internal |
| `gt-frontend` | nginx + SPA | `0.0.0.0:8080` |
