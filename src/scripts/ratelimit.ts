// <div data-lab="ratelimit"></div> -> requests fly at a gate; pick the limiter and watch who gets through.
//
// Time is real seconds. The rule is "LIMIT requests per WINDOW seconds":
//   fixed window   count per calendar window, reset at each boundary
//   sliding log    remember admitted times, allow if fewer than LIMIT in the last WINDOW seconds
//   token bucket   LIMIT tokens max, refilled at LIMIT / WINDOW per second, one per request
// Traffic: a steady stream (knob), a burst button, and "time the boundary", which sends LIMIT requests
// just before a fixed-window reset and LIMIT just after: the classic way to double a fixed window's limit.
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

type Kind = 'fixed' | 'sliding' | 'token';
type Dot = { born: number; at: number; ok?: boolean; el: SVGElement };

const VW = 640, VH = 120, LANE = 66, GATE = 330, END = 590, START = 24;
const TEAL = '#00aebb', RED = '#ff6b6b', INK = '#e8e4d3', RULE = '#1d3331';

export function rateLimitLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-ratelimit');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TRAVEL = reduce ? 0 : 1.1;                       // seconds from spawn to gate

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'limiter.sim'), h('span', { class: 'lab-tag' }, 'runs in your browser'));

  const state = { kind: 'fixed' as Kind, limit: 5, window: 5, rate: 1.5 };
  const seg = (name: string, opts: [string, string][], key: 'kind') => {
    const g = h('div', { class: 'lab-seg', role: 'radiogroup', 'aria-label': name });
    g.append(h('span', { class: 'lab-seg-l' }, name));
    for (const [v, label] of opts) {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(state[key] === v) }, label);
      b.onclick = () => { g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); state[key] = v as Kind; reset(); };
      g.append(b);
    }
    return g;
  };
  const knob = (name: string, get: () => string, dec: () => void, inc: () => void) => {
    const g = h('div', { class: 'lab-seg' });
    const v = h('span', { class: 'rl-val', 'aria-live': 'polite' }, get());
    const minus = h('button', { type: 'button', 'aria-label': `less ${name}` }, '−');
    const plus = h('button', { type: 'button', 'aria-label': `more ${name}` }, '+');
    minus.onclick = () => { dec(); v.textContent = get(); };
    plus.onclick = () => { inc(); v.textContent = get(); };
    g.append(h('span', { class: 'lab-seg-l' }, name), minus, v, plus);
    return g;
  };

  const kinds = seg('Limiter', [['fixed', 'Fixed window'], ['sliding', 'Sliding log'], ['token', 'Token bucket']], 'kind');
  const limitK = knob('limit', () => `${state.limit} per ${state.window} s`, () => { state.limit = Math.max(2, state.limit - 1); reset(); }, () => { state.limit = Math.min(12, state.limit + 1); reset(); });
  const rateK = knob('traffic', () => (state.rate ? `${state.rate.toFixed(1)} req/s steady` : 'steady stream off'), () => { state.rate = Math.max(0, +(state.rate - 0.5).toFixed(1)); }, () => { state.rate = Math.min(6, +(state.rate + 0.5).toFixed(1)); });

  const actions = h('div', { class: 'lab-actions' });
  const burstB = h('button', { type: 'button', class: 'lab-btn' }, 'Send a burst of 10');
  const edgeB = h('button', { type: 'button', class: 'lab-btn ghost' }, 'Time the window boundary');
  const resetB = h('button', { type: 'button', class: 'lab-btn ghost' }, 'Reset');
  actions.append(burstB, edgeB, resetB);

  const svg = s('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'rl-svg', role: 'img', 'aria-label': 'Requests travelling to a rate limiter gate' });
  s('line', { x1: START, y1: LANE, x2: END, y2: LANE, stroke: RULE, 'stroke-width': 2 }, svg);
  s('rect', { x: GATE - 4, y: LANE - 32, width: 8, height: 64, rx: 3, fill: INK }, svg);
  s('rect', { x: END - 6, y: LANE - 22, width: 34, height: 44, rx: 6, fill: 'none', stroke: TEAL, 'stroke-width': 1.5 }, svg);
  const flash = s('text', { x: GATE, y: 18, fill: RED, 'font-size': 14, 'font-weight': 600, 'text-anchor': 'middle', opacity: 0 }, svg);
  flash.textContent = '429';
  // the lane's labels and the meter are HTML, so they stay readable at any width
  const lane = h('div', { class: 'rl-lane' });
  lane.append(h('span', {}, 'clients'), h('span', {}, 'limiter'), h('span', {}, 'API'));
  const meterRow = h('div', { class: 'rl-meter' });
  const track = h('span', { class: 'rl-track' }), meter = h('span', { class: 'rl-fill' });
  const meterLabel = h('span', { class: 'rl-label' });
  track.append(meter); meterRow.append(track, meterLabel);

  const stats = h('pre', { class: 'lab-term lab-stats' });
  root.append(bar, kinds, limitK, rateK, actions, svg, lane, meterRow, stats);

  // ---- simulation ----
  let t0 = performance.now() / 1000, now = 0, last = 0, nextSteady = 0;
  let dots: Dot[] = [], pending: number[] = [];          // pending = arrival times at the gate still to spawn
  let admitted: number[] = [], allowed = 0, blocked = 0, busiest = 0;
  let win = -1, count = 0, tokens = 0, refill = 0;

  function reset() {
    for (const d of dots) d.el.remove();
    dots = []; pending = []; admitted = []; allowed = blocked = busiest = 0;
    t0 = performance.now() / 1000; now = 0; last = 0; nextSteady = 0;
    win = -1; count = 0; tokens = state.limit; refill = 0;
  }

  function decide(t: number): boolean {
    if (state.kind === 'fixed') {
      const w = Math.floor(t / state.window);
      if (w !== win) { win = w; count = 0; }
      if (count < state.limit) { count++; return true; }
      return false;
    }
    if (state.kind === 'sliding') {
      admitted = admitted.filter((x) => x > t - state.window);
      return admitted.length < state.limit;
    }
    tokens = Math.min(state.limit, tokens + (t - refill) * (state.limit / state.window)); refill = t;
    if (tokens >= 1) { tokens -= 1; return true; }
    return false;
  }

  const spawn = (at: number) => {
    const el = s('circle', { cx: START, cy: LANE, r: 6, fill: INK }, svg);
    dots.push({ born: at - TRAVEL, at, el });
  };
  burstB.onclick = () => { for (let i = 0; i < 10; i++) pending.push(now + TRAVEL + i * 0.04); };
  edgeB.onclick = () => {
    const W = state.window;
    let boundary = (Math.floor((now + TRAVEL) / W) + 1) * W;    // next reset the dots can still reach in time
    if (boundary - 0.5 < now + TRAVEL) boundary += W;
    for (let i = 0; i < state.limit; i++) { pending.push(boundary - 0.45 + i * (0.4 / state.limit)); pending.push(boundary + 0.05 + i * (0.4 / state.limit)); }
  };
  resetB.onclick = reset;
  reset();

  let flashUntil = 0;
  function frame() {
    now = performance.now() / 1000 - t0;
    const dt = Math.min(0.1, now - last); last = now;
    if (state.rate > 0) { nextSteady -= dt * state.rate; if (nextSteady <= 0) { pending.push(now + TRAVEL); nextSteady += 1 + (Math.random() - 0.5) * 0.6; } }
    pending.sort((x, y) => x - y);
    while (pending.length && pending[0] - TRAVEL <= now) spawn(pending.shift()!);

    for (const d of dots) {
      if (d.ok === undefined && now >= d.at) {
        d.ok = decide(d.at);
        if (d.ok) {
          allowed++; if (state.kind !== 'sliding') admitted = admitted.filter((x) => x > d.at - state.window);
          admitted.push(d.at); busiest = Math.max(busiest, admitted.filter((x) => x > d.at - state.window).length);
          d.el.setAttribute('fill', TEAL);
        } else { blocked++; d.el.setAttribute('fill', RED); flashUntil = now + 0.35; }
      }
      const p = (now - d.born) / Math.max(TRAVEL, 0.001);
      if (d.ok === undefined) d.el.setAttribute('cx', String(START + Math.min(1, p) * (GATE - START)));
      else if (d.ok) d.el.setAttribute('cx', String(GATE + Math.min(1, (now - d.at) / Math.max(TRAVEL, 0.001)) * (END - GATE)));
      else { const q = Math.min(1, (now - d.at) / 0.6); d.el.setAttribute('cy', String(LANE + q * 45)); d.el.setAttribute('opacity', String(1 - q)); }
    }
    dots = dots.filter((d) => { const done = d.ok !== undefined && now - d.at > Math.max(TRAVEL, 0.6) + 0.05; if (done) d.el.remove(); return !done; });
    flash.setAttribute('opacity', now < flashUntil ? '1' : '0');

    // the meter shows what the limiter is counting
    let frac = 0, label = '';
    if (state.kind === 'fixed') {
      const w = Math.floor(now / state.window), left = (w + 1) * state.window - now;
      const c = w === win ? count : 0;
      frac = c / state.limit; label = `this window: ${c}/${state.limit}   resets in ${left.toFixed(1)} s`;
    } else if (state.kind === 'sliding') {
      const c = admitted.filter((x) => x > now - state.window).length;
      frac = c / state.limit; label = `admitted in the last ${state.window} s: ${c}/${state.limit}`;
    } else {
      const tk = Math.min(state.limit, tokens + (now - refill) * (state.limit / state.window));
      frac = tk / state.limit; label = `tokens: ${tk.toFixed(1)}/${state.limit}   (+${(state.limit / state.window).toFixed(1)}/s)`;
    }
    meter.style.width = `${100 * Math.max(0, Math.min(1, frac))}%`;
    meterLabel.textContent = label;
    stats.textContent = `admitted ${allowed}   blocked ${blocked}   most admitted in any ${state.window} s: ${busiest} (limit ${state.limit})`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
