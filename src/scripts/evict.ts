// <div data-lab="evict"></div> -> 100 keys in a full cache, Redis-style sampled LRU, and a samples knob.
//
// Same rule as evict.c (and public/labs/redis-inside/redis_lab.py): to evict one key, sample N random keys,
// merge them into a 16-slot pool sorted by idle time, evict the idlest key in the pool. Columns are age
// groups: the left column was written 10 s ago, the right one 1 s ago. Perfect LRU empties columns left to right.
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

const TEAL = '#00aebb', RED = '#ff6b6b', INK = '#e8e4d3', RULE = '#1d3331', GOLD = '#ffd166';
const COLS = 10, ROWS = 10, CELL = 30, GAP = 5, POOL = 16, PAD = 10;
const SAMPLES = [1, 2, 5, 10, 20];
// idle 10 s (oldest) on the left down to 1 s on the right; older = dimmer ivory
const shade = (idle: number) => `rgba(232,228,211,${0.25 + 0.075 * (10 - idle)})`;

export function evictLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-evict');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'evict.sim'), h('span', { class: 'lab-tag' }, 'runs in your browser'));

  let si = 2;                                             // default maxmemory-samples 5
  const knob = h('div', { class: 'lab-seg' });
  const val = h('span', { class: 'ev-val', 'aria-live': 'polite' });
  const minus = h('button', { type: 'button', 'aria-label': 'fewer samples' }, '−');
  const plus = h('button', { type: 'button', 'aria-label': 'more samples' }, '+');
  const showVal = () => { val.textContent = `maxmemory-samples ${SAMPLES[si]}${SAMPLES[si] === 5 ? ' (default)' : ''}`; };
  minus.onclick = () => { si = Math.max(0, si - 1); showVal(); reset(); };
  plus.onclick = () => { si = Math.min(SAMPLES.length - 1, si + 1); showVal(); reset(); };
  knob.append(h('span', { class: 'lab-seg-l' }, 'samples'), minus, val, plus);
  showVal();

  const actions = h('div', { class: 'lab-actions' });
  const one = h('button', { type: 'button', class: 'lab-btn' }, 'Write 1 new key');
  const fifty = h('button', { type: 'button', class: 'lab-btn' }, 'Write 50 new keys');
  const again = h('button', { type: 'button', class: 'lab-btn ghost' }, 'Reset');
  actions.append(one, fifty, again);

  const W = PAD * 2 + COLS * CELL + (COLS - 1) * GAP, H = PAD * 2 + ROWS * CELL + (ROWS - 1) * GAP;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ev-svg', role: 'img', 'aria-label': 'A grid of 100 cached keys; columns run from oldest on the left to newest on the right' });
  const cells: SVGElement[] = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    cells.push(s('rect', { x: PAD + c * (CELL + GAP), y: PAD + r * (CELL + GAP), width: CELL, height: CELL, rx: 4, 'stroke-width': 3 }, svg));
  }
  const axis = h('div', { class: 'ev-axis' });
  axis.append(h('span', {}, '← idle 10 s (oldest)'), h('span', {}, 'idle 1 s →'));
  const poolRow = h('div', { class: 'ev-pool', 'aria-label': 'eviction pool' });
  const poolCells = Array.from({ length: POOL }, () => poolRow.appendChild(h('span', {})));
  const poolLabel = h('div', { class: 'ev-pool-l' }, 'eviction pool: the 16 idlest keys sampled so far, best candidate on the right');
  const stats = h('pre', { class: 'lab-term lab-stats' });
  root.append(bar, knob, actions, svg, axis, poolLabel, poolRow, stats);

  // state: key i lives in column floor(i / ROWS); idle = 10 - column. Evicted keys are gone (new keys live off-grid).
  let alive: boolean[], pool: number[], evicted: number, writes: number;
  let queue = 0, busy = false, gen = 0;
  function reset() {
    gen++; busy = false;
    alive = Array(COLS * ROWS).fill(true); pool = []; evicted = writes = 0; queue = 0;
    paint(); render();
  }
  const idle = (k: number) => 10 - Math.floor(k / ROWS);
  function paint(sampled: number[] = [], chosen = -1) {
    cells.forEach((el, k) => {
      el.setAttribute('fill', alive[k] ? shade(idle(k)) : 'transparent');
      el.setAttribute('stroke', k === chosen ? RED : sampled.includes(k) ? GOLD : alive[k] ? 'transparent' : RULE);
    });
    poolCells.forEach((el, i) => {
      const k = pool[i];
      el.textContent = k === undefined ? '' : `${idle(k)}s`;
      el.className = k === undefined ? '' : alive[k] ? 'on' : 'ghost';
    });
  }
  function render() {
    const left = alive.filter(Boolean).length;
    // perfect LRU would have evicted keys 0 .. evicted-1 by now (oldest first); count the ones still here
    const missed = alive.slice(0, evicted).filter(Boolean).length;
    stats.textContent = `writes ${writes}   evictions ${evicted}   keys left ${left}/100\n`
      + `old keys perfect LRU would have evicted, still here: ${missed}`;
  }
  // one eviction, exactly as evict.c: sample, merge into the pool, evict the idlest live entry
  function evictOne(): { sampled: number[]; chosen: number } {
    const live = alive.map((a, k) => (a ? k : -1)).filter((k) => k >= 0);
    const sampled: number[] = [];
    while (sampled.length < Math.min(SAMPLES[si], live.length)) {
      const k = live[Math.floor(Math.random() * live.length)];
      if (!sampled.includes(k)) sampled.push(k);
    }
    for (const k of sampled) {
      if (pool.includes(k)) continue;
      if (pool.length < POOL || idle(k) > idle(pool[0])) {
        pool.push(k); pool.sort((x, y) => idle(x) - idle(y));
        if (pool.length > POOL) pool.shift();
      }
    }
    let chosen = -1;
    while (pool.length) { const k = pool.pop()!; if (alive[k]) { chosen = k; break; } }
    return { sampled, chosen };
  }
  function step() {
    if (!queue || alive.every((a) => !a)) { busy = false; queue = 0; return; }
    busy = true; queue--; writes++;
    const { sampled, chosen } = evictOne(), g = gen;
    paint(sampled, chosen);
    const finish = () => {
      if (g !== gen) return;
      if (chosen >= 0) {
        alive[chosen] = false; evicted++;
      }
      paint(); render();
      reduce ? step() : setTimeout(step, 60);
    };
    reduce ? finish() : setTimeout(finish, queue > 10 ? 90 : 380);
  }
  const write = (n: number) => { queue += n; if (!busy) step(); };
  one.onclick = () => write(1);
  fifty.onclick = () => write(50);
  again.onclick = reset;
  reset();
}
