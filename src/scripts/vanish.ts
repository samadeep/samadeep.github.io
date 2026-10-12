// <div data-lab="vanish"></div> -> how much of an error signal survives the trip back to an early token.
//
// Model (the bounds from the chapter, not a trained network): backprop through a recurrence multiplies the
// signal by one factor eta per step, so after k steps it is eta^k. For a plain RNN eta <= ||W|| * gamma,
// with gamma = 1 for tanh and 1/4 for the sigmoid (Pascanu et al. 2013). Along an LSTM's cell line the factor
// is the forget gate f. Attention reaches any earlier token in one hop, so the trip has length 1.
const svgNS = 'http://www.w3.org/2000/svg';
const s = (tag: string, attrs: Record<string, string | number> = {}, parent?: Element) => {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e as SVGElement;
};
const h = (tag: string, attrs: Record<string, string> = {}, text = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

const TEAL = '#00aebb', RED = '#ff6b6b', AMBER = '#efd991', INK = '#e8e4d3', DIM = '#8e8c80', RULE = '#1d3331';
const VW = 640, VH = 156, CELLS = 16, X0 = 30, X1 = 610, CY = 92, CW = 30;
const xOf = (i: number) => X0 + (i * (X1 - X0)) / (CELLS - 1);   // i = 0 is the earliest token, CELLS-1 the loss
const DIST = [1, 5, 10, 20, 50, 100, 200];
const NORM = [0.5, 0.9, 1.0, 1.1, 2, 4];
const GATE = [0.5, 0.9, 0.97, 0.99, 1.0];

type Arch = 'tanh' | 'sigmoid' | 'lstm' | 'attn';
const fmt = (x: number) => (x === 0 ? '0' : x >= 1e4 || x < 1e-3 ? x.toExponential(1).replace('e', ' × 10^').replace('+', '') : +x.toPrecision(3) + '');

export function vanishLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-vg');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'gradient.sim'), h('span', { class: 'lab-tag' }, 'runs in your browser'));

  const st = { arch: 'tanh' as Arch, d: 4, w: 1, f: 2 };
  const eta = () => (st.arch === 'tanh' ? NORM[st.w] : st.arch === 'sigmoid' ? NORM[st.w] / 4 : st.arch === 'lstm' ? GATE[st.f] : 1);
  const hops = (k: number) => (st.arch === 'attn' ? 1 : k);
  const signal = (k: number) => Math.pow(eta(), hops(k));

  const modes = h('div', { class: 'lab-seg', role: 'radiogroup', 'aria-label': 'Architecture' });
  modes.append(h('span', { class: 'lab-seg-l' }, 'model'));
  for (const [v, label] of [['tanh', 'RNN, tanh'], ['sigmoid', 'RNN, sigmoid'], ['lstm', 'LSTM cell'], ['attn', 'Attention']] as const) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(st.arch === v) }, label);
    b.onclick = () => { modes.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); st.arch = v; sync(); };
    modes.append(b);
  }
  const knob = (name: string, get: () => string, step: (d: number) => void) => {
    const g = h('div', { class: 'lab-seg' });
    const v = h('span', { class: 'vg-val', 'aria-live': 'polite' }, get());
    const minus = h('button', { type: 'button', 'aria-label': `${name} down` }, '−');
    const plus = h('button', { type: 'button', 'aria-label': `${name} up` }, '+');
    minus.onclick = () => { step(-1); sync(); };
    plus.onclick = () => { step(1); sync(); };
    g.append(h('span', { class: 'lab-seg-l' }, name), minus, v, plus);
    return { g, v, get };
  };
  const clampI = (x: number, n: number) => Math.max(0, Math.min(n - 1, x));
  const distK = knob('distance', () => `${DIST[st.d]} tokens back`, (d) => (st.d = clampI(st.d + d, DIST.length)));
  const parK = knob('weights', () => '', (d) => { if (st.arch === 'lstm') st.f = clampI(st.f + d, GATE.length); else st.w = clampI(st.w + d, NORM.length); });

  const svg = s('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'vg-svg', role: 'img', 'aria-label': 'A row of tokens; the error signal travels from the loss on the right back to the earliest token on the left and fades with every step' });
  s('text', { x: X1, y: 26, fill: DIM, 'font-size': 20, 'text-anchor': 'end' }, svg).textContent = 'loss at token t';
  const leftLabel = s('text', { x: X0 - 12, y: 26, fill: DIM, 'font-size': 20 }, svg);
  const arc = s('path', { fill: 'none', stroke: TEAL, 'stroke-width': 2.5, 'stroke-dasharray': '5 5' }, svg);
  const links = [...Array(CELLS - 1)].map((_, i) => s('line', { x1: xOf(i) + CW / 2, y1: CY, x2: xOf(i + 1) - CW / 2, y2: CY, stroke: RULE, 'stroke-width': 2 }, svg));
  const cells = [...Array(CELLS)].map((_, i) => s('rect', { x: xOf(i) - CW / 2, y: CY - CW / 2, width: CW, height: CW, rx: 6, fill: TEAL, stroke: DIM, 'stroke-width': 1 }, svg));
  const pulse = s('circle', { r: 6, fill: INK, opacity: 0 }, svg);
  s('text', { x: xOf(CELLS - 1), y: CY + 42, fill: DIM, 'font-size': 18, 'text-anchor': 'middle' }, svg).textContent = 't';
  const firstLbl = s('text', { x: xOf(0) - 4, y: CY + 42, fill: DIM, 'font-size': 18 }, svg);

  const meterRow = h('div', { class: 'vg-meter' });
  const track = h('span', { class: 'vg-track' }), fill = h('span', { class: 'vg-fill' });
  const meterLabel = h('span', {});
  track.append(fill); meterRow.append(track, meterLabel);
  const stats = h('pre', { class: 'lab-term lab-stats', 'aria-live': 'polite' });
  root.append(bar, modes, distK.g, parK.g, svg, meterRow, stats);

  // the distance (in tokens) a cell stands for: cell 0 is the earliest token, k back
  const distOf = (i: number) => Math.round((DIST[st.d] * (CELLS - 1 - i)) / (CELLS - 1));
  // brightness on a log scale: 1 is full, 1e-6 is nearly gone; above 1 the cell turns red (exploding)
  const look = (x: number) => (x > 1.0001 ? { c: RED, o: Math.min(1, 0.35 + Math.log10(x) / 3) } : { c: TEAL, o: Math.max(0.05, 1 + Math.log10(Math.max(x, 1e-12)) / 6) });

  let t0 = performance.now();
  function sync() {
    distK.v.textContent = distK.get();
    const lstm = st.arch === 'lstm', attn = st.arch === 'attn';
    parK.g.querySelector('.lab-seg-l')!.textContent = lstm ? 'forget f' : attn ? 'path' : '||W||';
    parK.v.textContent = lstm ? `gate holds ${GATE[st.f]} per step` : attn ? 'one hop to any token' : `spectral norm ${NORM[st.w]}${st.arch === 'sigmoid' ? ' × σ′ ≤ 1/4' : ' × tanh′ ≤ 1'}`;
    parK.g.querySelectorAll('button').forEach((b) => (attn ? b.setAttribute('disabled', '') : b.removeAttribute('disabled')));
    leftLabel.textContent = `token t−${DIST[st.d]}`;
    firstLbl.textContent = `t−${DIST[st.d]}`;
    arc.setAttribute('d', `M ${xOf(CELLS - 1)} ${CY - CW / 2 - 2} C ${xOf(CELLS - 1)} 34, ${xOf(0)} 34, ${xOf(0)} ${CY - CW / 2 - 2}`);
    arc.setAttribute('opacity', attn ? '1' : '0');
    links.forEach((l) => l.setAttribute('opacity', attn ? '0.25' : '1'));
    const k = DIST[st.d], x = signal(k), e = eta();
    const verdict = x > 10 ? 'exploding: one long-range term swamps the update' : x >= 0.1 ? 'alive: the early token can still be learned from' : x >= 1e-3 ? 'faint: drowned out by short-range gradients' : 'vanished: the early token is effectively invisible';
    const pct = Math.max(0, Math.min(100, x > 1 ? 100 : 100 * (1 + Math.log10(Math.max(x, 1e-12)) / 6)));
    fill.style.width = `${pct}%`;
    fill.style.background = x > 10 ? RED : x >= 0.1 ? TEAL : x >= 1e-3 ? AMBER : RED;
    meterLabel.textContent = `signal at t−${k}: ${fmt(x)}`;
    stats.textContent = `per-step factor  η = ${attn ? '1 (a single weighted sum)' : fmt(e)}\n`
      + `steps back       ${hops(k)}${attn ? ` (not ${k}: attention skips the chain)` : ''}\n`
      + `signal left      η^${hops(k)} = ${fmt(x)}\n`
      + verdict;
    t0 = performance.now();
    if (reduce) paint(1);
  }

  function paint(u: number) {
    // u in [0,1]: how far the pulse has travelled from the loss (right) to the earliest token (left)
    const attn = st.arch === 'attn';
    cells.forEach((c, i) => {
      if (attn) {   // only the two ends are on the path; the tokens in between are bystanders
        const end = i === 0 || i === CELLS - 1;
        c.setAttribute('fill', TEAL);
        c.setAttribute('fill-opacity', String(end ? (i === 0 && u < 1 ? 0.04 : 1) : 0.15));
        return;
      }
      const reached = (CELLS - 1 - i) / (CELLS - 1) <= u + 1e-9;
      const { c: col, o } = look(signal(distOf(i)));
      c.setAttribute('fill', col);
      c.setAttribute('fill-opacity', String(reached ? o : 0.04));
    });
    if (reduce) { pulse.setAttribute('opacity', '0'); return; }
    let px: number, py: number;
    if (attn) {   // along the arc
      const tt = Math.min(1, u);
      const p0 = [xOf(CELLS - 1), CY - CW / 2], p1 = [xOf(CELLS - 1), 34], p2 = [xOf(0), 34], p3 = [xOf(0), CY - CW / 2];
      const b = (a: number, b2: number, c: number, d: number) => (1 - tt) ** 3 * a + 3 * (1 - tt) ** 2 * tt * b2 + 3 * (1 - tt) * tt ** 2 * c + tt ** 3 * d;
      px = b(p0[0], p1[0], p2[0], p3[0]); py = b(p0[1], p1[1], p2[1], p3[1]);
    } else { px = X1 - u * (X1 - X0); py = CY; }
    pulse.setAttribute('cx', String(px)); pulse.setAttribute('cy', String(py));
    pulse.setAttribute('opacity', u < 1 ? '1' : '0');
  }

  function frame(now: number) {
    const u = Math.min(1, ((now - t0) / 1000) / 2.2);       // 2.2 s for the trip, then hold for a beat
    paint(u);
    if ((now - t0) / 1000 > 3.6) t0 = now;
    requestAnimationFrame(frame);
  }
  sync();
  if (!reduce) requestAnimationFrame(frame);
}
