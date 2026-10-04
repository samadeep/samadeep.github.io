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
- **Readers run things, they don't read about labs.** Every shell command goes in a ```bash block (it gets a ▶ Run button); small calculations go in ```python blocks. Don't narrate "the lab" or write "lab notes"; show the command and its real output. Evidence is called out briefly, limits and sources go in a closing `<details>` block.
- **Search-ready:** title at most 60 characters phrased as the query, description at most 160, short answer in the first paragraph.
- Topics: `algorithms`, `systems`, `low-latency`, `ai`. Process detail lives in the `write-blog-post` skill.
- **System design posts** follow the interview arc, each part short: requirements (with numbers) -> API -> capacity (a runnable ```python block) -> the design diagram -> "life of a request" in numbered steps -> deep dives (each with evidence) -> data model -> failure modes table -> "what most diagrams get wrong" -> takeaways. Be correct where typical diagrams aren't (for example, KV cache lives in GPU memory, not Redis).

## Diagrams: D2, styled like his reference

- Write ```d2 title="<the point it makes>"``` fences. `src/lib/remark-d2.mjs` renders each twice at build (light + dark), caches them in `public/diagrams/d2-<hash>-<theme>.svg` (commit these), and the page shows the one matching the site's theme toggle.
- **Say what a box is, not how it looks:** classes from `src/lib/d2/{light,dark}.d2`: `main` (entry point / the thing in charge), `worker`, `peer` (clients, actors), `shared` (shared state, dashed), `result` (dotted circle outcome), `allow`, `deny`, `ask`, `panel` (titled container). Edges: `{class: lost}` for dropped or broken paths, `{class: good}` for the fixed path.
- Prefer **side-by-side panels** (`grid-columns: 2`, two `class: panel` containers) for "broken vs fixed" and "what you picture vs what happens", as in his Subagents / Agent Teams reference. Sequence flows use `shape: sequence_diagram`.
- At most ~7 boxes, labels of a few words, real values (IPs, ports, ms), never foo/bar. Caption states the conclusion.
- **Architecture diagrams** use numbered component cards: `class: [main; card]` plus `icon: lucide:<name>` (any Lucide icon, recoloured per theme) and a `b: "..." {class: body}` child with two short lines of responsibilities and real numbers. Group cards in `class: panel` rows (`grid-columns: N`) stacked with a root `grid-columns: 1`; put state stores in their own row; reorder cells (or add an invisible spacer) so edges don't cross cards. The legend lives in the card, not in prose.
- After editing a theme file, clear the content cache (`rm -rf .astro node_modules/.astro dist`) so every diagram re-renders, then delete `d2-*.svg` files no page references.
- Older posts still use ```plantuml (`remark-plantuml.mjs`); convert them to D2 when you touch them.

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
- Home (`src/pages/index.astro`): terminal-prompt hero ("Samadeep's blog"), three site principles, live stats (posts, runnable commands, diagrams, last update) and a "Start here" pair chosen from posts with `vm` front matter. Keep principles factual about the site, never claims in his voice.

## Workflow

1. Branch from `origin/main`. `npm run build` and `npx astro check` (0 errors) before pushing.
2. Screenshot light, dark and 390px phone with Playwright (`executablePath: '/opt/pw-browsers/chromium'`) and look at them.
3. PR via `gh api repos/samadeep/samadeep.github.io/pulls`; list unverified claims and any first-person lines.
4. After merge, check the live page (the agent workspace can't reach the site; use the browser pane).
- Gotchas: never `pkill -f` (kills the agent shell); a process whose command line contains `node server.mjs` gets killed by the streaming lab's `stop_server`; Actions logs aren't downloadable from the workspace, so CI steps surface output as annotations (`vm/ci-run.sh`).

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
