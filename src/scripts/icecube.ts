// <div data-lab="icecube"></div> -> a side view of a slice of IceCube you can reconstruct events in.
//
// Geometry is the real detector's: strings 125 m apart, 60 optical modules per string every 17 m,
// between 1450 m and 2450 m deep. The physics is a 2D teaching model:
//   track   a muon at speed c emits Cherenkov light at cos(theta_c) = 1/n (n = 1.31, theta_c ~ 40 deg);
//           a module at distance d from the track sees the first photon at
//           t = t0 + (s_closest - d / tan(theta_c)) / c + d / (sin(theta_c) * c / n)
//   cascade light spreads out from one point: t = t0 + |r - vertex| * n / c
//   ice     "clear" adds 3 ns of timing jitter; "real" also delays photons by scattering
//           (ice below 2100 m: absorption ~200 m, scattering ~50 m), always late, never early.
// Reconstruction is the real pipeline in miniature: LineFit (a least-squares fit of position
// against time, IceCube's fast first guess), then a robust fit of the full timing model that
// punishes early hits harder than late ones, because scattering only ever delays light.
const C = 0.2998;                       // m/ns
const N = 1.31;                         // refractive index of deep ice
const CG = C / N;
const THETA = Math.acos(1 / N);
const STRINGS = 8, DOMS = 60, DX = 125, DZ = 17, TOP = -1450;
const W = (STRINGS - 1) * DX, H = (DOMS - 1) * DZ;

type Hit = { x: number; z: number; t: number; q: number };
type Ev = { kind: 'track' | 'cascade'; phi: number; px: number; pz: number; y0: number; hits: Hit[] };

