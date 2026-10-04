# samadeep.github.io: working instructions

Samadeep Sengupta's engineering blog: https://samadeep.github.io. Astro 7, deployed to GitHub Pages from `main`.
These instructions are **self-evolving**: see "How this file evolves" at the end. Read it all before working here.

## Owner rules (never break)

- **No em dashes** anywhere: prose, code comments, commits, PR text. Use a comma, colon, parentheses or a new sentence.
- **Never name internal D.E. Shaw products, systems or details** in anything public. Describe work generically.
- **No Claude trailers, co-author lines or session links** in commits or PR descriptions.
- **Testimony needs his explicit yes.** First-person experiences, feelings, opinions and promises in his voice are written only from his own words. "Merge if you're happy" delegates the quality call, never testimony. First person is fine for things actually done for the post ("I ran", "I built the lab").
- **Evidence over "should work".** Build it, run it, screenshot it before calling it done. Say "I don't know" rather than guess an API, flag or number.
- **Merge only when he says "merge"** (or delegates and quality + testimony checks pass). Squash-merge through `gh api` REST (GraphQL is blocked from the agent workspace).
- Be token-economical; don't re-read or re-paste what's already known.

## How posts should read (current style)

- **Short and engaging.** Lead with the answer, then one hook (a real moment or a surprising result), then numbered sections: *the break -> a diagram -> ▶ a runnable command -> its output -> the fix in one line.* Aim for ~1,500 to 1,800 words; cut anything a skimmer wouldn't miss.
- **Every section earns one insight.** End each main section with `> **Insight:** ...` (rendered as a lightbulb callout): one or two sentences a reader could repeat to a colleague. An insight is a mechanism ("rules run once per connection"), a reframing ("serving is cache placement disguised as load balancing") or a transferable rule ("debug from the counter of the rule that should have matched"). It is never a summary of the section, a definition, or a claim about his feelings. If a section has no insight, cut or merge the section.
- **Readers run things, they don't read about labs.** Every shell command goes in a ```bash block (it gets a ▶ Run button); small calculations go in ```python blocks. Don't narrate "the lab" or write "lab notes"; show the command and its real output. Evidence is called out briefly, limits and sources go in a closing `<details>` block.
- **Borrowed from Cloudflare's best posts:** headings are claims, not labels ("API: the stream is a resource, not a connection", not "API"). Under the short answer, one roadmap sentence says what the rest of the post covers. Show the smallest complete thing first (the whole fix, the whole API), then "there's a lot underneath". End with a `## Try it` section that says how to run it on the reader's own machine. Commands meant for the reader's own machine (they'd fail in the browser VM, for example `npm install`) go in a ```zsh block, which gets no ▶ Run button.
- **Written to be picked up, then found** (from HN/X data, Oct 2026; the posts that spread state a surprising finding, generic "How to design X" titles never reach the top lists):
  - **Title = the finding, not the topic,** at most ~60 characters, backed by a real number in the post ("Why your LLM token stream arrives all at once", "It's Always TCP_NODELAY"). No first-person claims in titles unless he said them. Keep the URL slug when retitling so shared links survive.
  - **The search query lives in the description** (at most 160 characters) and the short answer, so search still finds the post.
  - **First paragraph = the surprise in two or three sentences** with the number, then the short answer.
  - **`hook: { stat, caption }` in front matter** puts the number huge on the share card (`src/pages/og/[slug].png.ts`); write `→` freely, the card draws it.
  - Pick topics with pull: a live debate, current AI-infra news, or a classic mechanism nobody has made runnable. Our edge is "runs in your browser"; say so on the card and in launch posts.
  - **Launch kit per post** (drafts only; he posts them himself): a 10 to 20 s screen recording of the bug for X (native video, link in the first reply), the share card, an HN title (the real post title, no editorializing; a blog post isn't Show HN, but a playable lab can be), and a LinkedIn text post.
- Topics: `algorithms`, `systems`, `low-latency`, `ai`. Process detail lives in the `write-blog-post` skill.
- **System design posts** follow the interview arc, each part short: requirements (with numbers) -> API -> capacity (a runnable ```python block) -> the design diagram -> "life of a request" in numbered steps -> deep dives (each with evidence) -> data model -> failure modes table -> "what most diagrams get wrong" -> takeaways. Be correct where typical diagrams aren't (for example, KV cache lives in GPU memory, not Redis).

## Diagrams: ```fig, laid out on a grid (the Agent Teams look)

- The bar is the Claude Code docs "Subagents vs Agent Teams" figure (his pick, and `fig` redraws it from ~30 lines). Its posture comes from layout, not colour: strict rows, one width per row, full-width bars, short straight arrows with small labels, titled grey panels. Text is the site's Aptos Mono (his call), not the reference's Nunito. Auto-layout (D2, Mermaid) can't do that, so posts use our renderer `src/lib/remark-fig.mjs`: ```fig title="<the conclusion>"``` -> one inline SVG, coloured by CSS variables in `src/styles/fig.css` (follows the theme toggle; no per-theme files). The first figure of a post is also written to `public/diagrams/fig-<hash>.svg` as its cover.
- **Grammar** (full notes at the top of `remark-fig.mjs`):
  - `panel <title>` starts a panel (side by side; `layout stack` stacks them, sharing one column grid, titles inside). `row` starts a row. `_` (or `_ 2`) is an empty cell.
  - Node: `id: <class> "Label\nsecond line" [span N] [icon <lucide-name>] [body "line\nline"]` (icon/body make a card). Classes: `main` (the thing in charge), `worker`, `peer` (clients, actors), `shared` (shared state, dotted), `result` (dotted circle), `allow`, `deny`, `ask`, `box`.
  - Edge: `a -> b "label" [lost|good|muted|dashed] [via left|right|below]`, `<->` for both ways, `r1 r2 r3 -> m "Report" muted via left` merges loop-backs onto one bus like the reference.
  - `seq` as the first line makes a sequence diagram: actors as nodes, then messages top to bottom (`f -> f "note"` is a note on f's lifeline).
- Place boxes so lines run straight: put a target in the same column as its source, use `_` cells to line things up, and reorder cells before reaching for `via`. Prefer side-by-side panels for "broken vs fixed" and "what you picture vs what happens"; wide, short layouts over tall ones.
- At most ~7 boxes per panel, labels of a few words, real values (IPs, ports, ms), never foo/bar. Caption states the conclusion.
- Check every figure in light, dark and at 390px (narrow screens keep a readable minimum width and scroll sideways).
- Older posts use ```d2 (`remark-d2.mjs`) or ```plantuml; convert them to ```fig when you touch them.

## Running code in the reader's browser

- `src/scripts/vm.ts`: ▶ Run on ```bash/```python blocks types the command into a **real Linux VM** (Alpine, kernel 6.12, on the v86 emulator) in a docked terminal. A post sets `vm: { setup: '<command>' }` in front matter; it runs before the reader's first command.
- The VM image is built by `.github/workflows/vm.yml` (`vm/Dockerfile`, smoke-tested inside the VM, snapshot saved) and published to the `vm-dist` branch (`vm-dist-preview` off main); `deploy.yml` copies it to `/vm/`. Lab files from `public/labs/` are baked in; `curl https://samadeep.github.io/...` inside the VM is served offline.
- Emulation is slow (seconds to a minute per step). Anything heavy (thousands of connections) stays as recorded output with a note.
- `src/scripts/labs.ts`: `<div data-lab="py" data-src=... data-presets="a|b">` runs a Python file with Pyodide (instant, good for simulators); `<div data-lab="stream">` is the streaming demo.

## Site map

- Content: `src/content/posts/YYYY-MM-DD-<slug>.md` (schema in `src/content.config.ts`), reading list `src/data/reading.yml`.
- Look: `src/styles/global.css` (tokens; Aptos Mono with JetBrains Mono fallback; Ink Black #031211, Warm Ivory #E8E4D3, Electric Teal #00AEBB), `src/layouts/Base.astro`, components in `src/components/`.
- Search: Pagefind with a custom UI (`Search.astro`), index built by `scripts/search-index.mjs` (reading items as records).
- Reading list automation: `.github/workflows/reading-add.yml` (owner-only issues, iPhone dispatch, nightly Smriti sync).
- Analytics: Cloudflare Web Analytics; comments and reactions: giscus (`src/lib/site.ts`).
- Header brand reads "Samadeep's blog" and types itself on every home page load and on the first page of a visit elsewhere (off when the OS asks for reduced motion). Theme toggle reveals the new theme as a growing circle (View Transitions). Posts show a scroll-driven reading progress bar; the header is sticky and translucent.
- **Layout on wide screens (>= 1280px):** site width 1320px; posts put the contents rail on the left, keep prose at ~76ch, and let diagrams, labs, code frames and tables spread into the right-hand space. Don't widen the text column itself.
- Post header (Cloudflare-style): topic and up to three tags as labels above the title; a byline below the lede (name, readable date, minutes, "N commands run in your browser" when the post has a VM).
- Writing page (`src/pages/posts/index.astro`): "Start here" cards (posts with `vm`, led by their hook number), filter chips for topic, "runs in your browser" and "under 10 min" (mirrored in the URL, e.g. `?topic=systems&run`), then one line per post grouped by year. No tag cloud on the page. Count runnable commands only for posts with a VM.
- Posts: every h2/h3 gets a link icon on hover that copies the section URL; a back-to-top button appears after the first screen, with a ring that fills as you read.
- Home (`src/pages/index.astro`): terminal-prompt hero (his name as the h1), three site principles, live stats (posts, runnable commands, diagrams, last update) and a "Start here" pair chosen from posts with `vm` front matter. Keep principles factual about the site, never claims in his voice.

## Workflow

1. Branch from `origin/main`. `npm run build` and `npx astro check` (0 errors) before pushing.
2. Screenshot light, dark and 390px phone with Playwright (`executablePath: '/opt/pw-browsers/chromium'`) and look at them.
3. PR via `gh api repos/samadeep/samadeep.github.io/pulls`; list unverified claims and any first-person lines.
4. After merge, check the live page (the agent workspace can't reach the site; use the browser pane).
- Gotchas: a remark plugin error is only logged and `npm run build` still exits 0, so grep the build log for `error`. Old `.diagram svg` rules in global.css reach into inline SVGs; fig styles are scoped under `.fig-svg` to win. Never `pkill -f` (kills the agent shell); a process whose command line contains `node server.mjs` gets killed by the streaming lab's `stop_server`; Actions logs aren't downloadable from the workspace, so CI steps surface output as annotations (`vm/ci-run.sh`).

## How this file evolves

This file is the project's memory. Keep it current as part of the work, not after it:

1. **When Samadeep corrects, redirects or states a preference** about this site (style, design, process, a rule), update the relevant section above **in the same PR**, in his intent, and add one line to the log below. If a new rule contradicts an old one, replace the old one; don't keep both.
2. **When you discover a gotcha** that cost time (a tool quirk, a CI trap), add it under Workflow so it never costs time again.
3. **When the `write-blog-post` skill disagrees with this file**, this file wins for this repo; propose the skill update to him.
4. Keep it under ~150 lines: merge and prune rather than append forever.

### Rule log

- 2026-10-04: posts must be concise and engaging; readers run commands (▶ Run, real Linux in the browser) instead of reading about labs. No Codespaces.
- 2026-10-04: diagrams move to D2 in his reference style (dark cards with role colours, side-by-side panels), rendered per theme so light and dark both look right.
- 2026-10-04: reading-list additions stay owner-only (issue author must be the repo owner).
- 2026-10-04: delegated approval ("merge if you're happy") never covers testimony.
- 2026-10-04: system design content must beat the usual component-dump diagram: full interview arc, numbered icon cards, life of a request, failure modes, and calling out common mistakes.
- 2026-10-04: the home page should feel thoughtful on open: prompt-style hero, principles, stats, "Start here".
- 2026-10-04: use more width on desktop without hurting reading: wide figures and code, not wider text. Header says "Samadeep's blog", typed in.
- 2026-10-04: posts must deliver insights, not just facts: one `Insight` callout per main section. The typing animation must be visible on the home page every time.
- 2026-10-04: the restrained neutral theme was rejected; diagrams now copy the Claude Code docs Subagents / Agent Teams figure (pastel fills, thin dark outlines, sans, titled grey panels).
- 2026-10-05: took Cloudflare's Workers Cache post as a model: claim headings, a roadmap line, a Try it close, wide left-to-right figures, heading copy-links, a back-to-top progress ring.
- 2026-10-05: D2's auto-layout never matched the Agent Teams figure's posture ("how the fonts and diagrams are arranged"); all diagrams moved to our own grid renderer (```fig) with equal-width rows, full-width bars and straight short arrows.
- 2026-10-05: diagram text uses Aptos Mono (JetBrains Mono fallback), the site's font, not Nunito.
- 2026-10-05: launches weren't picked up; posts must be written to spread: finding-first titles, a surprise in the first lines, big-number share cards, and a launch kit (video, X thread, HN title, LinkedIn post) per post.
- 2026-10-05: labels go above the post title like Cloudflare's; the Writing page must not overwhelm: start-here picks, real filters, a compact list by year.
