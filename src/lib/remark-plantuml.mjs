// ```plantuml fences -> self-hosted SVGs, one per theme, rendered at build.
// Output is cached in public/diagrams/<hash>-{light,dark}.svg and committed,
// so CI only needs Java + Graphviz when a diagram is new or edited.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { visit } from 'unist-util-visit';

const OUT = join(process.cwd(), 'public', 'diagrams');
const JAR_DIR = join(process.cwd(), 'node_modules', 'plantuml-cli', 'build');

// Appended just before @enduml so these win over a diagram's own skinparams.
const THEMES = {
  light: `skinparam backgroundColor transparent
skinparam defaultFontName "Schibsted Grotesk"
skinparam defaultFontColor #1A1F24
skinparam ArrowColor #4A535C
skinparam ArrowFontColor #4A535C`,
  dark: `skinparam backgroundColor transparent
skinparam defaultFontName "Schibsted Grotesk"
skinparam defaultFontColor #E4E7EA
skinparam ArrowColor #A3ACB5
skinparam ArrowFontColor #A3ACB5
skinparam ActorBorderColor #A3ACB5
skinparam SequenceLifeLineBorderColor #6B7580
skinparam NoteBackgroundColor #262C33
skinparam NoteBorderColor #4A535C
skinparam NoteFontColor #E4E7EA`,
};

function jar() {
  const f = existsSync(JAR_DIR) && readdirSync(JAR_DIR).find((n) => n.endsWith('.jar'));
  if (!f) throw new Error('plantuml jar missing: npm i -D plantuml-cli');
  return join(JAR_DIR, f);
}

function themed(src, theme) {
  const body = src
    .replace(/^\s*skinparam\s+backgroundColor\b.*$/gim, '')
    .replace(/^\s*skinparam\s+fontcolor\b.*$/gim, '');
  const withEnd = /@enduml/i.test(body) ? body : `@startuml\n${body}\n@enduml`;
  return withEnd.replace(/@enduml/i, `${THEMES[theme]}\n@enduml`);
}

function render(src, theme, file) {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const svg = execFileSync('java', ['-Djava.awt.headless=true', '-jar', jar(), '-tsvg', '-pipe', '-charset', 'UTF-8'], {
    input: themed(src, theme),
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'],
  }).toString('utf8');
  if (!svg.includes('<svg')) throw new Error(`plantuml produced no svg for ${file}`);
  writeFileSync(file, svg);
  return svg;
}

function size(svg) {
  const w = svg.match(/<svg[^>]*\swidth="(\d+(?:\.\d+)?)px"/);
  const h = svg.match(/<svg[^>]*\sheight="(\d+(?:\.\d+)?)px"/);
  return w && h ? { w: Math.round(+w[1]), h: Math.round(+h[1]) } : { w: 800, h: 500 };
}

export function remarkPlantuml() {
  return (tree) => {
    mkdirSync(OUT, { recursive: true });
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'plantuml' || !parent) return;
      const hash = createHash('sha1').update(node.value).digest('hex').slice(0, 12);
      const svgs = {};
      for (const t of ['light', 'dark']) svgs[t] = render(node.value, t, join(OUT, `${hash}-${t}.svg`));
      const { w, h } = size(svgs.light);
      const alt = (node.meta && node.meta.replace(/^title=/, '').replace(/^"|"$/g, '')) ||
        (node.value.match(/^\s*title\s+(.+)$/im)?.[1] ?? 'Diagram');
      const img = (t) =>
        `<img class="diagram-${t}" src="/diagrams/${hash}-${t}.svg" width="${w}" height="${h}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy" decoding="async">`;
      parent.children[index] = {
        type: 'html',
        value: `<figure class="diagram"><a href="/diagrams/${hash}-light.svg" target="_blank" rel="noopener" aria-label="Open diagram full size">${img('light')}${img('dark')}</a></figure>`,
      };
    });
  };
}
