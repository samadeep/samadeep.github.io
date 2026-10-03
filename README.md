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

`src/data/reading.yml` drives `/reading/` and `/reading.xml`. To add a link:

- open an issue with the **Add to reading list** form (or use the bookmarklet on `/reading/`); an Action fills in title and author, commits, and redeploys
- or run `python3 scripts/add_reading.py <url> --tags llm,infra --note "why"`