const svgNS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number> = {}, parent?: Element) => {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
};
const h = (tag: string, attrs: Record<string, string> = {}, text = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const poisson = (mu: number) => { let k = 0, p = Math.exp(-mu), s = p; const u = Math.random(); while (u > s && k < 500) { k++; p *= mu / k; s += p; } return k; };
const deg = (r: number) => (r * 180) / Math.PI;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const modules = () => { const m: { x: number; z: number }[] = []; for (let i = 0; i < STRINGS; i++) for (let j = 0; j < DOMS; j++) m.push({ x: i * DX, z: j * DZ }); return m; };
const MODS = modules();

// expected time of the first photon at (x, z) for a track with direction phi through (px, pz) at t0 = 0.
// The slice is drawn flat, but a real track misses each string by tens of metres: y0 is that
// out-of-plane distance, so the closest approach is never zero.
function trackTime(x: number, z: number, phi: number, px: number, pz: number, y0 = 0) {
  const ux = Math.cos(phi), uz = Math.sin(phi), rx = x - px, rz = z - pz;
  const s = rx * ux + rz * uz, d = Math.hypot(rx * uz - rz * ux, y0);
  return { t: (s - d / Math.tan(THETA)) / C + d / (Math.sin(THETA) * CG), d };
}

export function simulate(kind: 'track' | 'cascade', scatter: boolean): Ev {
  const phi = Math.random() * 2 * Math.PI;
  const px = W * (0.3 + 0.4 * Math.random()), pz = H * (0.3 + 0.4 * Math.random());
  const y0 = 15 + 45 * Math.random();
  const hits: Hit[] = [];
  for (const m of MODS) {
    let t: number, d: number, mu: number;
    if (kind === 'track') { ({ t, d } = trackTime(m.x, m.z, phi, px, pz, y0)); mu = 9 * Math.exp(-d / 40) / (1 + d / 25); }
    else { d = Math.hypot(m.x - px, m.z - pz); t = d / CG; mu = 300 * Math.exp(-d / 70) / (1 + d / 25); }
    const q = poisson(mu);
    if (!q) continue;
    // scattering: photons from farther away wander longer; with more photons the first one is less late
    const late = scatter ? -Math.log(1 - Math.random()) * 45 * Math.pow(d / 50, 1.6) / Math.pow(q, 0.35) : 0;
    hits.push({ x: m.x, z: m.z, t: t + late + 3 * gauss(), q });
  }
  return { kind, phi, px, pz, y0, hits };
}

// LineFit: minimise sum |r_i - r0 - v t_i|^2  ->  v = cov(r, t) / var(t)
export function lineFit(hits: Hit[]) {
  const n = hits.length, mt = hits.reduce((a, h) => a + h.t, 0) / n;
  const mx = hits.reduce((a, h) => a + h.x, 0) / n, mz = hits.reduce((a, h) => a + h.z, 0) / n;
  let vx = 0, vz = 0, vt = 0;
  for (const h of hits) { const dt = h.t - mt; vx += (h.x - mx) * dt; vz += (h.z - mz) * dt; vt += dt * dt; }
  return { phi: Math.atan2(vz / vt, vx / vt), px: mx, pz: mz, speed: Math.hypot(vx, vz) / vt };
}

// full fit: early photons are impossible, late ones are expected, so residuals are scored asymmetrically
function cost(hits: Hit[], phi: number, px: number, pz: number, y0: number) {
  const r = hits.map((h) => h.t - trackTime(h.x, h.z, phi, px, pz, y0).t);
  const sorted = [...r].sort((a, b) => a - b);
  const t0 = sorted[Math.floor(sorted.length * 0.2)];          // anchor on the early side
  let c = 0;
  for (const v of r) { const x = v - t0; c += x < 0 ? Math.min(x * x, 2500) * 4 : Math.min(x * x, 2500) * 0.25; }
  return c;
}
export function fullFit(hits: Hit[], guess: { phi: number; px: number; pz: number }) {
  let best = { phi: guess.phi, px: guess.px, pz: guess.pz, y0: 30, c: Infinity };
  // coarse to fine over direction, sideways offset and out-of-plane distance
  for (const [span, dA, spanB, dB, ys] of [[Math.PI, 4, 160, 20, [0, 20, 40, 60]], [0.2, 0.5, 40, 4, [-10, 0, 10]], [0.03, 0.05, 8, 1, [-3, 0, 3]]] as const) {
    const c0 = { ...best }, first = !Number.isFinite(c0.c);
    for (let a = -span; a <= span; a += (dA * Math.PI) / 180) {
      for (let b = -spanB; b <= spanB; b += dB) {
        for (const dy of ys) {
          const phi = (first ? guess.phi : c0.phi) + a, base = first ? guess : c0;
          const y0 = first ? dy : Math.max(0, c0.y0 + dy);
          const px = base.px - b * Math.sin(phi), pz = base.pz + b * Math.cos(phi);
          const c = cost(hits, phi, px, pz, y0);
          if (c < best.c) best = { phi, px, pz, y0, c };
        }
      }
    }
  }
  return best;
}

export function icecubeLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-ice');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'icecube.slice'), h('span', { class: 'lab-tag' }, '8 strings · 480 sensors · runs in your browser'));
  const seg = (name: string, opts: [string, string][], def: string) => {
    const g = h('div', { class: 'lab-seg', role: 'radiogroup', 'aria-label': name });
    g.append(h('span', { class: 'lab-seg-l' }, name));
    for (const [v, label] of opts) {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === def), 'data-v': v }, label);
      b.onclick = () => { g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); fresh(); };
      g.append(b);
    }
    return { el: g, get: () => (g.querySelector('[aria-checked=true]') as HTMLElement).dataset.v! };
  };
  const kind = seg('Event', [['track', 'Muon track'], ['cascade', 'Cascade']], 'track');
  const ice = seg('Ice', [['real', 'Real (scattering)'], ['clear', 'Perfectly clear']], 'real');
  const actions = h('div', { class: 'lab-actions' });
  const again = h('button', { type: 'button', class: 'lab-btn ghost' }, 'New event');
  const fit = h('button', { type: 'button', class: 'lab-btn' }, 'Reconstruct');
  actions.append(fit, again);

  const pad = 40, sx = 520 / W, sz = 560 / H;
  const svg = el('svg', { viewBox: `0 0 ${520 + 2 * pad} ${560 + 2 * pad}`, class: 'ice-svg', role: 'img', 'aria-label': 'Side view of eight IceCube strings with the sensors that saw light, coloured by arrival time' });
  const X = (x: number) => pad + x * sx, Z = (z: number) => pad + (H - z) * sz;
  for (let i = 0; i < STRINGS; i++) el('line', { x1: X(i * DX), y1: Z(H) - 6, x2: X(i * DX), y2: Z(0) + 6, class: 'ice-string' }, svg);
  el('text', { x: pad, y: pad - 16, class: 'ice-label' }, svg).textContent = `${-TOP} m deep`;
  el('text', { x: pad, y: Z(0) + 28, class: 'ice-label' }, svg).textContent = `${-TOP + H} m`;
  el('text', { x: X(W), y: Z(0) + 28, class: 'ice-label', 'text-anchor': 'end' }, svg).textContent = `${DX} m between strings · ${DZ} m between sensors`;
  const gHits = el('g', {}, svg), gFit = el('g', {}, svg);
  const legend = h('div', { class: 'ice-legend' });
  legend.innerHTML = '<span>early</span><i></i><span>late</span><span class="ice-key-fit">┅ reconstructed</span><span class="ice-key-true">─ true</span>';
  const stats = h('pre', { class: 'lab-term lab-stats', 'aria-live': 'polite' });
  root.append(bar, kind.el, ice.el, actions, svg, legend, stats);

  let ev: Ev;
  const drawLine = (phi: number, px: number, pz: number, cls: string) => {
    const L = 3000, ux = Math.cos(phi), uz = Math.sin(phi);
    el('line', { x1: X(px - L * ux), y1: Z(pz - L * uz), x2: X(px + L * ux), y2: Z(pz + L * uz), class: cls, 'clip-path': 'url(#ice-clip)' }, gFit);
    // arrowhead in the direction of travel, at the centre of the slice
    const cx = X(px), cy = Z(pz), a = Math.atan2(-uz, ux);
    el('path', { d: `M${cx + 14 * Math.cos(a)} ${cy + 14 * Math.sin(a)} L${cx + 14 * Math.cos(a + 2.6)} ${cy + 14 * Math.sin(a + 2.6)} L${cx + 14 * Math.cos(a - 2.6)} ${cy + 14 * Math.sin(a - 2.6)}Z`, class: cls + '-head' }, gFit);
  };
  const clip = el('clipPath', { id: 'ice-clip' }, el('defs', {}, svg));
  el('rect', { x: pad - 20, y: pad - 10, width: 520 + 40, height: 560 + 20 }, clip);

  function render() {
    gHits.innerHTML = ''; gFit.innerHTML = '';
    const ts = ev.hits.map((h) => h.t), t0 = Math.min(...ts), t1 = Math.max(...ts);
    for (const m of MODS) el('circle', { cx: X(m.x), cy: Z(m.z), r: 1.6, class: 'ice-dom' }, gHits);
    for (const hit of [...ev.hits].sort((a, b) => b.t - a.t)) {
      const f = (hit.t - t0) / (t1 - t0 || 1);
      el('circle', { cx: X(hit.x), cy: Z(hit.z), r: Math.min(11, 3 + 2.2 * Math.sqrt(hit.q)), fill: `hsl(${f * 275} 85% 55%)`, class: 'ice-hit' }, gHits);
    }
    stats.textContent = `${ev.hits.length} sensors saw light, ${ev.hits.reduce((a, h) => a + h.q, 0)} photons, over ${Math.round(t1 - t0)} ns.\nPress Reconstruct: the direction comes from the arrival times alone.`;
    fit.removeAttribute('disabled');
  }
  function fresh() { do { ev = simulate(kind.get() as Ev['kind'], ice.get() === 'real'); } while (ev.hits.length < 12); render(); }
  fit.onclick = () => {
    fit.setAttribute('disabled', '');
    const t = performance.now();
    const lf = lineFit(ev.hits), ff = fullFit(ev.hits, lf);
    const ms = performance.now() - t;
    const err = (phi: number) => Math.abs(deg(wrap(phi - ev.phi)));
    gFit.innerHTML = '';
    if (ev.kind === 'track') drawLine(ev.phi, ev.px, ev.pz, 'ice-true');
    else el('circle', { cx: X(ev.px), cy: Z(ev.pz), r: 7, class: 'ice-vertex' }, gFit);
    drawLine(ff.phi, ff.px, ff.pz, 'ice-fit');
    const line = (name: string, e: number) => `${name.padEnd(28)} off by ${e.toFixed(1).padStart(5)}°`;
    stats.textContent = ev.kind === 'track'
      ? `${line('LineFit (first guess)', err(lf.phi))}\n${line('Full timing fit', err(ff.phi))}   (${ms.toFixed(0)} ms, ${ev.hits.length} hits)\nIceCube's real fit, in 3D with 5,160 sensors, reaches 0.3° at 100 TeV.`
      : `A cascade is a point of light, so its timing barely says which way it was going.\nLineFit picks a direction anyway: ${err(lf.phi).toFixed(0)}° off. In 3D IceCube gets about 5° for cascades, using the light's shape, not just timing.\nTrade-off: cascades stay inside the ice, so their energy is measured to ~8%.`;
  };
  again.onclick = fresh;
  fresh();
}
