// <div data-lab="ocs"></div> -> eight GPUs, one optical circuit switch, and a stopwatch on the dark time.
//
// Model (same as public/labs/optical-switching/ocs_lab.py): each GPU has one 400 Gb/s port, so it talks to
// one peer per circuit. All-to-all between rack A and rack B takes 4 rounds (a new pairing each round), and
// the mirrors must move before every round. A ring keeps the same pairing forever, so it switches once.
// Playback is slowed to about 1.6 s per round, but the split between dark and lit is the real ratio.
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

const TEAL = '#00aebb', RED = '#ff6b6b', INK = '#e8e4d3', DIM = '#8e8c80', RULE = '#1d3331';
const VW = 640, VH = 200, N = 4, LX = 76, RX = 564, ML = 285, MR = 355;
const Y = (i: number) => 34 + i * 44;
const B = 50e9;                                            // 400 Gb/s in bytes per second
const SWITCH = [10e-3, 1e-3, 300e-6, 10e-6, 1e-6, 100e-9];
const MSG = [64e3, 1e6, 16e6, 256e6];
const CYCLE = 1.6;                                         // real seconds per round of playback

const time = (x: number) => (x >= 1e-3 ? `${+(x * 1e3).toPrecision(3)} ms` : x >= 1e-6 ? `${+(x * 1e6).toPrecision(3)} µs` : `${+(x * 1e9).toPrecision(3)} ns`);
const bytes = (x: number) => (x >= 1e9 ? `${+(x / 1e9).toPrecision(3)} GB` : x >= 1e6 ? `${+(x / 1e6).toPrecision(3)} MB` : `${+(x / 1e3).toPrecision(3)} KB`);

