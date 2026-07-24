#!/usr/bin/env python3
"""Auto-monitor conference pages for newly announced deadlines/venues.

For every conference in data/conferences.yml that has a `monitor.url`:
  1. Fetch the page and reduce it to visible text.
  2. Compare a content hash against data/snapshots.json.
  3. If the page changed and ANTHROPIC_API_KEY is set, ask Claude to extract
     the paper deadline / conference dates / location and update the YAML
     entry (flipping status: estimated -> confirmed when official).
  4. Without an API key, changes are only recorded in data/alerts.json so a
     human (or a Claude Code session) can review them.

Designed to run in GitHub Actions on a weekly cron. Dependencies:
  pip install requests pyyaml anthropic
"""

import hashlib
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

import requests
import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "conferences.yml"
SNAPSHOTS = ROOT / "data" / "snapshots.json"
ALERTS = ROOT / "data" / "alerts.json"

UA = {"User-Agent": "Mozilla/5.0 (compatible; mir-ai-deadlines-monitor/1.0)"}

EXTRACT_PROMPT = """You are updating a conference-deadline tracker.

Current YAML entry for {title} {year}:
```yaml
{entry}
```

Below is the text of the conference's official page. Extract, if present:
- paper submission deadline (and abstract deadline if any)
- conference start/end dates
- location (city, country)

Respond with ONLY a JSON object (no markdown fence) with any of these keys —
omit a key if the page does not state it clearly:
  "deadline": "YYYY-MM-DD HH:MM"  (assume 23:59 if no time given)
  "abstract_deadline": "YYYY-MM-DD HH:MM"
  "date": "human-readable, e.g. May 16-21, 2027"
  "start": "YYYY-MM-DD"
  "end": "YYYY-MM-DD"
  "place": "City, Country"
  "confirmed": true   (ONLY if the page officially states the deadline)
If the page contains no relevant new information, respond with {{}}.

PAGE TEXT:
{page}
"""


def strip_html(html: str) -> str:
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;|&amp;|&#\d+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_with_claude(entry: dict, page_text: str) -> dict:
    import anthropic

    client = anthropic.Anthropic()
    prompt = EXTRACT_PROMPT.format(
        title=entry["title"],
        year=entry["year"],
        entry=yaml.safe_dump(entry, sort_keys=False, allow_unicode=True),
        page=page_text[:30000],
    )
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = msg.content[0].text.strip()
    raw = re.sub(r"^```(json)?|```$", "", raw, flags=re.M).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def main() -> int:
    doc = yaml.safe_load(DATA.read_text())
    snapshots = json.loads(SNAPSHOTS.read_text()) if SNAPSHOTS.exists() else {}
    alerts = []
    changed_yaml = False
    use_llm = bool(os.environ.get("ANTHROPIC_API_KEY"))

    for entry in doc.get("conferences", []):
        url = (entry.get("monitor") or {}).get("url")
        if not url:
            continue
        cid = entry["id"]
        try:
            resp = requests.get(url, headers=UA, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"[warn] {cid}: fetch failed ({e})", file=sys.stderr)
            continue

        text = strip_html(resp.text)
        digest = hashlib.sha256(text.encode()).hexdigest()
        if snapshots.get(cid) == digest:
            print(f"[ok] {cid}: unchanged")
            continue

        first_seen = cid not in snapshots
        snapshots[cid] = digest
        if first_seen:
            print(f"[ok] {cid}: baseline snapshot stored")
            continue

        print(f"[change] {cid}: page changed")
        alert = {"id": cid, "url": url, "detected": date.today().isoformat()}

        if use_llm:
            update = extract_with_claude(entry, text)
            applied = {}
            for key in ("deadline", "abstract_deadline", "date", "start", "end", "place"):
                if update.get(key) and update[key] != entry.get(key):
                    entry[key] = update[key]
                    applied[key] = update[key]
            if update.get("confirmed") and applied:
                entry["status"] = "confirmed"
                entry.pop("note", None)
            if applied:
                changed_yaml = True
                alert["applied"] = applied
                print(f"[update] {cid}: {applied}")
        alerts.append(alert)

    if changed_yaml:
        doc.setdefault("meta", {})["updated"] = date.today().isoformat()
        DATA.write_text(yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=100))
    SNAPSHOTS.write_text(json.dumps(snapshots, indent=2))
    ALERTS.write_text(json.dumps(alerts, indent=2))

    # expose for the GitHub Actions step summary
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"changes={'true' if alerts else 'false'}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
