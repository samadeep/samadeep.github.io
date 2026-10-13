// <div data-lab="fastcopy"></div> -> a sampling profiler walks an event loop's tasks; pick how it reads memory.
//
// Costs are measured, not invented: fastcopy.c on a 2.1 GHz Xeon (public/labs/profiler-fast-copy/):
//   process_vm_readv  ~510 ns per 64-byte read (one system call)
//   guarded memcpy    ~10 ns per read (SIGSEGV/SIGBUS handler armed around a plain copy)
//   one caught fault  ~1040 ns (signal delivery + siglongjmp), and the snapshot is dropped
// A snapshot reads 4 objects per task (task, coroutine, frame, code). The profiler may spend 1% of one
// core; it slows down to fit, but never below 1 snapshot/s (the floor in Datadog's write-up), so past that
// point the overhead grows instead. The rate is capped at 100 snapshots/s in this toy.
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

type Mode = 'readv' | 'guarded' | 'plain';
const COST: Record<Mode, number> = { readv: 510e-9, guarded: 10e-9, plain: 5e-9 };
const READS = 4, BUDGET = 0.01, FLOOR = 1, CAP = 100;
const TASKS = [100, 300, 1000, 2000, 5000, 10000, 20000];

const VW = 640, VH = 150, BOXES = 16, X0 = 28, STEP = 36.5, USER_Y = 46, KERNEL_Y = 122;
const TEAL = '#00aebb', RED = '#ff6b6b', AMBER = '#ffd43b', RULE = '#1d3331';

