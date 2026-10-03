#!/usr/bin/env python3
"""Pull public reading rows from Smriti (Notion) into src/data/reading.yml.

A row syncs only if ALL hold:
  Type in {read, watch}, Source is an http(s) link, Status != Dropped,
  Area != work, Captured from != Slack.
The last two keep anything work-related off the public site.

Needs NOTION_TOKEN (an internal integration with read access to the Smriti DB).
"""
import json, os, sys, urllib.error, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from add_reading import add_many  # noqa: E402

DATABASE_ID = "647ebfad53f04ac6aa44003c6121f809"
DATA_SOURCE_ID = "4b9d08d1-658f-4074-bab1-fea807b0c929"

FILTER = {"and": [
    {"or": [{"property": "Type", "select": {"equals": "read"}}, {"property": "Type", "select": {"equals": "watch"}}]},
    {"property": "Source", "url": {"is_not_empty": True}},
    {"property": "Status", "select": {"does_not_equal": "Dropped"}},
    {"property": "Area", "select": {"does_not_equal": "work"}},
    {"property": "Captured from", "select": {"does_not_equal": "Slack"}},
]}


def post(url, body, version):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers={
        "Authorization": f"Bearer {os.environ['NOTION_TOKEN']}",
        "Notion-Version": version, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def query_all():
    # Newer API queries data sources; older versions query the database. Try new, then old.
    endpoints = [(f"https://api.notion.com/v1/data_sources/{DATA_SOURCE_ID}/query", "2025-09-03"),
                 (f"https://api.notion.com/v1/databases/{DATABASE_ID}/query", "2022-06-28")]
    last = None
    for url, version in endpoints:
        rows, cursor = [], None
        try:
            while True:
                body = {"filter": FILTER, "page_size": 100, **({"start_cursor": cursor} if cursor else {})}
                page = post(url, body, version)
                rows += page["results"]
                if not page.get("has_more"):
                    print(f"queried {url.split('/v1/')[1]} (Notion-Version {version}): {len(rows)} rows", file=sys.stderr)
                    return rows
                cursor = page["next_cursor"]
        except urllib.error.HTTPError as e:
            last = f"{e.code} {e.read()[:300]!r}"
            print(f"{url} -> {last}", file=sys.stderr)
    sys.exit(f"Notion query failed on every endpoint: {last}. Is the Smriti DB shared with the integration?")


def text(prop):
    if not prop:
        return ""
    t = prop.get("type")
    if t in ("title", "rich_text"):
        return "".join(x.get("plain_text", "") for x in prop[t])
    if t == "url":
        return prop["url"] or ""
    if t == "select":
        return (prop["select"] or {}).get("name", "")
    return ""


def to_record(row):
    p = row["properties"]
    tags = [o["name"] for o in (p.get("Tags") or {}).get("multi_select", [])]
    return {
        "url": text(p.get("Source")),
        "title": text(p.get("Name")),
        "tags": tags,
        "status": "read" if text(p.get("Status")) == "Done" else "to-read",
        "added": row["created_time"][:10],
    }


if __name__ == "__main__":
    if not os.environ.get("NOTION_TOKEN"):
        sys.exit("NOTION_TOKEN is not set")
    records = [to_record(r) for r in query_all()]
    add_many([r for r in records if r["url"].startswith("http")])
