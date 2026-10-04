// Builds dist/pagefind after `astro build`.
// Posts are indexed from the built HTML (each heading becomes its own hit).
// Each reading-list entry is added as its own record, so saved links show up in search
// even though they all live on one page.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import * as pagefind from 'pagefind';

const { index } = await pagefind.createIndex({});
const { errors, page_count } = await index.addDirectory({ path: 'dist' });
if (errors.length) throw new Error(errors.join('\n'));

const items = parse(readFileSync('src/data/reading.yml', 'utf8')) ?? [];
for (const r of items) {
  const title = r.title || r.url;
  const res = await index.addCustomRecord({
    url: r.url,
    content: [title, r.author, r.note, r.subtitle, (r.tags ?? []).join(' ')].filter(Boolean).join('. '),
    language: 'en',
    meta: { title, kind: 'Reading', ...(r.author ? { by: r.author } : {}) },
    filters: { kind: ['Reading'] },
  });
  if (res.errors.length) throw new Error(res.errors.join('\n'));
}

await index.writeFiles({ outputPath: 'dist/pagefind' });
console.log(`[search] ${page_count} pages + ${items.length} reading entries indexed`);
