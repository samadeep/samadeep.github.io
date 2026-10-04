// Open N concurrent chats over SSE or WebSocket and report time-to-first-token,
// total time and server memory per open connection.
//   node load.mjs sse 10000 [url]     node load.mjs ws 10000 [url]
import http from 'node:http';
import WebSocket from 'ws';

const [mode = 'sse', nArg = '1000', base = 'http://127.0.0.1:8080'] = process.argv.slice(2);
const N = +nArg;
const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
const stats = () => new Promise((ok) => http.get(base + '/stats', (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => ok(JSON.parse(b))); }));
const pct = (a, p) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];

function sse(i) {
  return new Promise((ok, fail) => {
    const t0 = performance.now(); let first = 0, n = 0;
    http.get(`${base}/sse?id=c${i}-${Date.now()}&prompt=1000`, { agent }, (r) => {
      r.on('data', (c) => { if (!first) first = performance.now() - t0; n += (String(c).match(/^id: /gm) || []).length; });
      r.on('end', () => ok({ first, total: performance.now() - t0, n }));
    }).on('error', fail);
  });
}
function ws(i) {
  return new Promise((ok, fail) => {
    const t0 = performance.now(); let first = 0, n = 0;
    const s = new WebSocket(base.replace('http', 'ws') + '/ws', { perMessageDeflate: false });
    s.on('open', () => s.send(JSON.stringify({ id: `w${i}-${Date.now()}`, prompt: 1000 })));
    s.on('message', (m) => { const str = String(m); if (str.includes('"done"')) { s.close(); return ok({ first, total: performance.now() - t0, n }); } if (!first) first = performance.now() - t0; n += (str.match(/"i":/g) || []).length; });
    s.on('error', fail);
  });
}

const before = await stats();
const w0 = performance.now();
const run = mode === 'ws' ? ws : sse;
const jobs = [];
for (let i = 0; i < N; i++) { jobs.push(run(i)); if (i % 500 === 499) await new Promise((r) => setTimeout(r, 50)); }
await new Promise((r) => setTimeout(r, 1500));
const mid = await stats();                       // all N streams open and mid-answer
const res = await Promise.allSettled(jobs);
const after = await stats();
const serverCpuPct = Math.round(((after.cpu.user + after.cpu.system) - (before.cpu.user + before.cpu.system)) / 1000 / (performance.now() - w0) * 100);
const ok = res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
const ft = ok.map((r) => r.first), tt = ok.map((r) => r.total);
console.log(JSON.stringify({
  mode, N, server_cpu_pct: serverCpuPct, completed: ok.length, failed: N - ok.length,
  tokensPerAnswer: ok[0]?.n,
  open_at_peak: mid.open[mode],
  rss_delta_MB: +((mid.rss - before.rss) / 2 ** 20).toFixed(1),
  KB_per_conn: +((mid.rss - before.rss) / 1024 / Math.max(1, mid.open[mode])).toFixed(1),
  ttft_ms: { p50: Math.round(pct(ft, 0.5)), p99: Math.round(pct(ft, 0.99)) },
  total_ms: { p50: Math.round(pct(tt, 0.5)), p99: Math.round(pct(tt, 0.99)) },
}));
process.exit(0);
