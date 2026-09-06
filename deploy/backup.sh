#!/bin/bash
# Nightly Postgres backup — add to TrueNAS cron. Keeps 30 days.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
OUT="deploy/backups/quiz-$(date +%F).sql.gz"
mkdir -p deploy/backups
docker exec gt-postgres pg_dump -U "${POSTGRES_USER:-quiz}" "${POSTGRES_DB:-quiz}" | gzip > "$OUT"
find deploy/backups -name 'quiz-*.sql.gz' -mtime +30 -delete
