#!/usr/bin/env python3
"""
Batch insert punchlines into pquiz via admin API.
Reads seed-research/seed.json and POSTs each line to /api/admin/bars.

Usage:
  python3 seed-research/batch-insert.py --url https://punchlinequiz.de --token <TOKEN>
  python3 seed-research/batch-insert.py --url http://localhost:3002 --token <TOKEN> --dry-run
  python3 seed-research/batch-insert.py --url <URL> --token <TOKEN> --verified-only
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

def post_bar(base_url: str, token: str, bar: dict) -> dict:
    """POST a single bar to the admin API."""
    url = f"{base_url}/api/admin/bars"
    payload = {
        "artist": bar["artist"],
        "song": bar["song"],
        "line": bar["line"],
        "distractor1": bar["distractor1"],
        "distractor2": bar["distractor2"],
    }
    if bar.get("album"):
        payload["album"] = bar["album"]
    if bar.get("year"):
        payload["releaseYear"] = bar["year"]

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read())
            return {"status": resp.status, "body": body}
    except urllib.error.HTTPError as e:
        body = json.loads(e.read()) if e.readable() else {}
        return {"status": e.code, "body": body}
    except Exception as e:
        return {"status": 0, "body": {"error": str(e)}}


def main():
    parser = argparse.ArgumentParser(description="Batch insert punchlines")
    parser.add_argument("--url", required=True, help="Base URL (e.g. http://localhost:3002)")
    parser.add_argument("--token", required=True, help="PQUIZ_ADMIN_TOKEN")
    parser.add_argument("--dry-run", action="store_true", help="Print without inserting")
    parser.add_argument("--verified-only", action="store_true", help="Only insert verified lines")
    parser.add_argument("--artist", help="Only insert for this artist (exact match)")
    parser.add_argument("--delay", type=float, default=0.3, help="Delay between requests (seconds)")
    parser.add_argument("--limit", type=int, default=0, help="Max lines to insert (0 = all)")
    args = parser.parse_args()

    # Load seed data
    seed_path = Path(__file__).parent / "seed.json"
    if not seed_path.exists():
        print(f"ERROR: {seed_path} not found", file=sys.stderr)
        sys.exit(1)

    with open(seed_path) as f:
        bars = json.load(f)

    # Apply filters
    if args.verified_only:
        bars = [b for b in bars if b.get("verified")]
    if args.artist:
        bars = [b for b in bars if b["artist"] == args.artist]
    if args.limit > 0:
        bars = bars[:args.limit]

    print(f"Loaded {len(bars)} punchlines to insert")
    print(f"Target: {args.url}")
    print(f"Verified only: {args.verified_only}")
    if args.dry_run:
        print("DRY RUN — no requests will be made\n")

    stats = {"ok": 0, "dup": 0, "err": 0, "skip": 0}
    errors = []

    for i, bar in enumerate(bars, 1):
        label = f"[{i}/{len(bars)}] {bar['artist']} — {bar['song'][:30]}"
        verified_marker = "✓" if bar.get("verified") else "?"

        if args.dry_run:
            print(f"  {verified_marker} {label}: {bar['line'][:60]}...")
            stats["skip"] += 1
            continue

        result = post_bar(args.url, args.token, bar)
        status = result["status"]

        if status == 201:
            print(f"  ✓ {label} → created (id={result['body'].get('punchlineId', '?')})")
            stats["ok"] += 1
        elif status == 409:
            print(f"  ≡ {label} → duplicate (id={result['body'].get('details', {}).get('existingId', '?')})")
            stats["dup"] += 1
        elif status == 401:
            print(f"  ✗ AUTH ERROR — check your token", file=sys.stderr)
            sys.exit(1)
        else:
            print(f"  ✗ {label} → {status}: {result['body']}")
            stats["err"] += 1
            errors.append({"bar": bar, "result": result})

        time.sleep(args.delay)

    print(f"\nDone.")
    print(f"  Created: {stats['ok']}")
    print(f"  Duplicates: {stats['dup']}")
    print(f"  Errors: {stats['err']}")
    print(f"  Skipped (dry): {stats['skip']}")

    if errors:
        print(f"\nErrors detail:")
        for e in errors[:10]:
            print(f"  {e['bar']['artist']} - {e['bar']['song']}: {e['result']['body']}")


if __name__ == "__main__":
    main()
