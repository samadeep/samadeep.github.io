// Live labs inside posts. Markdown drops a placeholder, this file turns it into a widget:
//   <div data-lab="py" data-src="/labs/x/sim.py" data-args="--users 4000" data-presets="a|b"></div>
//     -> editable Python + terminal, run in the reader's browser with Pyodide (in a Web Worker)
//   <div data-lab="stream"></div>
//     -> token streaming demo: direct vs a gzip proxy, per-token vs batched writes, drop and resume
const PYODIDE = 'https://cdn.jsdelivr.net/npm/pyodide@314.0.7/';
const h = (tag: string, attrs: Record<string, string> = {}, text = '') => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  return el;
};

/* ---------------- Python runner ---------------- */
function pyLab(root: HTMLElement) {
  const src = root.dataset.src!;
  const file = src.split('/').pop()!;
  const presets = (root.dataset.presets ?? '').split('|').filter(Boolean);
  root.classList.add('lab');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, file), h('span', { class: 'lab-tag' }, 'runs in your browser'));
  const edit = h('button', { type: 'button', class: 'lab-btn ghost', 'aria-expanded': 'false' }, 'Edit code');
  bar.append(edit);

  const code = h('textarea', { class: 'lab-code', spellcheck: 'false', 'aria-label': `Source of ${file}`, rows: '18' }) as HTMLTextAreaElement;
  code.hidden = true;
  const reset = h('button', { type: 'button', class: 'lab-btn ghost lab-reset' }, 'Reset code');
  reset.hidden = true;

  const cmd = h('form', { class: 'lab-cmd' }) as HTMLFormElement;
  const args = h('input', { class: 'lab-args', value: root.dataset.args ?? '', 'aria-label': 'Arguments', spellcheck: 'false' }) as HTMLInputElement;
  const run = h('button', { type: 'submit', class: 'lab-btn' }, 'Run');
  const stop = h('button', { type: 'button', class: 'lab-btn ghost' }, 'Stop');
  stop.hidden = true;
  cmd.append(h('span', { class: 'lab-prompt' }, `$ python ${file}`), args, run, stop);

  const chips = h('div', { class: 'lab-presets' });
  for (const p of presets) {
    const b = h('button', { type: 'button', class: 'lab-chip' }, p);
    b.onclick = () => { args.value = p; cmd.requestSubmit(); };
    chips.append(b);
  }

  const term = h('pre', { class: 'lab-term', 'aria-live': 'polite', tabindex: '0' }, 'Press Run. The same file that produced the post\'s numbers runs here, unchanged.');
  root.append(bar, cmd, ...(presets.length ? [chips] : []), reset, code, term);

  let original = '';
  const load = async () => original || (original = await (await fetch(src)).text());
  edit.onclick = async () => {
    if (!code.value) code.value = await load();
    code.hidden = !code.hidden; reset.hidden = code.hidden;
    edit.setAttribute('aria-expanded', String(!code.hidden));
    edit.textContent = code.hidden ? 'Edit code' : 'Hide code';
  };
  reset.onclick = async () => { code.value = await load(); };

  let worker: Worker | null = null;
  const finish = () => { run.hidden = false; stop.hidden = true; args.disabled = false; };
  stop.onclick = () => { worker?.terminate(); worker = null; term.textContent += '\n^C stopped'; finish(); };

  cmd.onsubmit = async (e) => {
    e.preventDefault();
    const source = code.value || (await load());
    worker ??= new Worker('/labs/_runtime/py-worker.mjs', { type: 'module' });
    run.hidden = true; stop.hidden = false; args.disabled = true;
    term.textContent = `$ python ${file} ${args.value}\n`;
    const status = h('span', { class: 'lab-status' });
    term.append(status);
    worker.onmessage = ({ data }) => {
      if (data.status) status.textContent = data.status + '\n';
      if (data.out != null) { status.textContent = ''; term.append(data.out + '\n'); }
      if (data.err != null) { status.textContent = ''; term.append(h('span', { class: 'lab-err' }, data.err + '\n')); }
      if (data.done != null) { if (data.done >= 0) term.append(h('span', { class: 'lab-dim' }, `\n[done in ${data.done < 1000 ? data.done + " ms" : (data.done / 1000).toFixed(1) + " s"}]`)); finish(); }
      term.scrollTop = term.scrollHeight;
    };
    worker.postMessage({ base: (window as any).PYODIDE_BASE ?? PYODIDE, code: source, argv: [file, ...args.value.trim().split(/\s+/).filter(Boolean)] });
  };
}

