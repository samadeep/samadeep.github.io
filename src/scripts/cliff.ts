// <div data-lab="cliff"></div> -> push a model's confidence up and watch e^-m fall off the end of 1.0.
//
// Two classes, logits [m, 0], so the margin is m. Standard cross-entropy forms 1 + e^-m and divides;
// once e^-m is under half a step of the float grid around 1.0 it rounds away and the target gradient
// q_t - 1 becomes exactly 0. The fixed version keeps e^-m in the numerator, so it never vanishes.
// Every number shown is computed in the chosen format (bf16 emulated by rounding float32 to 8 bits).
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

type Fmt = 'bf16' | 'fp32' | 'fp64';
const BITS: Record<Fmt, number> = { bf16: 7, fp32: 23, fp64: 52 };
const buf = new DataView(new ArrayBuffer(4));
const bf16 = (x: number) => {
  buf.setFloat32(0, x);
  let b = buf.getUint32(0);
  b = (b + 0x7fff + ((b >>> 16) & 1)) >>> 0;
  buf.setUint32(0, (b & 0xffff0000) >>> 0);
  return buf.getFloat32(0);
};
const ROUND: Record<Fmt, (x: number) => number> = { bf16, fp32: Math.fround, fp64: (x) => x };

const VW = 440, VH = 92, X0 = 22, X1 = 418, DECADES = 20;     // axis: e^-m from 10^0 down to 10^-20
const TEAL = '#00aebb', RED = '#ff6b6b', INK = '#e8e4d3', RULE = '#1d3331', DIM = '#7f9692';
const xOf = (v: number) => X0 + (Math.min(DECADES, Math.max(0, -Math.log10(Math.max(v, 1e-300)))) / DECADES) * (X1 - X0);
const fmt = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 1e-3 && Math.abs(v) < 1e4 ? v.toPrecision(4) : v.toExponential(3));

