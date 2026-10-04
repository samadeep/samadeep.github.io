// "Run" on code blocks: a real Linux machine (Alpine on the v86 emulator) in the reader's browser.
// Built by .github/workflows/vm.yml and served from /vm/. Nothing loads until the first Run.
//   ```bash blocks          -> typed into the VM's shell
//   ```python blocks        -> run with python3 in the VM
//   ```text output blocks   -> if the first lines name the command that produced them
//                              ("# condensed from: sudo ./lab.sh dnat-bug"), that command
const article = document.querySelector<HTMLElement>('article[data-vm-setup]');
const XTERM = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0';
const FIT = 'https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0';
const SOURCE_RE = /^#.*?:\s*((?:sudo\s+)?\.\/lab\.sh\s+[\w-]+(?:\s+\d+)?)\s*$/m;

type Term = { write(d: string | Uint8Array): void; onData(f: (d: string) => void): void; focus(): void; cols: number; rows: number; loadAddon(a: unknown): void; open(el: HTMLElement): void };
let dock: HTMLElement | null = null, statusEl: HTMLElement, term: Term, fit: { fit(): void };
let emulator: any = null, booting: Promise<void> | null = null, setupDone = false;

const loadScript = (src: string) => new Promise<void>((ok, fail) => {
  const s = document.createElement('script'); s.src = src; s.onload = () => ok(); s.onerror = fail; document.head.append(s);
});
const css = (href: string) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l); };

function buildDock() {
  dock = document.createElement('section');
  dock.className = 'vm-dock';
  dock.setAttribute('aria-label', 'Linux terminal running in your browser');
  dock.innerHTML = `<div class="vm-bar"><span class="lab-dots" aria-hidden="true"></span><b>lab</b><span class="vm-status">starting</span>
    <span class="vm-sp"></span><button type="button" data-a="ctrlc" title="Send Ctrl-C">Ctrl-C</button>
    <button type="button" data-a="reset" title="Restart the machine">Reset</button><button type="button" data-a="min" aria-label="Minimise">_</button>
    <button type="button" data-a="close" aria-label="Close terminal">✕</button></div><div class="vm-screen"></div>`;
  document.body.append(dock);
  statusEl = dock.querySelector('.vm-status')!;
  dock.querySelector('.vm-bar')!.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a;
    if (a === 'ctrlc') emulator?.serial0_send('\x03');
    if (a === 'min') dock!.classList.toggle('min');
    if (a === 'close') { dock!.hidden = true; document.body.classList.remove('vm-open'); }
    if (a === 'reset') { emulator?.destroy(); emulator = null; booting = null; setupDone = false; term.write('\r\n\x1b[2m[restarting]\x1b[0m\r\n'); boot(); }
  });
}

async function boot() {
  if (booting) return booting;
  booting = (async () => {
    if (!dock) buildDock();
    dock!.hidden = false; dock!.classList.remove('min'); document.body.classList.add('vm-open');
    if (!term) {
      statusEl.textContent = 'loading terminal';
      css(`${XTERM}/css/xterm.css`);
      await loadScript(`${XTERM}/lib/xterm.js`); await loadScript(`${FIT}/lib/addon-fit.js`);
      const w = window as any;
      term = new w.Terminal({ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13, cursorBlink: true, convertEol: false,
        theme: { background: '#000c0b', foreground: '#e8e4d3', cursor: '#00aebb', selectionBackground: '#00aebb55' } });
      fit = new w.FitAddon.FitAddon(); term.loadAddon(fit);
      term.open(dock!.querySelector('.vm-screen') as HTMLElement); fit.fit();
      addEventListener('resize', () => fit.fit());
      term.onData((d) => emulator?.serial0_send(d));
      term.write('\x1b[2mA real Linux machine (Alpine, kernel 6.12) emulated in your browser.\r\nFirst start downloads its memory snapshot once; after that files load as commands touch them.\x1b[0m\r\n\r\n');
    }
    statusEl.textContent = 'starting Linux (first time: about 15-25 MB)';
    const lib = '/vm/libv86.mjs';
    const { V86 } = await import(/* @vite-ignore */ lib);
    emulator = new V86({
      wasm_path: '/vm/v86.wasm', bios: { url: '/vm/seabios.bin' }, vga_bios: { url: '/vm/vgabios.bin' },
      memory_size: 256 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024, autostart: true,
      disable_keyboard: true, disable_mouse: true, disable_speaker: true,
      filesystem: { baseurl: '/vm/flat/', basefs: '/vm/fs.json' },
      initial_state: { url: '/vm/state.bin.zst' },
    });
    let pending: number[] = [], raf = 0;
    emulator.add_listener('serial0-output-byte', (b: number) => {
      pending.push(b);
      raf ||= requestAnimationFrame(() => { term.write(Uint8Array.from(pending)); pending = []; raf = 0; });
    });
    await new Promise<void>((ok) => emulator.add_listener('emulator-ready', () => ok()));
    statusEl.textContent = 'running in your browser';
    emulator.serial0_send(`stty cols ${term.cols} rows ${term.rows}; clear\n`);
  })();
  return booting;
}

async function run(cmd: string) {
  await boot();
  dock!.hidden = false; dock!.classList.remove('min'); term.focus();
  if (!setupDone && article?.dataset.vmSetup) { setupDone = true; emulator.serial0_send(article.dataset.vmSetup + '\n'); }
  emulator.serial0_send(cmd.replace(/\n?$/, '\n'));
}

function blockText(pre: HTMLElement) {
  const lines = pre.querySelectorAll('.ec-line');
  return lines.length ? [...lines].map((l) => l.textContent ?? '').join('\n') : pre.textContent ?? '';
}

// Expressive Code resets styles inside its frames, so the button sits in a bar just below the block.
function addButton(frame: HTMLElement, label: string, cmd: string) {
  const host = frame.closest<HTMLElement>('.expressive-code') ?? frame;
  const bar = document.createElement('div');
  bar.className = 'vm-runbar';
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'vm-run'; b.title = 'Run in a Linux machine in your browser';
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg><span></span>`;
  b.querySelector('span')!.textContent = label;
  b.onclick = () => run(cmd);
  const hint = document.createElement('span');
  hint.className = 'vm-hint'; hint.textContent = 'real Linux, in your browser';
  bar.append(b, hint);
  host.after(bar);
}

if (article) {
  for (const pre of article.querySelectorAll<HTMLElement>('.expressive-code pre[data-language]')) {
    const frame = pre.closest<HTMLElement>('figure.frame');
    if (!frame || pre.closest('[data-lab]')) continue;
    const lang = pre.dataset.language!;
    const text = blockText(pre).replace(/^\$ /gm, '').trim();
    if (lang === 'bash' || lang === 'sh' || lang === 'shell') addButton(frame, 'Run', text);
    else if (lang === 'python') addButton(frame, 'Run', `python3 - <<'PYEOF'\n${text}\nPYEOF`);
    else if (lang === 'text') {
      const m = text.split('\n').slice(0, 3).join('\n').match(SOURCE_RE);
      if (m) addButton(frame, `Run ${m[1].replace(/^sudo /, '')}`, m[1]);
    }
  }
}
