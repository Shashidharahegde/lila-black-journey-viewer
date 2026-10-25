"""Scan everything that is (or would be) tracked by git for real player IDs and obvious secrets.

    cd pipeline && uv run python tools/check_ids.py        (also: make check-ids)

Real IDs come from the raw files' names (`<user_id>_<match_id>.nakama-0`). A file is flagged if it contains a full user ID,
its first 8 characters as a whole word, or (outside the generated data) a numeric bot ID in file-name form (`1455_3a9f...`). Match IDs are public by design (index.json
carries them), so they are not flagged. Also flagged: key-like secrets (`sk-...`, `AKIA...`, `api_key = "..."`).
Reads git's file lists only (no commit, no staging) and exits with status 1 if anything is found.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

from lila_pipeline.ingest import DEFAULT_DATA_DIR

REPO = Path(__file__).resolve().parents[2]
SKIP_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".parquet", ".lock", ".zip"}
# Already committed before this check existed: the data README's worked example, in LILA's own README and copied into GLOBAL_CONTEXT.md. Reported, not failed.
KNOWN = {"docs/source/DATA_README.md", "docs/archive/GLOBAL_CONTEXT.md"}
SECRET = re.compile(r"(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|(?i:api[_-]?key|secret|passwd|password)\s*[:=]\s*['\"][^'\"\s]{8,}['\"])")


def real_user_ids() -> set[str]:
    ids = set()
    for path in DEFAULT_DATA_DIR.rglob("*.nakama-0"):  # the player files only (not minimaps or icons)
        user = path.name.split("_", 1)[0]
        if re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{3,}", user):
            ids.add(user)
    return ids


def candidate_files() -> list[Path]:
    def git(*args: str) -> list[str]:
        out = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, check=True).stdout
        return [line for line in out.splitlines() if line]

    names = set(git("ls-files")) | set(git("ls-files", "--others", "--exclude-standard"))
    return sorted(REPO / n for n in names if (REPO / n).is_file() and (REPO / n).suffix.lower() not in SKIP_SUFFIXES)


def main() -> int:
    ids = real_user_ids()
    if not ids:
        print(f"no raw files under {DEFAULT_DATA_DIR}: cannot check for real IDs (secrets are still checked)")
    uuids = sorted(i for i in ids if "-" in i)
    full = re.compile("|".join(re.escape(i) for i in uuids)) if uuids else None
    short = re.compile(r"\b(" + "|".join(re.escape(i[:8]) for i in sorted(ids) if "-" in i) + r")\b") if any("-" in i for i in ids) else None
    # a bare 4-digit number is an ordinary value in most text, so numeric IDs are matched in file-name form (id, underscore, match ID)
    numeric = re.compile(r"(" + "|".join(re.escape(i) for i in sorted(ids) if i.isdigit()) + r")_[0-9a-f]{8}") if any(i.isdigit() for i in ids) else None
    files = candidate_files()
    findings = []
    for path in files:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        rel = path.relative_to(REPO)
        # numbers like 1455 are ordinary values inside the generated data, which has its own privacy test, so numeric IDs
        # are only looked for elsewhere
        in_data = rel.parts[:3] == ("web", "public", "data")
        for kind, pattern in (("real user ID", full), ("user ID prefix", short), ("numeric bot ID", None if in_data else numeric), ("secret-like text", SECRET)):
            if pattern and (hit := pattern.search(text)):
                findings.append(f"{rel}: {kind}: {hit.group(0)[:12]}...")
    print(f"checked {len(files)} files against {len(ids)} real user IDs")
    known = [f for f in findings if f.split(":")[0].replace("\\", "/") in KNOWN]
    findings = [f for f in findings if f not in known]
    for line in known:
        print("KNOWN (not failed)", line)
    for line in findings:
        print("FOUND", line)
    print("ok: nothing new found" if not findings else f"{len(findings)} finding(s)")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