export function cliffLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-cliff');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'cliff.sim'), h('span', { class: 'lab-tag' }, 'runs in your browser'));

  const state = { fmt: 'fp32' as Fmt, m: 9, playing: false };
  const seg = h('div', { class: 'lab-seg', role: 'radiogroup', 'aria-label': 'Float format' });
  seg.append(h('span', { class: 'lab-seg-l' }, 'Format'));
  for (const f of ['bf16', 'fp32', 'fp64'] as Fmt[]) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(state.fmt === f) }, f);
    b.onclick = () => { seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); state.fmt = f; draw(); };
    seg.append(b);
  }
  const knob = h('div', { class: 'lab-seg' });
  const val = h('span', { class: 'cl-val', 'aria-live': 'polite' });
  const minus = h('button', { type: 'button', 'aria-label': 'less confident' }, '−');
  const plus = h('button', { type: 'button', 'aria-label': 'more confident' }, '+');
  minus.onclick = () => { state.m = Math.max(0, +(state.m - 0.5).toFixed(2)); draw(); };
  plus.onclick = () => { state.m = Math.min(45, +(state.m + 0.5).toFixed(2)); draw(); };
  knob.append(h('span', { class: 'lab-seg-l' }, 'margin m'), minus, val, plus);

  const actions = h('div', { class: 'lab-actions' });
  const playB = h('button', { type: 'button', class: 'lab-btn' }, 'Train: raise confidence');
  const resetB = h('button', { type: 'button', class: 'lab-btn ghost' }, 'Reset');
  actions.append(playB, resetB);

  const svg = s('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'cl-svg', role: 'img', 'aria-label': 'The size of e to the minus m on a log axis, and the point where adding it to 1.0 stops changing anything' });
  s('line', { x1: X0, y1: 40, x2: X1, y2: 40, stroke: RULE, 'stroke-width': 2 }, svg);
  for (let d = 0; d <= DECADES; d += 5) {
    const x = X0 + (d / DECADES) * (X1 - X0);
    s('line', { x1: x, y1: 34, x2: x, y2: 46, stroke: DIM, 'stroke-width': 1 }, svg);
    const t = s('text', { x, y: 70, fill: DIM, 'font-size': 14, 'text-anchor': d === 0 ? 'start' : d === DECADES ? 'end' : 'middle' }, svg);
    t.textContent = d === 0 ? '1' : `1e-${d}`;
  }
  const lost = s('rect', { y: 18, height: 44, fill: RED, opacity: 0.12 }, svg);
  const wall = s('line', { y1: 12, y2: 66, stroke: RED, 'stroke-width': 2, 'stroke-dasharray': '4 3' }, svg);
  const dot = s('circle', { cy: 40, r: 7, fill: TEAL }, svg);
  // labels are HTML so they stay readable on a phone
  const axisL = h('div', { class: 'cl-axis' });
  const wallT = h('span', { class: 'cl-wall' }), dotT = h('span', { class: 'cl-dot' });
  axisL.append(h('span', { class: 'cl-cap' }, 'e^-m on a log scale, 1 down to 1e-20'), wallT, dotT);

  const meters = h('div', { class: 'cl-meters' });
  const row = (name: string) => {
    const r = h('div', { class: 'cl-row' });
    const track = h('span', { class: 'cl-track' }), fill = h('span', { class: 'cl-fill' });
    const num = h('span', { class: 'cl-num' });
    track.append(fill); r.append(h('span', { class: 'cl-name' }, name), track, num);
    meters.append(r);
    return { fill, num };
  };
  const stdM = row('standard  |g_t|'), fixM = row('fixed     |g_t|');
  const stats = h('pre', { class: 'lab-term lab-stats' });
  root.append(bar, seg, knob, actions, svg, axisL, meters, stats);

  function draw() {
    const r = ROUND[state.fmt], p = BITS[state.fmt], m = state.m;
    const e = r(Math.exp(-m));                         // the non-target exponential, accurate near 0
    const sum = r(1 + e);                              // standard: 1 + e^-m, rounded on the grid near 1.0
    const gStd = r(r(1 / sum) - 1);                    // q_t - 1
    const gOther = r(e / sum);                         // q_j, untouched by the rounding
    const loss = r(Math.log1p(e));                     // fixed: softplus(-m), no 1 + tiny anywhere
    const gFix = -r(Math.exp(-m - loss));              // -(sum of the others)
    const cliff = (p + 1) * Math.LN2;
    const half = 2 ** -(p + 1);
    const gone = gStd === 0;

    val.textContent = `${m.toFixed(1)}  (q_t = ${r(1 / sum) === 1 ? '1.0 exactly' : `1 - ${fmt(1 - 1 / (1 + Math.exp(-m)))}`})`;
    const wx = xOf(half);
    wall.setAttribute('x1', String(wx)); wall.setAttribute('x2', String(wx));
    lost.setAttribute('x', String(wx)); lost.setAttribute('width', String(Math.max(0, X1 - wx)));
    wallT.textContent = `red line: half a step of 1.0 in ${state.fmt} = 2^-${p + 1} = ${fmt(half)}`;
    const dx = xOf(e);
    dot.setAttribute('cx', String(dx)); dot.setAttribute('fill', gone ? RED : TEAL);
    dotT.classList.toggle('gone', gone);
    dotT.textContent = gone ? `e^-m = ${fmt(e)}: added to 1.0, it vanishes` : `e^-m = ${fmt(e)}: still changes 1.0`;

    const bar = (v: number) => `${Math.max(0, Math.min(100, (Math.log10(Math.max(Math.abs(v), 1e-40)) + 40) * 2.5))}%`;
    stdM.fill.style.width = gStd === 0 ? '0%' : bar(gStd); stdM.fill.style.background = gone ? RED : TEAL;
    stdM.num.textContent = gStd === 0 ? '0  (-X- gone)' : fmt(gStd);
    fixM.fill.style.width = bar(gFix); fixM.num.textContent = fmt(gFix);

    stats.textContent =
      `stored 1 + e^-m  = ${sum === 1 ? '1.0 exactly' : sum.toPrecision(state.fmt === 'fp64' ? 17 : state.fmt === 'fp32' ? 9 : 4)}\n` +
      `standard: loss ${fmt(r(Math.log(sum)))}   g = [${fmt(gStd)}, ${fmt(gOther)}]   sum ${fmt(r(gStd + gOther))}\n` +
      `fixed:    loss ${fmt(loss)}   g = [${fmt(gFix)}, ${fmt(-gFix)}]   sum 0\n` +
      `cliff for ${state.fmt}: m > ${cliff.toFixed(2)}   (b = ${p} fraction bits, (b+1)*ln 2)`;
  }

  let raf = 0, last = 0;
  const step = (t: number) => {
    const dt = Math.min(0.1, (t - (last || t)) / 1000); last = t;
    state.m = Math.min(45, state.m + dt * 4);
    draw();
    if (state.m >= 45) { stopPlay(); return; }
    raf = requestAnimationFrame(step);
  };
  function stopPlay() { state.playing = false; cancelAnimationFrame(raf); playB.textContent = 'Train: raise confidence'; }
  playB.onclick = () => {
    if (state.playing) return stopPlay();
    if (state.m >= 45) state.m = 0;
    if (reduce) { state.m = Math.ceil((BITS[state.fmt] + 1) * Math.LN2 * 2) / 2; draw(); return; }
    state.playing = true; playB.textContent = 'Pause'; last = 0; raf = requestAnimationFrame(step);
  };
  resetB.onclick = () => { stopPlay(); state.m = 0; draw(); };
  draw();
}
