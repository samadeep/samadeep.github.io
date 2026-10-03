// ```plantuml fences -> self-hosted SVGs, rendered at build.
// Output is cached in public/diagrams/<hash>.svg and committed,
// so CI only needs Java + Graphviz when a diagram is new or edited.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { visit } from 'unist-util-visit';

const OUT = join(process.cwd(), 'public', 'diagrams');
const JAR_DIR = join(process.cwd(), 'node_modules', 'plantuml-cli', 'build');

// Appended just before @enduml so these win over a diagram's own skinparams.
// One render per diagram: authored fills (pastels, tints) only read correctly on a
// light ground, so dark mode shows the same SVG on a light panel instead of recolouring.
const THEME = `skinparam backgroundColor transparent
skinparam defaultFontName SansSerif
skinparam defaultFontColor #1A1F24`;
const VERSION = 'v3'; // bump to force re-render of every diagram

function jar() {
  const f = existsSync(JAR_DIR) && readdirSync(JAR_DIR).find((n) => n.endsWith('.jar'));
  if (!f) throw new Error('plantuml jar missing: npm i -D plantuml-cli');
  return join(JAR_DIR, f);
}

function themed(src) {
  const body = src
    .replace(/^\s*skinparam\s+backgroundColor\b.*$/gim, '')
    .replace(/^\s*skinparam\s+fontcolor\b.*$/gim, '');
  const withEnd = /@enduml/i.test(body) ? body : `@startuml\n${body}\n@enduml`;
  return withEnd.replace(/@enduml/i, `${THEME}\n@enduml`);
}

function render(src, file) {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const svg = execFileSync('java', ['-Djava.awt.headless=true', '-jar', jar(), '-tsvg', '-pipe', '-charset', 'UTF-8'], {
    input: themed(src),
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'],
  }).toString('utf8');
  if (!svg.includes('<svg')) throw new Error(`plantuml produced no svg for ${file}`);
  // !theme plain pins Verdana; give browsers without it a sans fallback, not Times
  const out = svg.replace(/font-family="Verdana"/g, `font-family="Verdana, 'DejaVu Sans', 'Segoe UI', sans-serif"`);
  writeFileSync(file, out);
  return out;
}

function size(svg) {
  const w = svg.match(/<svg[^>]*\swidth="(\d+(?:\.\d+)?)px"/);
  const h = svg.match(/<svg[^>]*\sheight="(\d+(?:\.\d+)?)px"/);
  return w && h ? { w: Math.round(+w[1]), h: Math.round(+h[1]) } : { w: 800, h: 500 };
}

export const diagramHash = (src) => createHash('sha1').update(VERSION + src).digest('hex').slice(0, 12);

/** Site path of the first ```plantuml diagram in a markdown body, if any. */
export function firstDiagram(body = '') {
  const m = body.match(/^```plantuml[^\n]*\n([\s\S]*?)\n```/m);
  return m ? `/diagrams/${diagramHash(m[1])}.svg` : undefined;
}

export function remarkPlantuml() {
  return (tree) => {
    mkdirSync(OUT, { recursive: true });
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'plantuml' || !parent) return;
      const hash = diagramHash(node.value);
      const svg = render(node.value, join(OUT, `${hash}.svg`));
      const { w, h } = size(svg);
      const alt = (node.meta && node.meta.replace(/^title=/, '').replace(/^"|"$/g, '')) ||
        (node.value.match(/^\s*title\s+(.+)$/im)?.[1] ?? 'Diagram');
      const img = `<img src="/diagrams/${hash}.svg" width="${w}" height="${h}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy" decoding="async">`;
      parent.children[index] = {
        type: 'html',
        value: `<figure class="diagram"><a href="/diagrams/${hash}.svg" target="_blank" rel="noopener" aria-label="Open diagram full size">${img}</a></figure>`,
      };
    });
  };
}
