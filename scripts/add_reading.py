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
    if not title:  # medium.com/@x/some-post-title-3f2a9 -> "Some post title"
        slug = urllib.parse.urlsplit(url).path.rstrip("/").split("/")[-1]
        slug = re.sub(r"-[0-9a-f]{8,12}$", "", slug)
        title = slug.replace("-", " ").replace("_", " ").strip().capitalize() or url
    title = re.sub(r"\s*[|–—-]\s*(Medium|by .+ \| Medium)$", "", title)
    author = meta(doc, "author", "article:author", "twitter:creator")
    if author and author.startswith("http"):
        author = None
    return shorten(title, 140), author


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url", nargs="?")
    ap.add_argument("--tags", default="")
    ap.add_argument("--note", default="")
    ap.add_argument("--status", default="to-read", choices=["to-read", "read"])
    ap.add_argument("--issue-body-env")
    a = ap.parse_args()

    if a.issue_body_env:
        a.url, a.tags, a.note, a.status = parse_issue(os.environ.get(a.issue_body_env, ""))
    m = re.search(r"https?://\S+", a.url or "")
    if not m:
        sys.exit("no http(s) link found")
    url = clean_url(m.group(0).rstrip(").,>"))

    raw = DATA.read_text() if DATA.exists() else ""
    header = "".join(l for l in raw.splitlines(True) if l.startswith("#") or not l.strip()).rstrip() + "\n\n"
    items = yaml.safe_load(raw) or []
    if any(clean_url(i["url"]) == url for i in items):
        print(f"already saved: {url}")
        return

    is_x = urllib.parse.urlsplit(url).netloc in ("x.com",)
    title, author = from_x(url) if is_x else from_page(url)
    entry = {"url": url, "title": title}
    if author:
        entry["author"] = author
    tags = [t.strip().lower().lstrip("#").replace(" ", "-") for t in re.split(r"[,\s]+", a.tags) if t.strip()]
    if tags:
        entry["tags"] = tags
    if a.note:
        entry["note"] = a.note
    entry["status"] = a.status
    entry["added"] = datetime.date.today()

    items.append(entry)
    body = yaml.safe_dump(items, sort_keys=False, allow_unicode=True, width=1000, default_flow_style=None)
    DATA.write_text(header + body.replace("\n- url:", "\n\n- url:"))
    print(json.dumps({k: str(v) for k, v in entry.items()}))


if __name__ == "__main__":
    main()
