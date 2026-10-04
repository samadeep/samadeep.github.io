// ```d2 fences -> two SVGs (light + dark) rendered at build with D2 (WASM, no Java).
//
// - Style lives in src/lib/d2/{light,dark}.d2: role classes (main, worker, peer, shared, result,
//   allow, deny, ask, panel) so a diagram says *what* a box is and the theme says how it looks.
// - Both renders are cached in public/diagrams/d2-<hash>-<theme>.svg and committed.
// - The page shows the one matching the site's theme toggle (CSS on [data-theme]); the hidden
//   one is lazy, so a reader downloads one set.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { visit } from 'unist-util-visit';

const OUT = join(process.cwd(), 'public', 'diagrams');
const THEME_DIR = join(process.cwd(), 'src', 'lib', 'd2');
const VERSION = 'd2-v1'; // bump to re-render every D2 diagram
const THEMES = ['light', 'dark'];
const prelude = (t) => readFileSync(join(THEME_DIR, `${t}.d2`), 'utf8');

export const d2Hash = (src, theme) => createHash('sha1').update(VERSION + prelude(theme) + src).digest('hex').slice(0, 12);

let d2;
async function engine() {
  d2 ??= import('@terrastruct/d2').then(async ({ D2 }) => { const e = new D2(); await e.ready; return e; });
  return d2;
}

// D2.js answers one request at a time (a single pending promise), and Astro renders posts
// concurrently, so every render goes through this queue.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

function render(src, theme, file) { return serial(() => renderNow(src, theme, file)); }

async function renderNow(src, theme, file) {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const e = await engine();
  const code = `${prelude(theme)}\n${src}`;
  e.worker?.ref?.();   // hold the process open only while D2 is working
  let svg;
  try {
    const r = await e.compile(code, { layout: 'dagre', pad: 16 });
    svg = await e.render(r.diagram, { ...r.renderOptions, pad: 16, sketch: false });
  } finally {
    e.worker?.unref?.(); // so a finished build can exit
  }
  if (!svg.includes('<svg')) throw new Error(`d2 produced no svg for ${file}`);
  writeFileSync(file, svg);
  return svg;
}

const size = (svg) => {
  const vb = svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
  return vb ? [Math.round(+vb[1]), Math.round(+vb[2])] : [800, 400];
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Site path of the first ```d2 diagram (light render), for post covers. */
export function firstD2(body = '') {
  const m = body.match(/^```d2[^\n]*\n([\s\S]*?)\n```/m);
  return m ? `/diagrams/d2-${d2Hash(m[1], 'light')}-light.svg` : undefined;
}

export function remarkD2() {
  return async (tree) => {
    const jobs = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'd2' || !parent) return;
      jobs.push({ node, index, parent });
    });
    if (!jobs.length) return;
    mkdirSync(OUT, { recursive: true });
    for (const { node, index, parent } of jobs) {
      const alt = (node.meta ?? '').replace(/^title=/, '').replace(/^"|"$/g, '') || 'Diagram';
      const imgs = [];
      for (const t of THEMES) {
        const name = `d2-${d2Hash(node.value, t)}-${t}.svg`;
        const svg = await render(node.value, t, join(OUT, name));
        const [w, h] = size(svg);
        imgs.push(`<img class="d2-${t}" src="/diagrams/${name}" width="${w}" height="${h}" style="max-width:min(100%,${w}px)" alt="${esc(alt)}" loading="lazy" decoding="async">`);
      }
      parent.children[index] = {
        type: 'html',
        value: `<figure class="diagram d2">${imgs.join('')}<figcaption>${esc(alt)}</figcaption></figure>`,
      };
    }
  };
}
