#!/usr/bin/env python3
"""Turn an Artifact database dump into the public site's data files.

The submission app (a Claude Artifact) holds the live records. Claude dumps
its collections to a directory with the ArtifactData tool, and this script
converts that dump into `site/data/records.json` plus the image files the
public page references.

Expected dump layout (as ArtifactData's `out_dir` writes it):

    <dump>/records/<record id>.json
    <dump>/records/<record id>/confirms/<user id>.json   (optional)
    <dump>/images/<image id>.json                        (inline images)
    <dump>/assets/<asset id>.jpg                         (optional, see below)

Images submitted through the app are stored inline in the database as data
URLs, so the `images/` dump carries the bytes. Records created before that
change may instead point at an artifact asset (`kind: "asset"`); those bytes
live outside the database, so Claude has to fetch each one with the Artifact
tool and drop it in `<dump>/assets/<asset id>.<ext>` before running this.

Usage:
    python3 sync/build_site.py <dump dir> [--site site] [--dry-run]

Nothing here contacts the network: it reads the dump and writes the site.
"""

import argparse
import base64
import binascii
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

# Fields that exist in the submission app but must never reach the public
# site. The contact address stays inside the archive so that follow-up
# questions go through the operator rather than into a scraped mailbox.
REDACTED_FIELDS = {"submitterEmail", "submitterId", "_hay"}

# A record is only useful to a reader if it says what it is and what happened.
REQUIRED_FIELDS = ("type", "outcome", "title", "summary")

VALID_TYPES = {"antibody", "mouse", "protocol", "null_result"}
VALID_OUTCOMES = {"dead", "cond", "repro", "nodiff"}

DATA_URL_RE = re.compile(r"^data:image/(?P<fmt>png|jpeg|jpg|webp);base64,(?P<b64>.+)$", re.S)

EXT_BY_FORMAT = {"png": ".png", "jpeg": ".jpg", "jpg": ".jpg", "webp": ".webp"}


def unwrap(doc):
    """Return the document body.

    ArtifactData sometimes writes the bare body and sometimes an envelope
    carrying `id`/`version`/`updatedAt` around a `data` object. Accept both so
    the script does not break when the tool's output shape changes.
    """
    if isinstance(doc, dict) and isinstance(doc.get("data"), dict) and "id" in doc:
        return doc["data"]
    return doc


def read_json(path):
    try:
        with path.open(encoding="utf-8") as fh:
            return unwrap(json.load(fh))
    except (OSError, json.JSONDecodeError) as exc:
        warn(f"{path.name}: 읽을 수 없어 건너뜁니다 ({exc})")
        return None


def warn(message):
    print(f"  경고: {message}", file=sys.stderr)


def load_inline_images(dump_dir):
    """Map image document id -> (bytes, extension) from the `images` dump."""
    images = {}
    image_dir = dump_dir / "images"
    if not image_dir.is_dir():
        return images

    for path in sorted(image_dir.glob("*.json")):
        body = read_json(path)
        if not body:
            continue
        match = DATA_URL_RE.match(str(body.get("dataUrl", "")))
        if not match:
            warn(f"{path.stem}: data URL 형식이 아니어서 건너뜁니다")
            continue
        try:
            raw = base64.b64decode(match.group("b64"), validate=True)
        except (binascii.Error, ValueError) as exc:
            warn(f"{path.stem}: base64 디코딩 실패 ({exc})")
            continue
        images[path.stem] = (raw, EXT_BY_FORMAT[match.group("fmt")])
    return images


def load_asset_files(dump_dir):
    """Map asset id -> file path for assets Claude fetched alongside the dump."""
    asset_dir = dump_dir / "assets"
    if not asset_dir.is_dir():
        return {}
    return {p.stem: p for p in sorted(asset_dir.iterdir()) if p.is_file()}


def load_confirms(dump_dir, record_id):
    """Reproduction confirmations for one record, oldest first."""
    confirm_dir = dump_dir / "records" / record_id / "confirms"
    if not confirm_dir.is_dir():
        return []

    confirms = []
    for path in sorted(confirm_dir.glob("*.json")):
        body = read_json(path)
        if not body:
            continue
        confirms.append({
            "name": body.get("name", ""),
            "lab": body.get("lab", ""),
            "note": body.get("note", ""),
            "at": body.get("at", ""),
        })
    confirms.sort(key=lambda c: c.get("at") or "")
    return confirms


