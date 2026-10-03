# samadeep.github.io

Personal site, built with [Astro](https://astro.build) and deployed to GitHub Pages on every push to `main`.

```
npm install
npm run dev       # http://localhost:4321
npm run build     # static site + search index in dist/
```

## Writing a post

Add `src/content/posts/YYYY-MM-DD-slug.md`. The URL becomes `/posts/slug/`.

```yaml
---
title: My post
description: One sentence, used for the lede, search results and the share card.
date: 2026-10-03
tags: [distributed-systems, cpp]
draft: false
---
```

Diagrams: write a ` ```plantuml ` fence. It is rendered to light and dark SVGs at build time
(needs Java + Graphviz locally) and cached in `public/diagrams/`. Commit those files.

## Reading list

`src/data/reading.yml` drives `/reading/` and `/reading.xml`. Every route below ends in the same
`scripts/add_reading.py`, which fetches the title and author, skips duplicates, commits and redeploys.

```
iPhone share sheet ──► POST /repos/.../dispatches {event_type: add-reading}
issue form / bookmarklet ──► issue labelled "reading" (owner only)          ──► reading-add.yml ──► deploy
Smriti (Notion), nightly 02:47 IST ──► rows: Type read|watch, Source set,
                                       not Dropped, not Area=work, not from Slack
```

### iPhone share sheet (one tap from X, Medium, Safari, anything)

1. Create a fine-grained token at github.com/settings/personal-access-tokens: repository access
   **only** `samadeep.github.io`, permission **Contents: Read and write**.
2. In Shortcuts, make a new shortcut, open its settings and turn on **Show in Share Sheet**
   (input types: URLs, Safari web pages, Text). Then add these actions:
   - **Get URLs from** Shortcut Input
   - **Get Item from List**: First Item
   - **Ask for Input** (Text), prompt `Tags (optional)`
   - **Get Contents of URL**: `https://api.github.com/repos/samadeep/samadeep.github.io/dispatches`
     - Method `POST`
     - Headers: `Authorization` = `Bearer <token>`, `Accept` = `application/vnd.github+json`
     - Request Body JSON: `event_type` = `add-reading`, `client_payload` (Dictionary):
       `url` = Item from List, `tags` = Provided Input
   - **Show Notification**: `Saved to reading list`
3. Name it **Save to reading**. GitHub answers `204` with an empty body on success.

### Smriti sync

1. Create an internal integration at notion.so/my-integrations (read content only) and copy its secret.
2. In Notion open the Smriti database, then **... > Connections** and add the integration.
3. In this repo, **Settings > Secrets and variables > Actions**, add `NOTION_TOKEN`.
4. Run it once by hand from **Actions > Reading list: add > Run workflow**.

### Other ways

- the **Add to reading list** issue form, or the bookmarklet on `/reading/`
- `python3 scripts/add_reading.py <url> --tags llm,infra --note "why"`
