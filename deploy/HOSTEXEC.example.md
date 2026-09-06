# Host execution — copy/paste block

Template. Copy to `deploy/HOSTEXEC.local.md` (gitignored) and replace every `<PLACEHOLDER>` with your
real values, so the filled-in copy never reaches git:

```bash
cp deploy/HOSTEXEC.example.md deploy/HOSTEXEC.local.md
```

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `<DOMAIN>` | Public hostname for the app | `gt.example.com` |
| `<SUBDOMAIN>` | Host part of `<DOMAIN>` | `gt` |
| `<ZONE>` | Cloudflare zone (root domain) | `example.com` |
| `<DOCKER_HOST_IP>` | LAN IP of the box running compose | `10.0.0.50` |
| `<PROJECT_DIR>` | Path of the clone on that box | `/srv/groundtruth` |
| `<HOST_PROJECT_DIR>` | Path on the outer host, if bind-mounting | `/mnt/tank/projects/groundtruth` |
| `<CONTAINER>` | Name of the container/VM running Docker | `devbox` |

This example assumes an Incus container on a TrueNAS host with a Cloudflare Tunnel in front. On a plain
VPS, skip steps 1 and 6 and run the compose command directly.

## 1. Add bind-mount (once)

```bash
sudo incus config device show <CONTAINER> | grep -A3 groundtruth || true

sudo incus config device add <CONTAINER> projects-groundtruth disk \
  source=<HOST_PROJECT_DIR> path=<PROJECT_DIR>
```

If the device already exists, skip the `config device add` line.

## 2. Build and start

```bash
sudo incus exec <CONTAINER> -- bash -c 'cd <PROJECT_DIR> && docker compose up -d --build'
```

## 3. Verify origin (before Cloudflare)

```bash
curl -I http://<DOCKER_HOST_IP>:8080/
curl http://<DOCKER_HOST_IP>:8080/api/v1/health
```

Expected: HTTP 200 on `/`, JSON health on `/api/v1/health`.

## 4. Cloudflare Tunnel (dashboard)

Cloudflare Zero Trust → Tunnels → your tunnel → **Public Hostname**:

- **Subdomain:** `<SUBDOMAIN>`
- **Domain:** `<ZONE>`
- **Type:** HTTP
- **URL:** `<DOCKER_HOST_IP>:8080`

Must be plain HTTP (not HTTPS) — TLS terminates at Cloudflare, the origin is unencrypted on the LAN.
The DNS record is created automatically.

## 5. Public smoke test

```bash
curl -I https://<DOMAIN>/
curl https://<DOMAIN>/api/v1/health
```

Then open `https://<DOMAIN>` in a browser and run a quiz.

## 6. Optional: offline/sync check

```bash
sudo incus exec <CONTAINER> -- bash -c 'docker stop gt-backend'
# finish a quiz in the browser — should still work offline
sudo incus exec <CONTAINER> -- bash -c 'docker start gt-backend'
# finish another quiz — check DevTools for POST /api/v1/sync
```