def build_record(body, record_id, dump_dir, inline_images, asset_files, img_out, written, dry_run):
    """Validate one record and resolve its images; returns None if unusable."""
    missing = [f for f in REQUIRED_FIELDS if not body.get(f)]
    if missing:
        warn(f"{record_id}: 필수 항목 누락({', '.join(missing)}) — 제외합니다")
        return None
    if body.get("type") not in VALID_TYPES:
        warn(f"{record_id}: 알 수 없는 유형 '{body.get('type')}' — 제외합니다")
        return None
    if body.get("outcome") not in VALID_OUTCOMES:
        warn(f"{record_id}: 알 수 없는 결과 '{body.get('outcome')}' — 제외합니다")
        return None

    record = {k: v for k, v in body.items() if k not in REDACTED_FIELDS}
    record["id"] = record_id

    published_images = []
    for image in body.get("images") or []:
        caption = image.get("caption", "")
        if image.get("kind") == "inline" and image.get("doc") in inline_images:
            raw, ext = inline_images[image["doc"]]
            name = f"{image['doc']}{ext}"
            if not dry_run:
                (img_out / name).write_bytes(raw)
            written.add(name)
            published_images.append({"file": f"img/{name}", "caption": caption})
        elif image.get("kind") == "asset" and image.get("id") in asset_files:
            source = asset_files[image["id"]]
            name = f"{image['id']}{source.suffix or '.jpg'}"
            if not dry_run:
                shutil.copyfile(source, img_out / name)
            written.add(name)
            published_images.append({"file": f"img/{name}", "caption": caption})
        else:
            warn(f"{record_id}: 이미지 하나를 찾지 못해 제외합니다 ({image.get('kind')})")
    record["images"] = published_images

    confirms = load_confirms(dump_dir, record_id)
    if confirms:
        record["confirms"] = confirms
        # The stored counter can drift; the confirmations themselves are truth.
        record["confirmCount"] = len(confirms)
    else:
        record["confirmCount"] = int(body.get("confirmCount") or 0)

    return record


def main():
    parser = argparse.ArgumentParser(description="Artifact DB 덤프를 공개 사이트 데이터로 변환합니다.")
    parser.add_argument("dump", type=Path, help="ArtifactData out_dir 덤프 디렉터리")
    parser.add_argument("--site", type=Path, default=Path("docs"), help="사이트 디렉터리 (기본: docs — GitHub Pages가 서빙하는 폴더)")
    parser.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 출력")
    args = parser.parse_args()

    dump_dir = args.dump.resolve()
    if not dump_dir.is_dir():
        sys.exit(f"오류: {dump_dir} 가 없습니다. 덤프를 먼저 실행하세요.")

    # An empty `records` collection writes no directory at all. That is a valid
    # state for a young archive, so distinguish it from a dump that never ran:
    # the dump directory missing is an error, an empty one is simply zero records.
    record_dir = dump_dir / "records"
    if not record_dir.is_dir():
        warn("덤프에 records 가 없습니다 — 공개 기록 0건으로 처리합니다.")

    data_out = args.site / "data"
    img_out = data_out / "img"
    if not args.dry_run:
        img_out.mkdir(parents=True, exist_ok=True)

    inline_images = load_inline_images(dump_dir)
    asset_files = load_asset_files(dump_dir)
    print(f"덤프: {dump_dir}")
    print(f"  인라인 이미지 {len(inline_images)}개, 별도 asset 파일 {len(asset_files)}개")

    written = set()
    records = []
    for path in sorted(record_dir.glob("*.json")):
        body = read_json(path)
        if not body:
            continue
        record = build_record(
            body, path.stem, dump_dir, inline_images, asset_files,
            img_out, written, args.dry_run,
        )
        if record:
            records.append(record)

    # Newest first; the page re-sorts, but a stable order keeps git diffs small.
    records.sort(key=lambda r: r.get("createdAt") or "", reverse=True)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(records),
        "records": records,
    }

    by_type = {}
    for record in records:
        by_type[record["type"]] = by_type.get(record["type"], 0) + 1
    print(f"  공개 기록 {len(records)}건 " + (", ".join(f"{k} {v}" for k, v in sorted(by_type.items())) or "(없음)"))

    if args.dry_run:
        print("  --dry-run: 파일을 쓰지 않았습니다.")
        return

    out_file = data_out / "records.json"
    out_file.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  작성: {out_file}")

    # Remove images no record points at any more, so deletions in the
    # submission app propagate to the public mirror.
    removed = 0
    for existing in img_out.iterdir():
        if existing.is_file() and existing.name not in written:
            existing.unlink()
            removed += 1
    print(f"  이미지 {len(written)}개 유지, {removed}개 삭제")


if __name__ == "__main__":
    main()
