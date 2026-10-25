// <div data-lab="bbnode"></div> -> search one B-tree node three ways and count what it costs.
//
// The node holds 11 URL keys (std's BTreeMap node holds at most 11). Three layouts:
//   plain    std's way: the node stores a 24-byte String (ptr, len, cap) per key; the search walks
//            the keys in order and follows each pointer to the heap to compare (std's find_key_index).
//   inline   bbtree's inline keys without the prefix: 8 bytes of every key packed in the node.
//            Count the smaller ones in one pass; keys whose 8 bytes tie are compared in full.
//   prefix   inline keys taken after the bytes the node's two fences share, which every key shares too.
// Everything is computed from the strings below, nothing is modelled: lines are 64-byte cache lines
// of the node actually touched, heap reads are keys compared in full. Values are left out in every
// layout (finding the value is one more line in all three).

const BASE = 'https://en.wikipedia.org/wiki/Battle_of_';
const NAMES = ['Actium', 'Agincourt', 'Austerlitz', 'Badr', 'Bunker_Hill', 'Cannae', 'Gettysburg', 'Hastings', 'Midway', 'Stalingrad', 'Waterloo'];
const KEYS = NAMES.map((n) => BASE + n);
const LOW = BASE + 'Abu_Klea', HIGH = BASE + 'Yorktown';        // the separators either side of this node in its parent
const QUERIES: [string, string][] = [['Hastings', 'Hastings (hit)'], ['Bosworth', 'Bosworth (miss)'], ['Stalingrad_(1942)', 'Stalingrad_(1942) (near miss)'], ['Waterloo', 'Waterloo (last key)']];
const SLOT = 24, WIDTH = 8, LINE = 64, MISS_NS = 100;

type Mode = 'plain' | 'inline' | 'prefix';
type Ev = { line?: number; heap?: number; tie?: number[]; text: string; hit?: boolean };

const h = (tag: string, attrs: Record<string, string> = {}, text = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

const shared = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
const windowAt = (s: string, off: number) => s.slice(off, off + WIDTH).padEnd(WIDTH, '\0');
const show = (w: string) => w.replace(/\0/g, '·');
const PREFIX = shared(LOW, HIGH);

/** The search, as the events a reader watches: lines read, keys compared in full. */
function plan(mode: Mode, q: string): { evs: Ev[]; found: number } {
  const evs: Ev[] = [];
  const seen = new Set<number>();
  const touch = (lo: number, hi: number, why: string) => {
    for (let l = Math.floor(lo / LINE); l <= Math.floor((hi - 1) / LINE); l++) if (!seen.has(l)) { seen.add(l); evs.push({ line: l, text: `read line ${l} of the node (${why})` }); }
  };
  if (mode === 'plain') {
    for (let i = 0; i < KEYS.length; i++) {
      touch(i * SLOT, (i + 1) * SLOT, `slot ${i}: pointer, length, capacity`);
      const c = q < KEYS[i] ? -1 : q > KEYS[i] ? 1 : 0;
      evs.push({ heap: i, hit: c === 0, text: `follow slot ${i}'s pointer, compare with ${NAMES[i]}: ${c > 0 ? 'still bigger, keep going' : c === 0 ? 'equal, found it' : 'smaller, so the key is not here'}` });
      if (c <= 0) return { evs, found: c === 0 ? i : -1 };
    }
    return { evs, found: -1 };
  }
  const off = mode === 'prefix' ? PREFIX : 0;
  const qw = windowAt(q, off);
  const per = LINE / WIDTH;
  for (let l = 0; l * per < KEYS.length; l++) {
    const last = Math.min(KEYS.length, (l + 1) * per) - 1;
    touch(l * LINE, l * LINE + 1, `inline keys ${l * per}–${last}, ${WIDTH} bytes each`);
  }
  const ws = KEYS.map((k) => windowAt(k, off));
  const smaller = ws.filter((w) => w < qw).length;
  const ties = ws.map((w, i) => (w === qw ? i : -1)).filter((i) => i >= 0);
  evs.push({ tie: ties, text: `count: ${smaller} inline keys are smaller than "${show(qw)}", ${ties.length} tie` });
  if (!ties.length) { evs.push({ text: `no tie, so the key is not in this node (it would sit at slot ${smaller}): no heap read at all` }); return { evs, found: -1 }; }
  // binary search over the tied run, comparing full keys (each comparison is a heap read)
  let lo = ties[0], hi = ties[ties.length - 1] + 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const c = q < KEYS[mid] ? -1 : q > KEYS[mid] ? 1 : 0;
    evs.push({ heap: mid, hit: c === 0, text: `tie: compare the full key with ${NAMES[mid]}: ${c === 0 ? 'equal, found it' : c < 0 ? 'smaller' : 'bigger'}` });
    if (c === 0) return { evs, found: mid };
    if (c < 0) hi = mid; else lo = mid + 1;
  }
  evs.push({ text: 'the ties are settled: the key is not in this node' });
  return { evs, found: -1 };
}

