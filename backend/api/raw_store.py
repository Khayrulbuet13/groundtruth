"""Write-only raw upload archive for manual curation."""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from api.settings import settings


def _manifest_path() -> Path:
    return Path(settings.raw_upload_dir) / "manifest.jsonl"


def _count_user_uploads_today(user_id: str) -> int:
    manifest = _manifest_path()
    if not manifest.exists():
        return 0
    today = datetime.now(timezone.utc).date().isoformat()
    count = 0
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("user_id") == user_id and row.get("received_at", "").startswith(today):
            count += 1
    return count


def store_raw_upload(*, user_id: str, body: bytes, deck_name: str, question_count: int) -> str:
    if len(body) > settings.max_raw_bytes:
        raise ValueError("Upload exceeds size limit")
    if _count_user_uploads_today(user_id) >= settings.max_raw_per_user_per_day:
        raise ValueError("Daily upload limit reached")

    sha256 = hashlib.sha256(body).hexdigest()
    digest = sha256[:16]
    day = datetime.now(timezone.utc).date().isoformat()
    base = Path(settings.raw_upload_dir) / day
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{digest}.json"
    if path.exists():
        return str(path)

    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(body)
    os.replace(tmp, path)

    manifest = _manifest_path()
    manifest.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id,
        "deck_name": deck_name,
        "question_count": question_count,
        "bytes": len(body),
        "path": str(path.relative_to(settings.raw_upload_dir)),
        "sha256": sha256,
    }
    with manifest.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")
    return str(path)


def unlink_user_from_manifest(user_id: str) -> None:
    manifest = _manifest_path()
    if not manifest.exists():
        return
    lines = manifest.read_text(encoding="utf-8").splitlines()
    updated = []
    for line in lines:
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            updated.append(line)
            continue
        if row.get("user_id") == user_id:
            row["user_id"] = None
        updated.append(json.dumps(row))
    manifest.write_text("\n".join(updated) + ("\n" if updated else ""), encoding="utf-8")