/* ---------------- streaming demo ---------------- */
// Timers stand in for the lab's fake model: 85 ms to the first token, then 40 tokens/s, 200 tokens.
function streamLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-stream');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const N = 200, TPS = 40, PREFILL = 85;
  const words = 'the cache hit rate depends on where the request lands so route by prefix not by load alone'.split(' ');

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'stream.sim'), h('span', { class: 'lab-tag' }, 'simulated in your browser'));

  const seg = (name: string, opts: [string, string][], def: string) => {
    const g = h('div', { class: 'lab-seg', role: 'radiogroup', 'aria-label': name });
    g.append(h('span', { class: 'lab-seg-l' }, name));
    for (const [v, label] of opts) {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === def), 'data-v': v }, label);
      b.onclick = () => { g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); };
      g.append(b);
    }
    return { el: g, get: () => (g.querySelector('[aria-checked=true]') as HTMLElement).dataset.v! };
  };
  const path = seg('Path', [['direct', 'Direct'], ['gzip', 'nginx + gzip'], ['fixed', 'gzip + X-Accel-Buffering: no']], 'direct');
  const flush = seg('Writes', [['0', 'one per token'], ['50', '50 ms batches']], '0');

  const actions = h('div', { class: 'lab-actions' });
  const send = h('button', { type: 'button', class: 'lab-btn' }, 'Send prompt');
  const drop = h('button', { type: 'button', class: 'lab-btn ghost', disabled: '' }, 'Drop connection');
  const resume = h('button', { type: 'button', class: 'lab-btn ghost', disabled: '' }, 'Reconnect (Last-Event-ID)');
  actions.append(send, drop, resume);

  const out = h('div', { class: 'lab-chat', 'aria-live': 'off' });
  const track = h('div', { class: 'lab-track', 'aria-hidden': 'true' });
  const stats = h('pre', { class: 'lab-term lab-stats' }, 'first token: -   chunks: -   tokens: -   last id: -');
  root.append(bar, path.el, flush.el, actions, out, track, stats);

  let timers: number[] = [];
  let gen: { tokens: string[]; t0: number; done: boolean } | null = null;
  let conn: { alive: boolean; buffer: number[]; first: number; chunks: number; lastId: number; seen: number[] } | null = null;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const now = () => performance.now() - (gen?.t0 ?? 0);
  const render = () => {
    if (!conn) return;
    stats.textContent = `first token: ${conn.first ? Math.round(conn.first) + ' ms' : '-'}   chunks: ${conn.chunks}   tokens: ${new Set(conn.seen).size}/${N}   last id: ${conn.lastId}`
      + (gen?.done && conn.seen.length ? `   gaps or duplicates: ${conn.seen.filter((v, i) => i && v !== conn!.seen[i - 1] + 1).length}` : '');
  };
  const deliver = (ids: number[]) => {        // a chunk reaches the browser
    if (!conn?.alive || !ids.length) return;
    if (!conn.first) conn.first = now();
    conn.chunks++;
    for (const i of ids) { conn.seen.push(i); out.append(words[i % words.length] + ' '); }
    conn.lastId = ids[ids.length - 1];
    const tick = h('i'); tick.style.left = `${Math.min(100, (now() / 5600) * 100)}%`; tick.style.height = `${Math.min(100, 20 + ids.length * 4)}%`;
    track.append(tick);
    out.scrollTop = out.scrollHeight;
    render();
  };
  // server -> (maybe batching) -> (maybe gzip proxy holding everything) -> browser
  let pending: number[] = [], batchTimer = 0;
  const serverEmit = (i: number) => {
    const p = path.get();
    const ship = (ids: number[]) => (p === 'gzip' ? conn && conn.buffer.push(...ids) : deliver(ids));
    if (flush.get() === '0') return ship([i]);
    pending.push(i);
    batchTimer ||= window.setTimeout(() => { ship(pending); pending = []; batchTimer = 0; }, 50);
  };
  const endOfStream = () => {
    gen!.done = true;
    if (batchTimer) { clearTimeout(batchTimer); batchTimer = 0; const p = pending; pending = []; path.get() === 'gzip' ? conn?.buffer.push(...p) : deliver(p); }
    if (path.get() === 'gzip' && conn?.alive) { const b = conn.buffer; conn.buffer = []; deliver(b); }
    drop.setAttribute('disabled', ''); render();
  };

  send.onclick = () => {
    clear(); out.textContent = ''; track.textContent = '';
    gen = { tokens: [], t0: performance.now(), done: false };
    conn = { alive: true, buffer: [], first: 0, chunks: 0, lastId: -1, seen: [] };
    drop.removeAttribute('disabled'); resume.setAttribute('disabled', '');
    for (let i = 0; i < N; i++) timers.push(window.setTimeout(() => { gen!.tokens.push(String(i)); conn?.alive && serverEmit(i); if (i === N - 1) endOfStream(); }, PREFILL + (i * 1000) / TPS));
    render();
  };
  drop.onclick = () => {
    if (!conn) return;
    conn.alive = false; conn.buffer = [];
    out.append(h('span', { class: 'lab-cut' }, ' [connection dropped] '));
    drop.setAttribute('disabled', ''); resume.removeAttribute('disabled');
  };
  resume.onclick = () => {
    if (!conn || !gen) return;
    resume.setAttribute('disabled', '');
    conn.alive = true;
    out.append(h('span', { class: 'lab-cut' }, ` [Last-Event-ID: ${conn.lastId}] `));
    const missed = gen.tokens.map(Number).filter((i) => i > conn!.lastId);
    if (path.get() !== 'gzip') deliver(missed); else conn.buffer.push(...missed);   // the store replays what was missed
    if (gen.done) endOfStream(); else drop.removeAttribute('disabled');
  };
}

for (const el of document.querySelectorAll<HTMLElement>('[data-lab]')) {
  if (el.dataset.lab === 'py') pyLab(el);
  else if (el.dataset.lab === 'stream') streamLab(el);
  else if (el.dataset.lab === 'icecube') import('./icecube').then((m) => m.icecubeLab(el));
}