export function fastCopyLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-fastcopy');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'sampler.sim'), h('span', { class: 'lab-tag' }, 'runs in your browser'));

  const state = { mode: 'readv' as Mode, ti: 3 };
  const seg = h('div', { class: 'lab-seg', role: 'radiogroup', 'aria-label': 'How the profiler reads memory' });
  seg.append(h('span', { class: 'lab-seg-l' }, 'Reads via'));
  for (const [v, label] of [['readv', 'process_vm_readv'], ['guarded', 'guarded memcpy'], ['plain', 'plain memcpy']] as [Mode, string][]) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(state.mode === v), 'data-v': v }, label);
    b.onclick = () => { seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); state.mode = v; restart(); };
    seg.append(b);
  }
  const knob = h('div', { class: 'lab-seg' });
  const tv = h('span', { class: 'fc-val', 'aria-live': 'polite' });
  const minus = h('button', { type: 'button', 'aria-label': 'fewer tasks' }, '−');
  const plus = h('button', { type: 'button', 'aria-label': 'more tasks' }, '+');
  minus.onclick = () => { state.ti = Math.max(0, state.ti - 1); tv.textContent = taskLabel(); };
  plus.onclick = () => { state.ti = Math.min(TASKS.length - 1, state.ti + 1); tv.textContent = taskLabel(); };
  const taskLabel = () => `${TASKS[state.ti].toLocaleString('en-US')} tasks in flight`;
  tv.textContent = taskLabel();
  knob.append(h('span', { class: 'lab-seg-l' }, 'Load'), minus, tv, plus);

  const actions = h('div', { class: 'lab-actions' });
  const freeB = h('button', { type: 'button', class: 'lab-btn' }, 'Python frees a task mid-copy');
  const resetB = h('button', { type: 'button', class: 'lab-btn ghost' }, 'Reset');
  actions.append(freeB, resetB);

  // the picture: task boxes in user space, a kernel band below; the read pointer walks the boxes
  const svg = s('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'fc-svg', role: 'img', 'aria-label': 'A profiler reading task objects one by one; system call reads dip into the kernel band, guarded copies stay in user space' });
  s('rect', { x: 8, y: 100, width: VW - 16, height: 42, rx: 6, fill: '#0b2523' }, svg);
  const boxes: SVGElement[] = [];
  for (let i = 0; i < BOXES; i++) boxes.push(s('rect', { x: X0 + i * STEP, y: USER_Y - 14, width: 26, height: 28, rx: 4, fill: 'none', stroke: RULE, 'stroke-width': 1.5 }, svg));
  const ptr = s('circle', { cx: X0 + 13, cy: USER_Y + 30, r: 5, fill: TEAL }, svg);
  const trail = s('path', { d: '', fill: 'none', stroke: TEAL, 'stroke-width': 1.5, opacity: 0.5 }, svg);
  const crashT = s('text', { x: VW / 2, y: 127, fill: RED, 'font-size': 15, 'font-weight': 700, 'text-anchor': 'middle', opacity: 0 }, svg);
  crashT.textContent = 'Segmentation fault';
  const top = h('div', { class: 'fc-lanes' }, 'your service: one box per task');
  const lanes = h('div', { class: 'fc-lanes' }, 'kernel: system calls dip down here');

  // last 5 seconds of snapshots, scrolling
  const tl = h('div', { class: 'fc-tl', 'aria-hidden': 'true' });
  const tlLabel = h('div', { class: 'fc-tl-l' }, 'snapshots in the last 5 s');
  const stats = h('pre', { class: 'lab-term lab-stats' });
  root.append(bar, seg, knob, actions, top, svg, lanes, tlLabel, tl, stats);

  let t0 = performance.now() / 1000, now = 0, nextSnap = 0, walkStart = 0, walking = false;
  let ticks: { t: number; el: HTMLElement }[] = [], taken = 0, dropped = 0, faults = 0, syscalls = 0;
  let pendingFree = false, faultAt = -1, dead = false;

  function restart() {
    for (const k of ticks) k.el.remove();
    ticks = []; taken = dropped = faults = syscalls = 0;
    t0 = performance.now() / 1000; now = 0; nextSnap = 0; walking = false; pendingFree = false; faultAt = -1; dead = false;
    crashT.setAttribute('opacity', '0'); boxes.forEach((b) => b.setAttribute('stroke', RULE));
    freeB.removeAttribute('disabled'); freeB.textContent = 'Python frees a task mid-copy';
  }
  resetB.onclick = restart;
  freeB.onclick = () => { if (dead) { restart(); return; } pendingFree = true; };

  const perSnap = () => TASKS[state.ti] * READS * COST[state.mode];
  const rate = () => Math.min(CAP, Math.max(FLOOR, BUDGET / perSnap()));

  // how long one walk across the 16 boxes takes on screen (for feel only; the counters use the cost model)
  const walkDur = () => (reduce ? 0 : state.mode === 'readv' ? 1.6 : 0.25);

  function tick(kind: 'ok' | 'drop') {
    const el = h('span', { class: `fc-tick ${kind}` });
    tl.append(el); ticks.push({ t: now, el });
  }

  function frame() {
    now = performance.now() / 1000 - t0;
    if (!dead && now >= nextSnap) {
      const r = rate();
      nextSnap = now + 1 / r;
      syscalls += state.mode === 'readv' ? TASKS[state.ti] * READS : 0;
      if (pendingFree) {
        // this snapshot hits a freed page: show it on a fresh walk
        pendingFree = false; faultAt = 3 + Math.floor(Math.random() * (BOXES - 5));
        if (state.mode === 'plain') dead = true;
        else { if (state.mode === 'guarded') faults++; dropped++; tick('drop'); }
        walking = true; walkStart = now;
      } else {
        taken++; tick('ok');
        // the walk on screen is a sample of the reads; start a new one only when the last has finished
        if (!walking) { walking = true; walkStart = now; faultAt = -1; }
      }
    }

    // animate the walk
    const dur = walkDur();
    const p = walking ? (dur ? Math.min(1, (now - walkStart) / dur) : 1) : 1;
    let pos = p * (BOXES - 1);
    if (faultAt >= 0 && pos >= faultAt) pos = faultAt;
    const i = Math.floor(pos), frac = pos - i;
    boxes.forEach((b, k) => b.setAttribute('stroke', k === faultAt && pos >= faultAt ? (state.mode === 'plain' ? RED : AMBER) : k <= i && (walking || faultAt >= 0) ? TEAL : RULE));
    const x = X0 + 13 + pos * STEP;
    // a system call read dips into the kernel band between boxes
    const dip = state.mode === 'readv' ? Math.sin(frac * Math.PI) * (KERNEL_Y - USER_Y - 30) : 0;
    ptr.setAttribute('cx', String(x)); ptr.setAttribute('cy', String(USER_Y + 30 + dip));
    ptr.setAttribute('fill', faultAt >= 0 && pos >= faultAt ? (state.mode === 'plain' ? RED : AMBER) : TEAL);
    trail.setAttribute('d', state.mode === 'readv' && (walking || faultAt >= 0) ? `M${X0 + 13} ${USER_Y + 30} ` + Array.from({ length: i + 1 }, (_, k) => `Q${X0 + 13 + (k + 0.5) * STEP} ${KERNEL_Y + 8} ${X0 + 13 + (k + 1) * STEP} ${USER_Y + 30}`).slice(0, i).join(' ') : '');
    if (p >= 1) walking = false;
    crashT.setAttribute('opacity', dead && pos >= faultAt ? '1' : '0');
    if (dead) { freeB.textContent = 'Restart the service'; }

    // timeline: ticks drift left over 5 s
    ticks = ticks.filter((k) => { const age = now - k.t; if (age > 5) { k.el.remove(); return false; } k.el.style.left = `${100 * (1 - age / 5)}%`; return true; });

    const r = rate(), over = r * perSnap() * 100, n = TASKS[state.ti];
    const floorNote = BUDGET / perSnap() < FLOOR ? ' (1/s floor: over budget)' : BUDGET / perSnap() > CAP ? ' (capped at 100/s)' : '';
    stats.textContent = dead
      ? `the service crashed: plain memcpy touched\nmemory Python had already handed back\nsnapshots taken ${taken}   requests served since: 0`
      : `reads/snapshot ${(n * READS).toLocaleString('en-US')}   cost ${(perSnap() * 1e3).toFixed(3)} ms\n` +
        `snapshots/s ${r.toFixed(1)}${floorNote}\nprofiler CPU ${over.toFixed(2)}% of a core\nsystem calls ${syscalls.toLocaleString('en-US')}\n` +
        `taken ${taken}   dropped ${dropped}   faults caught ${faults}`;
    requestAnimationFrame(frame);
  }
  restart();
  requestAnimationFrame(frame);
}