export function bbNodeLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-bbnode');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { mode: 'plain' as Mode, q: 'Hastings' };

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'node.sim'), h('span', { class: 'lab-tag' }, 'runs in your browser'));

  const seg = <T extends string>(name: string, opts: [T, string][], get: () => T, set: (v: T) => void) => {
    const g = h('div', { class: 'lab-seg', role: 'radiogroup', 'aria-label': name });
    g.append(h('span', { class: 'lab-seg-l' }, name));
    for (const [v, label] of opts) {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(get() === v), 'data-v': v }, label);
      b.onclick = () => { g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); set(v); run(); };
      g.append(b);
    }
    return g;
  };
  const modes = seg<Mode>('layout', [['plain', 'std: String keys'], ['inline', 'inline keys'], ['prefix', 'prefix + inline']], () => state.mode, (v) => { state.mode = v; });
  const queries = seg<string>('find', QUERIES, () => state.q, (v) => { state.q = v; });

  const actions = h('div', { class: 'lab-actions' });
  const playB = h('button', { type: 'button', class: 'lab-btn' }, 'Replay the search');
  actions.append(playB);

  const view = h('div', { class: 'bn-view' });
  const fences = h('div', { class: 'bn-row bn-fences' });
  const query = h('div', { class: 'bn-row bn-query' });
  const nodeL = h('div', { class: 'bn-label' }, 'the node, in 64-byte cache lines');
  const node = h('div', { class: 'bn-node' });
  const heapL = h('div', { class: 'bn-label' }, `the heap: each key's bytes, ${BASE}…`);
  const heap = h('div', { class: 'bn-heap' });
  view.append(fences, query, nodeL, node, heapL, heap);
  const meters = h('div', { class: 'bn-meters', 'aria-live': 'polite' });
  const log = h('ol', { class: 'bn-log' });
  root.append(bar, modes, queries, actions, view, meters, log);

  const chips = NAMES.map((n) => { const c = h('span', { class: 'bn-key' }, n); heap.append(c); return c; });
  let timer = 0, gen = 0;

  function drawNode(mode: Mode, q: string) {
    node.innerHTML = '';
    const off = mode === 'prefix' ? PREFIX : 0;
    // fences and query: what the node can skip, and the bytes it compares first
    fences.innerHTML = '';
    fences.append(h('span', { class: 'bn-tag' }, 'fences'));
    for (const f of [LOW, HIGH]) {
      const s = h('span', { class: 'bn-str' });
      s.append(h('span', { class: mode === 'prefix' ? 'bn-skip' : '' }, f.slice(0, PREFIX)), h('span', {}, f.slice(PREFIX)));
      fences.append(s);
    }
    fences.append(h('span', { class: 'bn-note' }, mode === 'prefix' ? `share ${PREFIX} bytes, so every key here does too: skip them` : 'not used'));
    const full = BASE + q;
    query.innerHTML = '';
    query.append(h('span', { class: 'bn-tag' }, 'looking for'));
    const s = h('span', { class: 'bn-str' });
    if (mode === 'plain') s.append(h('span', {}, full));
    else s.append(h('span', { class: off ? 'bn-skip' : '' }, full.slice(0, off)), h('mark', {}, full.slice(off, off + WIDTH)), h('span', {}, full.slice(off + WIDTH)));
    query.append(s);

    if (mode === 'plain') {
      const lines = Math.ceil((KEYS.length * SLOT) / LINE);
      for (let l = 0; l < lines; l++) {
        const first = Math.floor((l * LINE) / SLOT), last = Math.min(KEYS.length - 1, Math.floor(((l + 1) * LINE - 1) / SLOT));
        const box = h('div', { class: 'bn-line', 'data-line': String(l) });
        box.append(h('span', { class: 'bn-ln' }, `line ${l}`), h('span', { class: 'bn-slots' }, `${first === last ? `slot ${first}` : `slots ${first}–${last}`}: ptr · len · cap`));
        node.append(box);
      }
    } else {
      const per = LINE / WIDTH, lines = Math.ceil(KEYS.length / per);
      for (let l = 0; l < lines; l++) {
        const box = h('div', { class: 'bn-line', 'data-line': String(l) });
        box.append(h('span', { class: 'bn-ln' }, `line ${l}`));
        const cells = h('span', { class: 'bn-cells' });
        for (let i = l * per; i < Math.min(KEYS.length, (l + 1) * per); i++) cells.append(h('code', { class: 'bn-cell', 'data-slot': String(i) }, show(windowAt(KEYS[i], off))));
        box.append(cells);
        node.append(box);
      }
    }
  }

  function apply(ev: Ev) {
    if (ev.line !== undefined) node.querySelector(`[data-line="${ev.line}"]`)?.classList.add('read');
    if (ev.tie) for (const i of ev.tie) node.querySelector(`[data-slot="${i}"]`)?.classList.add('tie');
    if (ev.heap !== undefined) chips[ev.heap].classList.add(ev.hit ? 'hit' : 'read');
    log.append(h('li', {}, ev.text));
  }

  function meter(evs: Ev[], found: number, done: boolean) {
    // every full compare waits on the one before; the count is one more step when there is one
    const waits = evs.filter((e) => e.heap !== undefined).length + (evs.some((e) => e.tie) ? 1 : 0);
    const lines = evs.filter((e) => e.line !== undefined).length, reads = evs.filter((e) => e.heap !== undefined).length;
    const verdict = done ? (found >= 0 ? `found ${NAMES[found]}` : 'not in this node') : 'searching…';
    meters.textContent = `node lines ${lines}   heap reads ${reads}   steps that wait on the last ${waits}   ≈ ${(lines + reads) * MISS_NS} ns if every line misses   ${verdict}`;
  }

  function run() {
    const my = ++gen;
    clearTimeout(timer);
    drawNode(state.mode, state.q);
    chips.forEach((c) => c.classList.remove('read', 'hit'));
    log.innerHTML = '';
    const { evs, found } = plan(state.mode, BASE + state.q);
    if (reduce) { evs.forEach(apply); meter(evs, found, true); return; }
    let i = 0;
    const step = () => {
      if (my !== gen) return;
      if (i < evs.length) { apply(evs[i]); i++; meter(evs.slice(0, i), -1, false); timer = window.setTimeout(step, 520); }
      else meter(evs, found, true);
    };
    meter([], -1, false);
    timer = window.setTimeout(step, 250);
  }
  playB.onclick = run;
  run();
}
