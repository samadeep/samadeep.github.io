// ```plantuml fences -> SVG rendered at build, inlined into the page.
//
// - Measured and drawn with JetBrains Mono (TTFs in scripts/fonts), the page's own face,
//   so box widths match the text the reader sees.
// - Drawn in a small fixed palette (DG below). global.css maps those exact colours to
//   CSS variables, so diagrams follow the light/dark theme. Diagrams that bring their own
//   colours get class "dg-fixed" and stay on a light panel.
// - Semantic boxes: rectangle "..." <<allow>> / <<deny>> / <<ask>>.
// Raw SVGs are cached in public/diagrams/<hash>.svg and committed, so CI only needs
// Java + Graphviz when a diagram is new or edited.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { visit } from 'unist-util-visit';

const OUT = join(process.cwd(), 'public', 'diagrams');
const JAR_DIR = join(process.cwd(), 'node_modules', 'plantuml-cli', 'build');
const FONTS = join(process.cwd(), 'scripts', 'fonts');
const VERSION = 'v7'; // bump to force re-render of every diagram

// The palette. global.css keys off these exact hex values; change both together.
export const DG = {
  box: '#FBFAF6', line: '#6B6F6A', ink: '#1A2221', group: '#F1EEE3', note: '#E3F1EF', accent: '#00636C',
  allowBg: '#E5F2EA', allow: '#2F7D52', denyBg: '#FBE9E7', deny: '#C2412D', askBg: '#E8F0FB', ask: '#2F6DB5',
  // role fills (reference style: colour = role, line style = lifetime)
  main: '#F3C9C4', worker: '#EFD991', shared: '#CFDDF6', peer: '#D3C6F3', edge: '#1A2221',
};

// Appended just before @enduml, so these win over a diagram's own skinparams.
const THEME = `skinparam backgroundColor transparent
skinparam shadowing false
skinparam roundCorner 12
skinparam defaultFontName "JetBrains Mono"
skinparam defaultFontSize 13
skinparam defaultFontColor ${DG.ink}
skinparam ArrowColor ${DG.line}
skinparam ArrowThickness 1.1
skinparam ArrowFontColor ${DG.ink}
skinparam ArrowFontSize 12
skinparam ArrowFontName "JetBrains Mono"
skinparam rectangle {
  BackgroundColor ${DG.box}
  BorderColor ${DG.line}
  BorderThickness 1.1
}
skinparam node {
  BackgroundColor ${DG.box}
  BorderColor ${DG.line}
  BorderThickness 1.1
}
skinparam package {
  BackgroundColor ${DG.group}
  BorderColor ${DG.line}
  BorderThickness 1.1
  FontColor ${DG.ink}
  FontStyle normal
}
skinparam note {
  BackgroundColor ${DG.note}
  BorderColor ${DG.accent}
  FontColor ${DG.ink}
}
skinparam rectangle<<allow>> {
  BackgroundColor ${DG.allowBg}
  BorderColor ${DG.allow}
  FontColor ${DG.allow}
}
skinparam rectangle<<deny>> {
  BackgroundColor ${DG.denyBg}
  BorderColor ${DG.deny}
  FontColor ${DG.deny}
}
skinparam rectangle<<ask>> {
  BackgroundColor ${DG.askBg}
  BorderColor ${DG.ask}
  FontColor ${DG.ask}
}
skinparam sequence {
  ParticipantBackgroundColor ${DG.box}
  ParticipantBorderColor ${DG.line}
  LifeLineBorderColor ${DG.line}
  ArrowColor ${DG.line}
}
skinparam rectangle<<main>> {
  BackgroundColor ${DG.main}
  BorderColor ${DG.edge}
  BorderThickness 2
}
skinparam rectangle<<worker>> {
  BackgroundColor ${DG.worker}
  BorderColor ${DG.edge}
  BorderThickness 2
}
skinparam rectangle<<peer>> {
  BackgroundColor ${DG.peer}
  BorderColor ${DG.edge}
  BorderThickness 2
}
skinparam rectangle<<shared>> {
  BackgroundColor ${DG.shared}
  BorderColor ${DG.edge}
  BorderThickness 2
  BorderStyle dashed
}
skinparam rectangle<<result>> {
  BackgroundColor ${DG.box}
  BorderColor ${DG.edge}
  BorderThickness 2
  BorderStyle dotted
  RoundCorner 60
}
hide stereotype`;

const PALETTE = new Set([...Object.values(DG), '#FFFFFF', '#000000'].map((c) => c.toUpperCase()));

