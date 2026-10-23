// <div data-lab="agentbox"></div> -> most agents wait. Drag "share running" and watch how many
// living agents fit on one host under two policies: always-on VMs vs checkpoint-to-idle + memory dedup.
//
// Illustrative model of one host, not vendor figures:
//   HOST 512 GiB.  warmed base image 2 GiB (OS + runtime + browser).
//   active agent  = its share of the base (deduped to ONE copy) + 0.5 GiB private pages.
//   idle agent    = checkpointed, ~0.02 GiB resident.
//   always-on VM  = reserves 2.5 GiB whether it runs or waits.
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

const HOST = 512, BASE = 2, DELTA = 0.5, IDLE = 0.02, VM = 2.5;
const alwaysOn = Math.floor(HOST / VM);                                   // 204, flat
const dedup = (f: number) => Math.floor((HOST - BASE) / (f * DELTA + (1 - f) * IDLE));
const MAXN = dedup(0);                                                    // scale ceiling
const TEAL = '#00aebb', DIM = '#3a514f';

export function agentBoxLab(root: HTMLElement) {
  root.classList.add('lab', 'lab-agentbox');
  root.setAttribute('data-pagefind-ignore', '');
  root.innerHTML = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bar = h('div', { class: 'lab-bar' });
  bar.append(h('span', { class: 'lab-dots', 'aria-hidden': 'true' }), h('span', { class: 'lab-file' }, 'agent-density.sim'), h('span', { class: 'lab-tag' }, 'runs in your browser'));

  // the one knob: what fraction of open sessions are actually running code right now
  const ctl = h('div', { class: 'ab-ctl' });
  const slider = h('input', { type: 'range', min: '0', max: '100', value: '5', class: 'ab-slider', 'aria-label': 'share of agents actually running' }) as HTMLInputElement;
  const val = h('span', { class: 'ab-val', 'aria-live': 'polite' });
  ctl.append(h('span', { class: 'ab-ctl-l' }, 'share actually running'), slider, val);

  // 48 open sessions; teal = running, dim = waiting. Shows that "most are waiting" is the usual state.
  const N = 48, COLS = 16, R = 6, GAP = 20, PAD = 12;
  const vw = PAD * 2 + (COLS - 1) * GAP, rows = Math.ceil(N / COLS), vh = PAD * 2 + (rows - 1) * GAP;
  const svg = s('svg', { viewBox: `0 0 ${vw} ${vh}`, class: 'ab-svg', role: 'img', 'aria-label': '48 agent sessions, most of them waiting' });
  const dots: SVGElement[] = [];
  for (let i = 0; i < N; i++) {
    const cx = PAD + (i % COLS) * GAP, cy = PAD + Math.floor(i / COLS) * GAP;
    dots.push(s('circle', { cx, cy, r: R, fill: DIM }, svg));
  }
  const legend = h('div', { class: 'ab-legend' });
  legend.append(h('span', { class: 'ab-k ab-k-on' }, 'running'), h('span', { class: 'ab-k ab-k-off' }, 'waiting'));

  // two gauges: how many living agents fit on one host
  const mk = (label: string) => {
    const row = h('div', { class: 'ab-gauge' });
    const track = h('span', { class: 'ab-track' }), fill = h('span', { class: 'ab-fill' });
    track.append(fill);
    const count = h('span', { class: 'ab-count' });
    row.append(h('span', { class: 'ab-gl' }, label), track, count);
    return { row, fill, count };
  };
  const g1 = mk('always-on VMs'); g1.fill.classList.add('dim');
  const g2 = mk('checkpoint + dedup');
  const gauges = h('div', { class: 'ab-gauges' });
  gauges.append(g1.row, g2.row);

  const stats = h('pre', { class: 'lab-term lab-stats' });
  root.append(bar, ctl, svg, legend, gauges, stats);

  const logw = (n: number) => Math.log10(Math.max(10, n)) / Math.log10(MAXN);
  function render() {
    const f = +slider.value / 100;
    const n2 = dedup(f);
    val.textContent = `${slider.value}%`;
    g1.fill.style.width = `${(logw(alwaysOn) * 100).toFixed(1)}%`;
    g2.fill.style.width = `${(logw(n2) * 100).toFixed(1)}%`;
    g1.count.textContent = `${alwaysOn}`;
    g2.count.textContent = `${n2.toLocaleString()}`;
    const activeN = Math.round(f * alwaysOn);
    stats.textContent =
      `one 512 GiB host, ${slider.value}% of agents running\n` +
      `  always-on   : ${alwaysOn} agents reserve 2.5 GiB each; ${alwaysOn - activeN} of them just wait\n` +
      `  dedup+idle  : ${n2.toLocaleString()} agents  (base stored once; running pay 0.5 GiB, waiting pay 0.02 GiB)\n` +
      `  ratio       : ${(n2 / alwaysOn).toFixed(n2 / alwaysOn >= 10 ? 0 : 1)}x more on the same box`;
  }

  function roll() {
    const f = +slider.value / 100;
    for (const d of dots) d.setAttribute('fill', Math.random() < f ? TEAL : DIM);
  }
  slider.oninput = () => { render(); roll(); };
  render(); roll();
  if (!reduce) setInterval(roll, 1300);
}