export function ocsLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-ocs');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'circuit.sim'), h('span', { class: 'lab-tag' }, 'runs in your browser'));

  const st = { mode: 'a2a' as 'a2a' | 'ring', sw: 0, msg: 1 };
  const modes = h('div', { class: 'lab-seg', role: 'radiogroup', 'aria-label': 'Traffic' });
  modes.append(h('span', { class: 'lab-seg-l' }, 'traffic'));
  for (const [v, label] of [['a2a', 'All-to-all (MoE)'], ['ring', 'Ring all-reduce']] as const) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(st.mode === v) }, label);
    b.onclick = () => { modes.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); st.mode = v; reset(); };
    modes.append(b);
  }
  const knob = (name: string, get: () => string, step: (d: number) => void) => {
    const g = h('div', { class: 'lab-seg' });
    const v = h('span', { class: 'oc-val', 'aria-live': 'polite' }, get());
    const minus = h('button', { type: 'button', 'aria-label': `${name} down` }, '−');
    const plus = h('button', { type: 'button', 'aria-label': `${name} up` }, '+');
    minus.onclick = () => { step(-1); v.textContent = get(); reset(); };
    plus.onclick = () => { step(1); v.textContent = get(); reset(); };
    g.append(h('span', { class: 'lab-seg-l' }, name), minus, v, plus);
    return g;
  };
  const swK = knob('switch', () => `mirrors move in ${time(SWITCH[st.sw])}`, (d) => { st.sw = Math.max(0, Math.min(SWITCH.length - 1, st.sw + d)); });
  const msgK = knob('message', () => `${bytes(MSG[st.msg])} per pair = ${time(MSG[st.msg] / B)} of light`, (d) => { st.msg = Math.max(0, Math.min(MSG.length - 1, st.msg + d)); });

  const svg = s('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'oc-svg', role: 'img', 'aria-label': 'Four GPUs in rack A connected to four GPUs in rack B through the mirrors of an optical circuit switch' });
  s('rect', { x: ML - 25, y: 8, width: MR - ML + 50, height: VH - 16, rx: 10, fill: 'none', stroke: RULE, 'stroke-width': 1.5 }, svg);
  const paths: SVGElement[] = [], dots: SVGElement[][] = [], mirL: SVGElement[] = [], mirR: SVGElement[] = [];
  for (let i = 0; i < N; i++) {
    paths.push(s('polyline', { fill: 'none', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, svg));
    dots.push([0, 1, 2].map(() => s('circle', { r: 3.5, fill: INK, opacity: 0 }, svg)));
  }
  for (let i = 0; i < N; i++) {
    s('rect', { x: LX - 56, y: Y(i) - 16, width: 56, height: 32, rx: 5, fill: RULE, stroke: DIM }, svg);
    s('text', { x: LX - 28, y: Y(i) + 6, fill: INK, 'font-size': 17, 'text-anchor': 'middle' }, svg).textContent = `A${i}`;
    s('rect', { x: RX, y: Y(i) - 16, width: 56, height: 32, rx: 5, fill: RULE, stroke: DIM }, svg);
    s('text', { x: RX + 28, y: Y(i) + 6, fill: INK, 'font-size': 17, 'text-anchor': 'middle' }, svg).textContent = `B${i}`;
    mirL.push(s('line', { x1: ML, y1: Y(i) - 10, x2: ML, y2: Y(i) + 10, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg));
    mirR.push(s('line', { x1: MR, y1: Y(i) - 10, x2: MR, y2: Y(i) + 10, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg));
  }

  const lane = h('div', { class: 'oc-lane' });
  lane.append(h('span', {}, 'rack A'), h('span', {}, 'optical switch'), h('span', {}, 'rack B'));
  const status = h('div', { class: 'oc-status', 'aria-live': 'off' });
  const meterRow = h('div', { class: 'oc-meter' });
  const track = h('span', { class: 'oc-track' }), fill = h('span', { class: 'oc-fill' });
  const meterLabel = h('span', {});
  track.append(fill); meterRow.append(track, meterLabel);
  const stats = h('pre', { class: 'lab-term lab-stats' });
  root.append(bar, modes, swK, msgK, svg, lane, status, meterRow, stats);

  // sim clock (seconds of cluster time) runs at the real ratio; playback stretches each round to CYCLE
  let round = 0, simTime = 0, lit = 0, switches = 0, t0 = performance.now() / 1000, pairing = 0;
  function reset() { round = 0; simTime = lit = switches = 0; pairing = 0; t0 = performance.now() / 1000; }

  const pathFor = (i: number, k: number) => {
    const j = (i + k) % N;
    return [[LX, Y(i)], [ML, Y(i)], [MR, Y(j)], [RX, Y(j)]] as [number, number][];
  };
  const along = (pts: [number, number][], u: number): [number, number] => {
    const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    let d = u * seg.reduce((x, y) => x + y, 0);
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i]) { const f = d / seg[i]; return [pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1])]; }
      d -= seg[i];
    }
    return pts[pts.length - 1];
  };

  function frame() {
    const sw = SWITCH[st.sw], on = MSG[st.msg] / B;
    const needsSwitch = st.mode === 'a2a' || round === 0;
    const dark = needsSwitch ? sw : 0;
    const darkFrac = dark / (dark + on);
    const real = performance.now() / 1000 - t0;
    const u = (real % CYCLE) / CYCLE;                      // position inside this round
    const thisRound = Math.floor(real / CYCLE);
    if (thisRound > round) {                               // close finished rounds in exact cluster time
      for (; round < thisRound; round++) {
        const d = st.mode === 'a2a' || round === 0 ? sw : 0;
        simTime += d + on; lit += on; if (d) switches++;
      }
      if (st.mode === 'a2a') pairing = round % N;
    }
    const switching = u < darkFrac;
    const k = st.mode === 'a2a' ? pairing : 0;
    for (let i = 0; i < N; i++) {
      const pts = pathFor(i, k);
      paths[i].setAttribute('points', pts.map((p) => p.join(',')).join(' '));
      paths[i].setAttribute('stroke', switching ? RED : TEAL);
      paths[i].setAttribute('stroke-dasharray', switching ? '4 5' : '');
      paths[i].setAttribute('opacity', switching ? '0.55' : '1');
      // mirrors tilt toward their target while switching, then hold still
      const tilt = switching && !reduce ? Math.sin((u / Math.max(darkFrac, 1e-9)) * Math.PI) * 35 : 0;
      mirL[i].setAttribute('transform', `rotate(${tilt} ${ML} ${Y(i)})`);
      mirR[i].setAttribute('transform', `rotate(${-tilt} ${MR} ${Y(i)})`);
      dots[i].forEach((c, n) => {
        const visible = !switching && !reduce;
        c.setAttribute('opacity', visible ? '1' : '0');
        if (visible) { const [x, y] = along(pts, ((u - darkFrac) / Math.max(1 - darkFrac, 1e-9) + n / 3) % 1); c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y)); }
      });
    }
    status.style.color = switching ? RED : TEAL;
    status.textContent = switching ? `dark: mirrors moving (${time(dark)})` : 'lit: light carries data';

    const pct = simTime ? (100 * lit) / simTime : 100 * (1 - darkFrac);
    fill.style.width = `${pct}%`;
    fill.style.background = pct >= 50 ? TEAL : RED;
    meterLabel.textContent = `light carrying data: ${pct < 10 ? pct.toFixed(2) : pct.toFixed(1)}%`;
    stats.textContent = `rounds ${round}   switches ${switches}   cluster time ${simTime ? time(simTime) : '0'}   dark ${simTime ? time(simTime - lit) : '0'}\n`
      + (st.mode === 'ring'
        ? `one switch, then the same circuits forever: 90% lit after ${Math.ceil((9 * sw) / on).toLocaleString()} rounds`
        : `break-even message for a ${time(sw)} switch: ${bytes(B * sw)} per pair`);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
