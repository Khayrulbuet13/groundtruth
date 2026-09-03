#!/bin/bash
set -euo pipefail
echo "Starting quiz platform..."
docker compose up -d --build
echo "Frontend: http://localhost:${QUIZ_HTTP_PORT:-8080}"