let fontsReady = false;
/** Make JetBrains Mono visible to Java's font lookup (fontconfig on Linux, user fonts on macOS). */
function ensureFonts() {
  if (fontsReady) return;
  fontsReady = true;
  const dir = platform() === 'darwin' ? join(homedir(), 'Library', 'Fonts') : join(homedir(), '.local', 'share', 'fonts');
  mkdirSync(dir, { recursive: true });
  let copied = false;
  for (const f of readdirSync(FONTS).filter((n) => n.endsWith('.ttf'))) {
    if (!existsSync(join(dir, f))) { copyFileSync(join(FONTS, f), join(dir, f)); copied = true; }
  }
  if (copied && platform() !== 'darwin') { try { execFileSync('fc-cache', ['-f', dir], { stdio: 'ignore' }); } catch {} }
}

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
  ensureFonts();
  const svg = execFileSync('java', ['-Djava.awt.headless=true', '-jar', jar(), '-tsvg', '-pipe', '-charset', 'UTF-8'], {
    input: themed(src),
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'],
  }).toString('utf8');
  if (!svg.includes('<svg')) throw new Error(`plantuml produced no svg for ${file}`);
  writeFileSync(file, svg);
  return svg;
}

// PlantUML defaults that ignore the skinparams above, mapped onto the palette.
const DEFAULTS = { '#181818': DG.line, '#E2E2F0': DG.box, '#FEFFDD': DG.note, '#000': DG.ink, '#000000': DG.ink };
function normalize(svg) {
  return svg.replace(/(fill|stroke)(="|:)(#[0-9a-fA-F]{3,6})\b/g, (m, k, sep, c) => {
    const to = DEFAULTS[c.toUpperCase()];
    return to ? `${k}${sep}${to}` : m;
  });
}

/** Inline-ready markup: no XML prolog, ids namespaced per diagram, scales to its container. */
function inline(svg, hash, alt) {
  let s = svg.replace(/^<\?xml[^>]*>\s*/, '').replace(/<!--[\s\S]*?-->/g, '');
  // PlantUML writes strokes in style=""; lift them into attributes so the theme CSS can override them
  s = s.replace(/\sstyle="([^"]*)"/g, (m, css) => {
    const attrs = css.split(';').filter(Boolean).map((d) => d.split(':').map((x) => x.trim()))
      .filter(([k]) => /^(stroke|stroke-width|stroke-dasharray|fill)$/.test(k));
    const rest = css.split(';').filter((d) => d && !/^\s*(stroke|stroke-width|stroke-dasharray|fill)\s*:/.test(d)).join(';');
    return attrs.map(([k, v]) => ` ${k}="${v}"`).join('') + (rest ? ` style="${rest}"` : '');
  });
  s = normalize(s);
  s = s.replace(/\bid="([^"]+)"/g, `id="d${hash}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#d${hash}-$1)`)
    .replace(/(xlink:href|href)="#([^"]+)"/g, `$1="#d${hash}-$2"`);
  s = s.replace(/<svg\b([^>]*)>/, (m, attrs) => {
    const clean = attrs.replace(/\sstyle="[^"]*"/, '').replace(/\s(width|height)="[^"]*"/g, '');
    const w = attrs.match(/\swidth="(\d+(?:\.\d+)?)px"/)?.[1];
    const h = attrs.match(/\sheight="(\d+(?:\.\d+)?)px"/)?.[1];
    return `<svg${clean} role="img" aria-label="${alt.replace(/"/g, '&quot;')}"${w ? ` width="${Math.round(+w)}" height="${Math.round(+h)}"` : ''}>`;
  });
  return s;
}

/** True when every colour in the SVG is from the palette, so it can follow the theme. */
function themable(svg) {
  const cols = (normalize(svg).match(/(?:fill|stroke)(?:="|:)(#[0-9a-fA-F]{6})/g) ?? []);
  return cols.every((c) => PALETTE.has(c.slice(-7).toUpperCase()));
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
      const alt = (node.meta && node.meta.replace(/^title=/, '').replace(/^"|"$/g, '')) ||
        (node.value.match(/^\s*title\s+(.+)$/im)?.[1] ?? 'Diagram');
      const cls = themable(svg) ? 'diagram' : 'diagram dg-fixed';
      if (svg.includes('fill="#FFC"')) console.warn(`[plantuml] ${hash}: PlantUML printed a warning banner in this diagram`);
      parent.children[index] = {
        type: 'html',
        value: `<figure class="${cls}">${inline(svg, hash, alt)}<figcaption><a href="/diagrams/${hash}.svg" target="_blank" rel="noopener">${alt === 'Diagram' ? 'Open full size' : alt.replace(/</g, '&lt;')}</a></figcaption></figure>`,
      };
    });
  };
}
