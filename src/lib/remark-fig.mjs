// ```fig fences -> one inline SVG, laid out on an explicit grid (no auto-layout).
//
// The look copies the Claude Code docs "Subagents vs Agent Teams" figure: titled grey panels,
// rows of equal-width pastel boxes, full-width bars, short straight arrows with small labels,
// grey loop-back lines, Nunito. Colours are CSS variables (global.css, .fig), so the same SVG
// follows the site's light/dark toggle. Grammar: see CLAUDE.md ("Diagrams").
//
//   panel Subagents            new panel (titled); panels sit side by side, or stacked with `layout stack`
//   row                        new row in the current panel
//   m: main "Main Agent" span 3            node: id, class, label, options (span N, icon NAME, body "...")
//   _                          empty cell
//   m -> s1 "Spawn Subagent"   edge (also <->); options: lost good muted dashed, via left|right
//   r1 r2 r3 -> m "Report" muted via left  several sources merge into one loop-back line
//
//   seq                        first line: sequence diagram instead
//   c: peer "Client"           actors, left to right
//   c -> n "GET /sse" lost     messages, top to bottom (a -> a is a note on a's lifeline)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { visit } from 'unist-util-visit';

const require = createRequire(import.meta.url);
const fontkit = require('fontkit');
const FONT = fontkit.openSync(join(process.cwd(), 'node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2'));
const OUT = join(process.cwd(), 'public', 'diagrams');
const LUCIDE = join(process.cwd(), 'node_modules', 'lucide-static', 'icons');

// sizes (SVG units; figures render at most at their natural width)
const F = { label: 15, edge: 11.5, title: 26, body: 12.5, cardTitle: 15 };
const LINE = { label: 19, edge: 14, body: 17 };
const PAD = 26, GX = 34, GY = 34, TITLE_H = 44, BOX_PX = 22, BOX_PY = 11, PANEL_GAP = 24;
const KINDS = ['main', 'worker', 'peer', 'shared', 'result', 'allow', 'deny', 'ask', 'box'];

// the font's default instance is its thinnest weight; labels render at 500-600
const textW = (s, size) => (FONT.layout(String(s)).advanceWidth / FONT.unitsPerEm) * size * 1.1;
const linesOf = (s) => String(s).split('\\n');
const maxW = (lines, size) => Math.max(0, ...lines.map((l) => textW(l, size)));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

