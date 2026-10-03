#!/usr/bin/env python3
"""Append a link to _data/reading.yml, filling title/author from the page.

  python3 scripts/add_reading.py <url> [--tags a,b] [--note "..."] [--status read]
  python3 scripts/add_reading.py --issue-body-env ISSUE_BODY   # used by the GitHub Action

X posts resolve through the public oEmbed endpoint (no auth). Everything else
reads og:title / og:site_name / author meta. If a fetch fails the entry is
still added with a title derived from the URL, so adding never blocks on it.
"""
import argparse, datetime, html, json, os, re, sys, urllib.parse, urllib.request
from pathlib import Path

import yaml

DATA = Path(__file__).resolve().parent.parent / "src" / "data" / "reading.yml"
UA = "Mozilla/5.0 (compatible; reading-list-bot; +https://samadeep.github.io/reading/)"
TRACKING = re.compile(r"^(utm_|fbclid|gclid|ref_src|ref_url|s$|t$|source$|sk$)")


def clean_url(url):
    p = urllib.parse.urlsplit(url.strip())
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query) if not TRACKING.match(k)]
    host = p.netloc.lower().replace("www.", "").replace("mobile.twitter.com", "x.com").replace("twitter.com", "x.com")
    return urllib.parse.urlunsplit((p.scheme or "https", host, p.path.rstrip("/") or "/", urllib.parse.urlencode(q), ""))


def get(url, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(600_000).decode("utf-8", "replace")


def meta(doc, *names):
    for n in names:
        m = re.search(r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]*content=["\']([^"\']+)' % re.escape(n), doc, re.I) \
            or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']%s["\']' % re.escape(n), doc, re.I)
        if m:
            return html.unescape(m.group(1)).strip()
    return None


def shorten(text, n=110):
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "..."


def from_x(url):
    handle = urllib.parse.urlsplit(url).path.strip("/").split("/")[0]
    try:
        o = json.loads(get("https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=" + urllib.parse.quote(url, safe="")))
        body = re.search(r"<p[^>]*>(.*?)</p>", o.get("html", ""), re.S)
        text = html.unescape(re.sub(r"<[^>]+>", " ", body.group(1))) if body else ""
        text = re.sub(r"\s*(https?://)?t\.co/\S+", "", text)
        return shorten(text) or f"Post by @{handle}", f"{o.get('author_name', handle)} (@{handle})"
    except Exception as e:  # deleted post, rate limit, network
        print(f"oEmbed failed ({e}); using handle", file=sys.stderr)
        return f"Post by @{handle}", f"@{handle}"


def from_page(url):
    try:
        doc = get(url)
    except Exception as e:
        print(f"fetch failed ({e}); title from url", file=sys.stderr)
        doc = ""
    title = meta(doc, "og:title", "twitter:title")
    if not title:
        m = re.search(r"<title[^>]*>(.*?)</title>", doc, re.S | re.I)
        title = html.unescape(m.group(1)).strip() if m else None
    if title:
        title = shorten(re.sub(r"\s*[|–—-]\s*(Medium|by .+ \| Medium)$", "", title), 140)
    author = meta(doc, "author", "article:author", "twitter:creator")
    if author and author.startswith("http"):
        author = None
    return title, author  # title is None when the page gave nothing usable


def title_from_url(url):
    """medium.com/@x/some-post-title-3f2a9 -> 'Some post title'"""
    slug = urllib.parse.urlsplit(url).path.rstrip("/").split("/")[-1]
    slug = re.sub(r"-[0-9a-f]{8,12}$", "", slug)
    return slug.replace("-", " ").replace("_", " ").strip().capitalize() or url


def parse_issue(body):
    """GitHub issue forms render as '### Label\\n\\nvalue'."""
    fields, label = {}, None
    for line in body.splitlines():
        if line.startswith("### "):
            label = line[4:].strip().lower()
            fields[label] = ""
        elif label is not None:
            fields[label] += line + "\n"
    f = {k: v.strip() for k, v in fields.items()}
    pick = lambda *ks: next((f[k] for k in ks if f.get(k) and f[k] != "_No response_"), "")
    return pick("link", "url"), pick("tags"), pick("why it is worth it", "note"), pick("status") or "to-read"


def norm_tags(tags):
    if isinstance(tags, str):
        tags = re.split(r"[,\s]+", tags)
    return [t.strip().lower().lstrip("#").replace(" ", "-") for t in tags or [] if t and t.strip()]


def add_many(records):
    """Append records ({url, tags?, note?, status?, title?, added?}) in one write.
    Existing URLs are skipped, except that a later 'read' status marks them read."""
    raw = DATA.read_text() if DATA.exists() else ""
    header = "".join(l for l in raw.splitlines(True) if l.startswith("#") or not l.strip()).rstrip() + "\n\n"
    items = yaml.safe_load(raw) or []
    by_url = {clean_url(i["url"]): i for i in items}
    added, changed = [], 0
    for r in records:
        m = re.search(r"https?://\S+", r.get("url") or "")
        if not m:
            print(f"skip, no link: {r!r}", file=sys.stderr)
            continue
        url = clean_url(m.group(0).rstrip(").,>"))
        status = "read" if r.get("status") == "read" else "to-read"
        if url in by_url:
            if status == "read" and by_url[url].get("status") != "read":
                by_url[url]["status"] = "read"; changed += 1
            continue
        is_x = urllib.parse.urlsplit(url).netloc == "x.com"
        title, author = from_x(url) if is_x else from_page(url)
        if not title or title.startswith("Post by @"):
            # fetched nothing real: prefer the caller's name (e.g. the Smriti row), then the URL slug
            title = r.get("title") or title or title_from_url(url)
        entry = {"url": url, "title": title}
        if author:
            entry["author"] = author
        if tags := norm_tags(r.get("tags")):
            entry["tags"] = tags
        if r.get("note"):
            entry["note"] = r["note"]
        entry["status"] = status
        added_on = r.get("added")
        entry["added"] = datetime.date.fromisoformat(added_on) if isinstance(added_on, str) else added_on or datetime.date.today()
        items.append(entry); by_url[url] = entry; added.append(entry)
    if added or changed:
        body = yaml.safe_dump(items, sort_keys=False, allow_unicode=True, width=1000, default_flow_style=None)
        DATA.write_text(header + body.replace("\n- url:", "\n\n- url:"))
    for e in added:
        print(json.dumps({k: str(v) for k, v in e.items()}))
    print(f"added {len(added)}, marked read {changed}", file=sys.stderr)
    return added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url", nargs="?")
    ap.add_argument("--tags", default="")
    ap.add_argument("--note", default="")
    ap.add_argument("--status", default="to-read", choices=["to-read", "read"])
    ap.add_argument("--issue-body-env", help="env var holding a GitHub issue-form body")
    ap.add_argument("--json-env", help="env var holding one JSON record, e.g. a repository_dispatch payload")
    ap.add_argument("--json-file", help="file holding a JSON list of records")
    a = ap.parse_args()

    if a.issue_body_env:
        url, tags, note, status = parse_issue(os.environ.get(a.issue_body_env, ""))
        records = [{"url": url, "tags": tags, "note": note, "status": status}]
    elif a.json_env:
        records = [json.loads(os.environ.get(a.json_env) or "{}")]
    elif a.json_file:
        records = json.loads(Path(a.json_file).read_text())
    else:
        records = [{"url": a.url, "tags": a.tags, "note": a.note, "status": a.status}]
    if not add_many(records) and len(records) == 1 and not any(re.search(r"https?://", r.get("url") or "") for r in records):
        sys.exit("no http(s) link found")


if __name__ == "__main__":
    main()
