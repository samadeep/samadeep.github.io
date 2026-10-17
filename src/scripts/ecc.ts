// <div data-lab="ecc"></div> -> a 72-bit memory word (64 data + 8 check bits). Tap bits to flip them, or let
// "cosmic rays" hit it k bits at a time, and watch a SECDED decoder fix, flag, or make things worse.
//
// The codes and verdicts match public/labs/ecc-memory/ecc.py exactly (same columns, same decode rules), whose
// exhaustive run gives: 1 flip always corrected, 2 always detected, 3 miscorrected 76.0% (Hamming) / 57.3% (Hsiao),
// 4 silent 1.1% (Hamming) / 0.8% (Hsiao).
const h = (tag: string, attrs: Record<string, string> = {}, text = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

type Code = 'hamming' | 'hsiao';
type Verdict = 'clean' | 'corrected' | 'detected' | 'miscorrected' | 'silent';
const pop = (x: number) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

// 72 syndrome columns per code; bit i's column is what flipping bit i does to the 8-bit syndrome
const COLS: Record<Code, number[]> = {
  hamming: [0x80, ...Array.from({ length: 71 }, (_, i) => 0x80 | (i + 1))],
  hsiao: [
    ...Array.from({ length: 8 }, (_, k) => 1 << k),
    ...Array.from({ length: 256 }, (_, x) => x).filter((x) => pop(x) === 3),
    ...Array.from({ length: 256 }, (_, x) => x).filter((x) => pop(x) === 5).slice(0, 8),
  ],
};
const WHERE: Record<Code, Map<number, number>> = {
  hamming: new Map(COLS.hamming.map((c, i) => [c, i])),
  hsiao: new Map(COLS.hsiao.map((c, i) => [c, i])),
};
// check-bit positions, drawn in a different shade
const CHECKS: Record<Code, Set<number>> = {
  hamming: new Set([0, 1, 2, 4, 8, 16, 32, 64]),
  hsiao: new Set([0, 1, 2, 3, 4, 5, 6, 7]),
};

function decode(code: Code, s: number): { says: 'clean' | 'corrected' | 'detected'; fix: number | null } {
  if (s === 0) return { says: 'clean', fix: null };
  if (code === 'hamming') {
    const par = s >> 7, low = s & 0x7f;
    if (par === 0) return { says: 'detected', fix: null };
    if (low === 0) return { says: 'corrected', fix: 0 };
    return low <= 71 ? { says: 'corrected', fix: low } : { says: 'detected', fix: null };
  }
  if (pop(s) % 2 === 0) return { says: 'detected', fix: null };
  const i = WHERE.hsiao.get(s);
  return i === undefined ? { says: 'detected', fix: null } : { says: 'corrected', fix: i };
}

export function judge(code: Code, flips: Set<number>) {
  let s = 0;
  for (const b of flips) s ^= COLS[code][b];
  const { says, fix } = decode(code, s);
  const wrong = new Set(flips);
  if (fix !== null) wrong.has(fix) ? wrong.delete(fix) : wrong.add(fix);
  let v: Verdict;
  if (says === 'clean') v = wrong.size ? 'silent' : 'clean';
  else if (says === 'detected') v = 'detected';
  else v = wrong.size ? 'miscorrected' : 'corrected';
  return { s, fix, wrong, v };
}

const LINES: Record<Verdict, string> = {
  clean: 'decoder: clean. Every bit is right.',
  corrected: 'decoder: corrected. Data is right again.',
  detected: 'decoder: uncorrectable. Machine-check: the program stops, but nothing is silently wrong.',
  miscorrected: 'decoder: "corrected"  -X- it flipped a good bit. Wrong data goes to the CPU.',
  silent: 'decoder: clean  -X- the flips formed another valid word. Wrong data, no alarm.',
};

export function eccLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-ecc');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'secded.sim'), h('span', { class: 'lab-tag' }, 'runs in your browser'));

  const st = { code: 'hsiao' as Code, k: 3, flips: new Set<number>(), storm: false };
  const tally = { corrected: 0, detected: 0, miscorrected: 0, silent: 0 };

  const seg = h('div', { class: 'lab-seg', role: 'radiogroup', 'aria-label': 'Which SECDED code' });
  seg.append(h('span', { class: 'lab-seg-l' }, 'Code'));
  for (const [v, label] of [['hsiao', 'Hsiao (1970)'], ['hamming', 'textbook Hamming']] as [Code, string][]) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(st.code === v) }, label);
    b.onclick = () => { seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); st.code = v; resetAll(); };
    seg.append(b);
  }
  const knob = h('div', { class: 'lab-seg' });
  const kv = h('span', { class: 'ecc-val', 'aria-live': 'polite' });
  const minus = h('button', { type: 'button', 'aria-label': 'fewer bits per hit' }, '−');
  const plus = h('button', { type: 'button', 'aria-label': 'more bits per hit' }, '+');
  const kLabel = () => `${st.k} bit${st.k > 1 ? 's' : ''} per hit`;
  minus.onclick = () => { st.k = Math.max(1, st.k - 1); kv.textContent = kLabel(); };
  plus.onclick = () => { st.k = Math.min(5, st.k + 1); kv.textContent = kLabel(); };
  kv.textContent = kLabel();
  knob.append(h('span', { class: 'lab-seg-l' }, 'A hit flips'), minus, kv, plus);

  const actions = h('div', { class: 'lab-actions' });
  const hitB = h('button', { type: 'button', class: 'lab-btn' }, 'One hit');
  const stormB = h('button', { type: 'button', class: 'lab-btn ghost' }, 'Storm: hit forever');
  const readB = h('button', { type: 'button', class: 'lab-btn ghost' }, 'Read my flips');
  const resetB = h('button', { type: 'button', class: 'lab-btn ghost' }, 'Reset');
  actions.append(hitB, stormB, readB, resetB);

  const hint = h('div', { class: 'ecc-hint' }, 'Tap any bits to flip them yourself, then "Read my flips". Darker cells are check bits.');
  const grid = h('div', { class: 'ecc-grid', role: 'group', 'aria-label': '72-bit memory word' });
  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < 72; i++) {
    const c = h('button', { type: 'button', class: 'ecc-cell', 'aria-label': `bit ${i}`, 'aria-pressed': 'false' }, String(i)) as HTMLButtonElement;
    c.onclick = () => { if (st.storm) return; st.flips.has(i) ? st.flips.delete(i) : st.flips.add(i); paint(null); };
    cells.push(c); grid.append(c);
  }
  const synd = h('div', { class: 'ecc-synd' });
  const verdict = h('div', { class: 'ecc-verdict', 'aria-live': 'polite' }, ' ');
  const stats = h('pre', { class: 'lab-term lab-stats' });
  root.append(bar, seg, knob, actions, hint, grid, synd, verdict, stats);

  function paint(res: ReturnType<typeof judge> | null) {
    const chk = CHECKS[st.code];
    cells.forEach((c, i) => {
      c.className = 'ecc-cell' + (chk.has(i) ? ' chk' : '') + (st.flips.has(i) ? ' hit' : '');
      c.setAttribute('aria-pressed', String(st.flips.has(i)));
      if (res && res.fix === i) c.classList.add(res.v === 'corrected' ? 'fixed' : 'blamed');
    });
    let s = 0; for (const b of st.flips) s ^= COLS[st.code][b];
    synd.textContent = `syndrome ${s.toString(2).padStart(8, '0')}` + (res && res.fix !== null ? `  -> points at bit ${res.fix}` : '');
    const n = Object.values(tally).reduce((a, b) => a + b, 0);
    const pct = (x: number) => (n ? ` (${((100 * x) / n).toFixed(1)}%)` : '');
    stats.textContent =
      `words hit ${n}\n` +
      `corrected     ${tally.corrected}${pct(tally.corrected)}\n` +
      `detected      ${tally.detected}${pct(tally.detected)}\n` +
      `made worse    ${tally.miscorrected}${pct(tally.miscorrected)}\n` +
      `silent        ${tally.silent}${pct(tally.silent)}`;
  }

  function read() {
    if (!st.flips.size) { verdict.textContent = 'Flip at least one bit first.'; verdict.className = 'ecc-verdict'; return; }
    const res = judge(st.code, st.flips);
    if (res.v !== 'clean') tally[res.v]++;
    verdict.textContent = LINES[res.v] + (res.v === 'miscorrected' ? ` ${st.flips.size} flipped in, ${res.wrong.size} wrong out.` : '');
    verdict.className = 'ecc-verdict ' + res.v;
    paint(res);
  }

  function hit() {
    st.flips = new Set();
    while (st.flips.size < st.k) st.flips.add(Math.floor(Math.random() * 72));
    paint(null);
    verdict.textContent = `${st.k} bit${st.k > 1 ? 's' : ''} flipped. Decoding...`; verdict.className = 'ecc-verdict';
    return new Promise<void>((done) => setTimeout(() => { read(); done(); }, reduce ? 0 : 450));
  }

  let timer = 0;
  async function loop() { if (!st.storm) return; await hit(); timer = window.setTimeout(loop, reduce ? 150 : 700); }
  hitB.onclick = () => { if (!st.storm) hit(); };
  readB.onclick = () => { if (!st.storm) read(); };
  stormB.onclick = () => {
    st.storm = !st.storm;
    stormB.textContent = st.storm ? 'Stop the storm' : 'Storm: hit forever';
    if (st.storm) loop(); else clearTimeout(timer);
  };
  function resetAll() {
    st.storm = false; clearTimeout(timer); stormB.textContent = 'Storm: hit forever';
    st.flips = new Set(); for (const k of Object.keys(tally) as (keyof typeof tally)[]) tally[k] = 0;
    verdict.textContent = ' '; verdict.className = 'ecc-verdict'; paint(null);
  }
  resetB.onclick = resetAll;
  paint(null);
}