// ---------- parsing ----------
function tokens(line) {
  const out = []; const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g; let m;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? { q: m[1].replace(/\\"/g, '"') } : m[2]);
  return out;
}

function parse(src) {
  const lines = src.split('\n').map((l) => l.replace(/\s+#.*$/, '').trim()).filter((l) => l && !l.startsWith('#'));
  const fig = { seq: false, stack: false, panels: [], nodes: new Map(), edges: [] };
  let panel = null, row = null;
  const ensurePanel = () => { if (!panel) { panel = { title: '', rows: [] }; fig.panels.push(panel); } };
  const ensureRow = () => { ensurePanel(); if (!row) { row = []; panel.rows.push(row); } };
  for (const line of lines) {
    const t = tokens(line);
    if (t[0] === 'seq') { fig.seq = true; continue; }
    if (t[0] === 'layout') { fig.stack = t[1] === 'stack'; continue; }
    if (t[0] === 'panel') { panel = { title: line.slice(5).trim().replace(/^"|"$/g, ''), rows: [] }; fig.panels.push(panel); row = null; continue; }
    if (t[0] === 'row') { ensurePanel(); row = []; panel.rows.push(row); continue; }
    if (t[0] === '_') { ensureRow(); row.push({ empty: true, span: +(t[1] ?? 1) }); continue; }
    const arrow = t.findIndex((x) => x === '->' || x === '<->');
    if (arrow > 0) {
      const e = { from: t.slice(0, arrow), to: t[arrow + 1], both: t[arrow] === '<->', label: '', style: 'plain', via: null };
      for (let i = arrow + 2; i < t.length; i++) {
        const x = t[i];
        if (typeof x === 'object') e.label = x.q;
        else if (['lost', 'good', 'muted', 'dashed'].includes(x)) e.style = x;
        else if (x === 'via') e.via = t[++i];
        else throw new Error(`fig: unknown edge option "${x}" in: ${line}`);
      }
      fig.edges.push(e); continue;
    }
    const m = line.match(/^([\w-]+):\s*(\w+)\s*(.*)$/);
    if (!m) throw new Error(`fig: can't read line: ${line}`);
    const [, id, kind, rest] = m;
    if (!KINDS.includes(kind)) throw new Error(`fig: unknown class "${kind}" (use ${KINDS.join(', ')})`);
    const node = { id, kind, label: '', span: 1, icon: null, body: null };
    const rt = tokens(rest);
    for (let i = 0; i < rt.length; i++) {
      const x = rt[i];
      if (typeof x === 'object' && !node.label) node.label = x.q;
      else if (x === 'span') node.span = +rt[++i];
      else if (x === 'icon') node.icon = rt[++i];
      else if (x === 'body') node.body = rt[++i].q;
      else throw new Error(`fig: unknown node option "${typeof x === 'object' ? x.q : x}" in: ${line}`);
    }
    if (fig.nodes.has(id)) throw new Error(`fig: duplicate id "${id}"`);
    fig.nodes.set(id, node);
    if (fig.seq) continue;
    ensureRow(); row.push(node); node.panel = panel;
  }
  for (const e of fig.edges) for (const id of [...e.from, e.to]) if (!fig.nodes.has(id)) throw new Error(`fig: edge uses unknown id "${id}"`);
  return fig;
}

// ---------- drawing helpers ----------
const ARROW = 7;
function arrowHead(x, y, dir, cls) {
  const [dx, dy] = { down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0] }[dir];
  const bx = x - dx * ARROW * 1.15, by = y - dy * ARROW * 1.15, px = -dy * ARROW * 0.62, py = dx * ARROW * 0.62;
  return `<path class="fa ${tone(cls)}" d="M${r1(x)} ${r1(y)}L${r1(bx + px)} ${r1(by + py)}L${r1(bx - px)} ${r1(by - py)}Z"/>`;
}
function text(x, y, lines, cls, size, lh, anchor = 'middle') {
  const top = y - ((lines.length - 1) * lh) / 2;
  return `<text class="${cls}" x="${r1(x)}" y="${r1(top)}" text-anchor="${anchor}" dominant-baseline="central" font-size="${size}">${lines
    .map((l, i) => `<tspan x="${r1(x)}" y="${r1(top + i * lh)}">${esc(l)}</tspan>`).join('')}</text>`;
}
// edge label sitting on the line, with a panel-coloured plate behind it
function edgeLabel(x, y, label, cls, anchor = 'middle') {
  if (!label) return '';
  const ls = linesOf(label), w = maxW(ls, F.edge) + 8, h = ls.length * LINE.edge + 2;
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x - 4 : x - w + 4;
  return `<rect class="fp" x="${r1(left)}" y="${r1(y - h / 2)}" width="${r1(w)}" height="${r1(h)}"/>` + text(x, y, ls, `fl ${tone(cls)}`, F.edge, LINE.edge, anchor);
}
const edgeCls = (s) => (s === 'plain' ? 'fe' : `fe fe-${s}`);
const tone = (cls) => cls.replace(/\bfe\b ?/, '').replace(/fe-/g, 'tone-').trim(); // colour only, for labels and heads

function icon(name, x, y, size) {
  const svg = readFileSync(join(LUCIDE, `${name}.svg`), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg class="fi" x="${r1(x)}" y="${r1(y)}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// ---------- nodes ----------
function measureNode(n) {
  if (n.empty) return;
  if (n.body || n.icon) { // card
    const bl = n.body ? linesOf(n.body) : [];
    n.card = true;
    n.w = Math.max(textW(n.label, F.cardTitle) + (n.icon ? 40 : 0), maxW(bl, F.body)) + 2 * 16;
    n.h = 16 + 22 + (bl.length ? 8 + bl.length * LINE.body : 0) + 14;
    return;
  }
  const ls = linesOf(n.label);
  if (n.kind === 'result') { n.w = n.h = Math.max(64, maxW(ls, F.label) + 26, ls.length * LINE.label + 26); return; }
  n.w = maxW(ls, F.label) + 2 * BOX_PX;
  n.h = ls.length * LINE.label + 2 * BOX_PY;
}

function drawNode(n) {
  const { x, y, w, h } = n;
  if (n.kind === 'result') {
    return `<circle class="fn fn-result" cx="${r1(x + w / 2)}" cy="${r1(y + h / 2)}" r="${r1(w / 2)}"/>` + text(x + w / 2, y + h / 2, linesOf(n.label), 'ft', F.label, LINE.label);
  }
  let s = `<rect class="fn fn-${n.kind}" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="8"/>`;
  if (n.card) {
    s += `<text class="ft ft-card" x="${r1(x + 16)}" y="${r1(y + 16 + 11)}" dominant-baseline="central" font-size="${F.cardTitle}">${esc(n.label)}</text>`;
    if (n.icon) s += icon(n.icon, x + w - 16 - 22, y + 14, 22);
    if (n.body) s += text(x + 16, y + 16 + 22 + 8 + (linesOf(n.body).length * LINE.body) / 2, linesOf(n.body), 'fb', F.body, LINE.body, 'start');
    return s;
  }
  return s + text(x + w / 2, y + h / 2, linesOf(n.label), 'ft', F.label, LINE.label);
}

// ---------- grid figures ----------
function layoutPanel(p, edges) {
  const nodes = p.rows.flat().filter((n) => !n.empty);
  nodes.forEach(measureNode);
  const cols = Math.max(1, ...p.rows.map((r) => r.reduce((a, n) => a + n.span, 0)));
  // one width for every single-cell node in the panel, like the reference
  const single = nodes.filter((n) => n.span === 1);
  let cw = Math.max(110, ...single.map((n) => n.w));
  // a spanning node must fit too
  for (const n of nodes.filter((n) => n.span > 1)) cw = Math.max(cw, (n.w - (n.span - 1) * GX) / n.span);
  // horizontal labelled edges need room between columns
  let gx = GX;
  const inPanel = new Set(nodes.map((n) => n.id));
  for (const e of edges) if (e.label && !e.via && e.from.length === 1 && inPanel.has(e.from[0]) && inPanel.has(e.to) && rowOf(p, e.from[0]) === rowOf(p, e.to))
    gx = Math.max(gx, maxW(linesOf(e.label), F.edge) + 34);
  // row heights and gaps (a gap grows when a labelled edge crosses it)
  const rh = p.rows.map((r) => Math.max(0, ...r.filter((n) => !n.empty).map((n) => n.h)));
  const gaps = p.rows.slice(1).map(() => GY);
  for (const e of edges) {
    if (e.via) continue;
    for (const f of e.from) {
      const a = rowOf(p, f), b = rowOf(p, e.to);
      if (a < 0 || b < 0 || a === b) continue;
      const lo = Math.min(a, b);
      if (e.label) gaps[lo] = Math.max(gaps[lo], linesOf(e.label).length * LINE.edge + 34);
    }
  }
  const hasVia = edges.some((e) => e.via && e.via !== 'above' && e.from.some((f) => inPanel.has(f)));
  const sideRoom = { left: edges.some((e) => e.via === 'left' && e.from.some((f) => inPanel.has(f))) ? 22 : 0, right: edges.some((e) => e.via === 'right' && e.from.some((f) => inPanel.has(f))) ? 22 : 0 };
  p.cw = cw; p.gx = gx; p.cols = cols; p.side = sideRoom;
  p.innerW = cols * cw + (cols - 1) * gx;
  p.w = p.innerW + 2 * PAD + sideRoom.left + sideRoom.right;
  p.left0 = PAD + sideRoom.left;
  if (p.title) { const tw = textW(p.title, F.title) + 48; if (p.w < tw) { p.left0 += (tw - p.w) / 2; p.w = tw; } }
  p.h = 2 * PAD + rh.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0) + (hasVia ? 22 : 0);
  p.rh = rh; p.gaps = gaps;
}
function rowOf(p, id) { return p.rows.findIndex((r) => r.some((n) => n.id === id)); }

function placePanel(p, ox, oy, w) {
  p.x = ox; p.y = oy; if (w) p.w = w;
  const extra = (p.w - (p.innerW + 2 * PAD)) - (p.left0 - PAD) * 2; // centre content in a widened (stacked) panel
  let y = oy + PAD + (p.inner ? 30 : 0);
  p.rows.forEach((r, ri) => {
    let col = 0;
    for (const n of r) {
      if (!n.empty) {
        const cellX = ox + p.left0 + Math.max(0, extra / 2) + col * (p.cw + p.gx);
        const cellW = n.span * p.cw + (n.span - 1) * p.gx;
        n.w = n.kind === 'result' ? n.w : cellW;
        n.x = cellX + (cellW - n.w) / 2;
        n.y = y + (p.rh[ri] - n.h) / 2;
      }
      col += n.span;
    }
    y += p.rh[ri] + (p.gaps[ri] ?? 0);
  });
}

function drawEdge(e, fig) {
  const cls = edgeCls(e.style);
  const to = fig.nodes.get(e.to);
  const froms = e.from.map((id) => fig.nodes.get(id));
  let s = '';
  if (e.via === 'below' || e.via === 'above') {
    // around a row: out of the source's bottom (top), along a bus, into the target's bottom (top)
    const a = froms[0], below = e.via === 'below';
    const rowEdge = below ? Math.max(a.y + a.h, to.y + to.h) : Math.min(a.y, to.y);
    const busY = rowEdge + (below ? 22 : -22);
    const ax = a.x + a.w / 2, bx = to.x + to.w / 2, ty = below ? to.y + to.h : to.y;
    s += `<path class="${cls}" d="M${r1(ax)} ${r1(below ? a.y + a.h : a.y)}V${r1(busY)}H${r1(bx)}V${r1(ty + (below ? 8 : -8))}"/>` + arrowHead(bx, ty, below ? 'up' : 'down', cls);
    s += edgeLabel((ax + bx) / 2, busY, e.label, cls);
    return s;
  }
  if (e.via) {
    // loop-back: down from each source to a bus under the lowest one, out to the side, up/down to the target, then in
    const panel = froms[0].panel;
    const busY = Math.max(...froms.map((n) => n.y + n.h)) + 16;
    const sideX = e.via === 'left' ? panel.x + 14 : panel.x + panel.w - 14;
    const ty = to.y + to.h / 2, tx = e.via === 'left' ? to.x : to.x + to.w;
    for (const n of froms) s += `<path class="${cls}" d="M${r1(n.x + n.w / 2)} ${r1(n.y + n.h)}V${r1(busY)}"/>`;
    const far = e.via === 'left' ? Math.max(...froms.map((n) => n.x + n.w / 2)) : Math.min(...froms.map((n) => n.x + n.w / 2));
    s += `<path class="${cls}" d="M${r1(far)} ${r1(busY)}H${r1(sideX)}V${r1(ty)}H${r1(tx - (e.via === 'left' ? 1 : -1))}"/>`;
    s += arrowHead(tx, ty, e.via === 'left' ? 'right' : 'left', cls);
    if (e.label) s += edgeLabel(sideX + (e.via === 'left' ? 8 : -8), busY, e.label, cls, e.via === 'left' ? 'start' : 'end');
    return s;
  }
  for (const a of froms) {
    const b = to;
    const sameRow = Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) < 1;
    if (sameRow) {
      const y = a.y + a.h / 2, right = b.x > a.x;
      const x1 = right ? a.x + a.w : a.x, x2 = right ? b.x : b.x + b.w;
      s += `<path class="${cls}" d="M${r1(x1 + (e.both ? (right ? 8 : -8) : 0))} ${r1(y)}H${r1(x2 - (right ? 8 : -8))}"/>` + arrowHead(x2, y, right ? 'right' : 'left', cls);
      if (e.both) s += arrowHead(x1, y, right ? 'left' : 'right', cls);
      s += edgeLabel((x1 + x2) / 2, y, e.label, cls);
      continue;
    }
    const down = b.y > a.y;
    const y1 = down ? a.y + a.h : a.y, y2 = down ? b.y : b.y + b.h;
    const ov0 = Math.max(a.x, b.x), ov1 = Math.min(a.x + a.w, b.x + b.w);
    let x;
    const bc = b.x + b.w / 2, ac = a.x + a.w / 2;
    if (bc >= a.x + 8 && bc <= a.x + a.w - 8) x = bc; else if (ac >= b.x + 8 && ac <= b.x + b.w - 8) x = ac; else if (ov1 - ov0 > 16) x = (ov0 + ov1) / 2;
    const sgn = down ? 1 : -1;
    if (x !== undefined) {
      s += `<path class="${cls}" d="M${r1(x)} ${r1(y1 + (e.both ? sgn * 8 : 0))}V${r1(y2 - sgn * 8)}"/>` + arrowHead(x, y2, down ? 'down' : 'up', cls);
      if (e.both) s += arrowHead(x, y1, down ? 'up' : 'down', cls);
      s += edgeLabel(x, (y1 + y2) / 2, e.label, cls);
    } else { // elbow through the middle of the gap
      const my = (y1 + y2) / 2;
      s += `<path class="${cls}" d="M${r1(ac)} ${r1(y1)}V${r1(my)}H${r1(bc)}V${r1(y2 - sgn * 8)}"/>` + arrowHead(bc, y2, down ? 'down' : 'up', cls);
      s += edgeLabel((ac + bc) / 2, my, e.label, cls);
    }
  }
  return s;
}

function renderGrid(fig) {
  fig.panels.forEach((p) => layoutPanel(p, fig.edges));
  if (fig.stack) { // stacked panels share one column grid, so cards line up from panel to panel
    const cw = Math.max(...fig.panels.map((p) => p.cw)), gx = Math.max(...fig.panels.map((p) => p.gx)), cols = Math.max(...fig.panels.map((p) => p.cols));
    const sl = Math.max(...fig.panels.map((p) => p.side.left)), sr = Math.max(...fig.panels.map((p) => p.side.right));
    for (const p of fig.panels) { p.cw = cw; p.gx = gx; p.cols = cols; p.innerW = cols * cw + (cols - 1) * gx; p.left0 = PAD + sl; p.w = p.innerW + 2 * PAD + sl + sr; }
  }
  const titled = fig.panels.some((p) => p.title);
  let W, H, x = 0;
  if (fig.stack) {
    W = Math.max(...fig.panels.map((p) => p.w));
    let y = 0;
    for (const p of fig.panels) { p.inner = !!p.title; if (p.inner) p.h += 30; placePanel(p, 0, y, W); y += p.h + PANEL_GAP; }
    H = y - PANEL_GAP;
  } else {
    const ph = Math.max(...fig.panels.map((p) => p.h));
    const top = titled ? TITLE_H : 0;
    for (const p of fig.panels) { p.h = ph; placePanel(p, x, top, 0); x += p.w + PANEL_GAP; }
    W = x - PANEL_GAP; H = top + ph;
  }
  let s = '';
  for (const p of fig.panels) {
    s += `<rect class="fpanel" x="${r1(p.x + 1)}" y="${r1(p.y + 1)}" width="${r1(p.w - 2)}" height="${r1(p.h - 2)}" rx="16"/>`;
    if (p.inner) s += `<text class="ftitle ftitle-in" x="${r1(p.x + PAD)}" y="${r1(p.y + PAD + 6)}" dominant-baseline="central" font-size="15">${esc(p.title)}</text>`;
    else if (p.title) s += text(p.x + p.w / 2, p.y - TITLE_H / 2 + 2, [p.title], 'ftitle', F.title, 30);
  }
  // edges under nodes, labels over edges
  s += fig.edges.map((e) => drawEdge(e, fig)).join('');
  s += [...fig.nodes.values()].map(drawNode).join('');
  return { W, H, body: s };
}

// ---------- sequence figures ----------
function renderSeq(fig) {
  const actors = [...fig.nodes.values()];
  actors.forEach(measureNode);
  const cw = Math.max(110, ...actors.map((a) => a.w));
  const idx = new Map(actors.map((a, i) => [a.id, i]));
  // column gap: wide enough for the widest label between neighbours
  let gap = 70;
  for (const e of fig.edges) {
    const i = idx.get(e.from[0]), j = idx.get(e.to);
    const w = maxW(linesOf(e.label), F.edge) + 30;
    if (i === j) continue;
    const span = Math.abs(i - j);
    gap = Math.max(gap, (w - (span - 1) * cw - cw) / span + 10);
  }
  const ah = Math.max(...actors.map((a) => a.h));
  actors.forEach((a, i) => { a.w = cw; a.h = ah; a.x = PAD + i * (cw + gap); a.y = PAD; });
  const STEP = 46;
  let y = PAD + ah + 34;
  let msgs = '';
  for (const e of fig.edges) {
    const a = fig.nodes.get(e.from[0]), b = fig.nodes.get(e.to), cls = edgeCls(e.style);
    const ax = a.x + a.w / 2, bx = b.x + b.w / 2;
    if (a === b) {
      const ls = linesOf(e.label), w = maxW(ls, F.edge) + 16;
      msgs += `<rect class="fnote ${tone(cls)}" x="${r1(ax + 10)}" y="${r1(y - 12)}" width="${r1(w)}" height="24" rx="6"/>` + text(ax + 10 + w / 2, y, ls, `fl ${tone(cls)}`, F.edge, LINE.edge);
    } else {
      const right = bx > ax;
      msgs += `<path class="${cls}" d="M${r1(ax)} ${r1(y)}H${r1(bx - (right ? 8 : -8))}"/>` + arrowHead(bx, y, right ? 'right' : 'left', cls);
      if (e.label) msgs += text((ax + bx) / 2, y - 11, linesOf(e.label), `fl ${tone(cls)}`, F.edge, LINE.edge);
    }
    y += STEP;
  }
  const H = y - STEP + 34 + PAD;
  const W = 2 * PAD + actors.length * cw + (actors.length - 1) * gap;
  let s = `<rect class="fpanel" x="1" y="1" width="${r1(W - 2)}" height="${r1(H - 2)}" rx="16"/>`;
  for (const a of actors) s += `<path class="flife" d="M${r1(a.x + a.w / 2)} ${r1(a.y + a.h)}V${r1(H - PAD)}"/>`;
  s += msgs + actors.map(drawNode).join('');
  return { W, H, body: s };
}

// ---------- output ----------
export function renderFig(src, title) {
  const fig = parse(src);
  const { W, H, body } = fig.seq ? renderSeq(fig) : renderGrid(fig);
  const w = Math.ceil(W), h = Math.ceil(H);
  return { w, h, svg: `<svg class="fig-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">${body}</svg>` };
}

// standalone copy for post covers (light colours baked in)
const COVER_CSS = readFileSync(join(process.cwd(), 'src', 'styles', 'fig.css'), 'utf8');
export const figCover = (src) => `/diagrams/fig-${createHash('sha1').update(src).digest('hex').slice(0, 12)}.svg`;
export function firstFig(body = '') {
  const m = body.match(/^```fig[^\n]*\n([\s\S]*?)\n```/m);
  return m ? figCover(m[1]) : undefined;
}

export function remarkFig() {
  return (tree) => {
    let first = true; // only a post's first figure becomes its cover file
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'fig' || !parent) return;
      const title = (node.meta ?? '').replace(/^title=/, '').replace(/^"|"$/g, '') || 'Diagram';
      const { w, svg } = renderFig(node.value, title);
      mkdirSync(OUT, { recursive: true });
      if (first) writeFileSync(join(process.cwd(), 'public', figCover(node.value)), svg.replace('<svg ', `<svg style="font-family:Nunito,sans-serif" `).replace(/(<svg[^>]*>)/, `$1<style>${COVER_CSS}</style>`));
      first = false;
      parent.children[index] = {
        type: 'html',
        value: `<figure class="diagram fig"><div class="fig-scroll" style="max-width:${w}px;--fig-min:${Math.min(w, 620)}px">${svg}</div><figcaption>${esc(title)}</figcaption></figure>`,
      };
    });
  };
}
