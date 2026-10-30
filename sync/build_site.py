#!/usr/bin/env python3
"""Mirror the Supabase archive into the public static site.

The submission app (docs/submit.html) writes to Supabase, which only
members with a korea.ac.kr login can reach. The public site is plain
files on GitHub Pages, so that reading needs no account and the archive
stays up even when the free Supabase project is paused.

This script is the bridge: it reads the published records through the
same anonymous API a visitor's browser would use, downloads their
images, and writes docs/data/. Running it is also what keeps the free
project from idling into a pause.

Only the anonymous key is used, so this can read nothing that a public
visitor could not already read. Contact addresses live in a separate
table the anonymous role has no grant on, so they cannot leak here even
by mistake.

Usage:
    python3 sync/build_site.py [--site docs] [--dry-run]

Environment overrides: NDA_SUPABASE_URL, NDA_SUPABASE_KEY.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SUPABASE_URL = os.environ.get(
    "NDA_SUPABASE_URL", "https://tbgsphpxayapylmatfvw.supabase.co"
).rstrip("/")

# Publishable key: identifies the project, grants nothing on its own.
SUPABASE_KEY = os.environ.get(
    "NDA_SUPABASE_KEY", "sb_publishable_Kc-susxUYoZRmNRv15Ru9A_2TtDit-9"
)

BUCKET = "record-images"
PAGE = 500                      # rows per request; the archive is far smaller
TIMEOUT = 30

REQUIRED_FIELDS = ("type", "outcome", "title", "summary")
VALID_TYPES = {"antibody", "mouse", "protocol", "null_result"}
VALID_OUTCOMES = {"dead", "cond", "repro", "nodiff"}

# Columns that exist for bookkeeping and say nothing to a reader.
DROP_FIELDS = {"submitter_id", "published"}


def warn(message):
    print(f"  경고: {message}", file=sys.stderr)


def api(path, params):
    """One PostgREST GET, returned as parsed JSON."""
    url = f"{SUPABASE_URL}/rest/v1/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return json.loads(res.read().decode("utf-8"))


def fetch_all(path, params):
    """Page through a table with Range headers kept simple: offset/limit."""
    out = []
    offset = 0
    while True:
        page = dict(params)
        page["limit"] = PAGE
        page["offset"] = offset
        rows = api(path, page)
        out.extend(rows)
        if len(rows) < PAGE:
            return out
        offset += PAGE


def local_name(storage_path):
    """Flatten "<uid>/<uuid>.jpg" into one filename, keeping it traceable."""
    return storage_path.replace("/", "_")


def download_image(storage_path, dest, dry_run):
    url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{urllib.parse.quote(storage_path)}"
    if dry_run:
        return True
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as res:
            data = res.read()
    except urllib.error.URLError as exc:
        warn(f"이미지를 받지 못했습니다 ({storage_path}): {exc}")
        return False
    dest.write_bytes(data)
    return True


def build_record(row, confirms_by_record, img_out, written, dry_run):
    """Validate one row and resolve its images; None if unusable."""
    record_id = row.get("id")
    missing = [f for f in REQUIRED_FIELDS if not row.get(f)]
    if missing:
        warn(f"{record_id}: 필수 항목 누락({', '.join(missing)}) — 제외합니다")
        return None
    if row.get("type") not in VALID_TYPES:
        warn(f"{record_id}: 알 수 없는 유형 '{row.get('type')}' — 제외합니다")
        return None
    if row.get("outcome") not in VALID_OUTCOMES:
        warn(f"{record_id}: 알 수 없는 결과 '{row.get('outcome')}' — 제외합니다")
        return None

    record = {k: v for k, v in row.items() if k not in DROP_FIELDS and v not in (None, [], "")}
    record["id"] = record_id

    published_images = []
    for image in row.get("images") or []:
        path = (image or {}).get("path")
        if not path:
            continue
        name = local_name(path)
        if download_image(path, img_out / name, dry_run):
            written.add(name)
            published_images.append({"file": f"img/{name}", "caption": image.get("caption", "")})
        else:
            warn(f"{record_id}: 이미지 하나를 제외합니다 ({path})")
    record["images"] = published_images

    confirms = confirms_by_record.get(record_id, [])
    record["confirms"] = confirms
    # The view's counter and the rows themselves can disagree if a
    # confirmation was removed; the rows are the truth.
    record["confirm_count"] = len(confirms)
    return record


def main():
    parser = argparse.ArgumentParser(description="Supabase 아카이브를 공개 정적 사이트로 내보냅니다.")
    parser.add_argument("--site", type=Path, default=Path("docs"), help="사이트 디렉터리 (기본: docs)")
    parser.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 출력")
    args = parser.parse_args()

    data_out = args.site / "data"
    img_out = data_out / "img"
    if not args.site.is_dir():
        sys.exit(f"오류: {args.site} 가 없습니다. 저장소 루트에서 실행하세요.")
    if not args.dry_run:
        img_out.mkdir(parents=True, exist_ok=True)

    print(f"읽는 중: {SUPABASE_URL}")
    try:
        rows = fetch_all("records_public", {
            "select": "*",
            "published": "eq.true",
            "order": "created_at.desc",
        })
        confirm_rows = fetch_all("confirms", {
            "select": "record_id,name,lab,note,created_at",
            "order": "created_at.asc",
        })
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        sys.exit(
            f"오류: Supabase 응답 {exc.code}.\n{detail}\n"
            "supabase/schema.sql 이 실행되었는지, 키가 맞는지 확인하세요."
        )
    except urllib.error.URLError as exc:
        sys.exit(f"오류: Supabase 에 연결하지 못했습니다: {exc}")

    confirms_by_record = {}
    for c in confirm_rows:
        confirms_by_record.setdefault(c["record_id"], []).append({
            "name": c.get("name", ""),
            "lab": c.get("lab", ""),
            "note": c.get("note") or "",
            "at": c.get("created_at", ""),
        })

    print(f"  공개 기록 {len(rows)}건, 재현 확인 {len(confirm_rows)}건")

    written = set()
    records = []
    for row in rows:
        record = build_record(row, confirms_by_record, img_out, written, args.dry_run)
        if record:
            records.append(record)

    records.sort(key=lambda r: r.get("created_at") or "", reverse=True)

    by_type = {}
    for record in records:
        by_type[record["type"]] = by_type.get(record["type"], 0) + 1
    print("  내보낼 기록 " + str(len(records)) + "건 "
          + (", ".join(f"{k} {v}" for k, v in sorted(by_type.items())) or "(없음)"))

    if args.dry_run:
        print("  --dry-run: 파일을 쓰지 않았습니다.")
        return

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(records),
        "records": records,
    }
    out_file = data_out / "records.json"
    out_file.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  작성: {out_file}")

    # Drop images no record points at, so a deletion in the submission app
    # also disappears from the public mirror.
    removed = 0
    for existing in img_out.iterdir():
        if existing.is_file() and existing.name not in written:
            existing.unlink()
            removed += 1
    print(f"  이미지 {len(written)}개 유지, {removed}개 삭제")


if __name__ == "__main__":
    main()
