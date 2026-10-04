// A fake LLM behind two transports, so the transport is the only variable.
//   GET /sse?prompt=<n tokens>&id=<stream id>   Server-Sent Events, resumable with Last-Event-ID
//   WS  /ws                                     WebSocket, same token stream
//   GET /stats                                  process memory and open streams
// "Model": prefill costs PREFILL_MS_PER_1K per 1000 prompt tokens, then one token every 1000/TPS ms.
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = +(process.env.PORT ?? 8080);
const TPS = +(process.env.TPS ?? 40);                 // decode speed per stream
const OUT = +(process.env.OUT ?? 200);                // tokens per answer
const PREFILL_MS_PER_1K = +(process.env.PREFILL_MS_PER_1K ?? 50);
const KEEP_MS = 60_000;                               // keep finished streams this long for resume
const FLUSH_MS = +(process.env.FLUSH_MS ?? 0);        // 0 = one write per token; >0 = coalesce tokens per connection

const words = 'the cache hit rate depends on where the request lands so route by prefix not by load alone'.split(' ');
const streams = new Map();   // id -> { tokens: [], done, subs:Set<fn> }
let open = { sse: 0, ws: 0 };

// One generation per stream id, independent of any connection: a dropped client does not stop it.
function generate(id, promptTokens) {
  if (streams.has(id)) return streams.get(id);
  const s = { tokens: [], done: false, subs: new Set() };
  streams.set(id, s);
  setTimeout(() => {
    let i = 0;
    const t = setInterval(() => {
      const tok = words[i % words.length] + ' ';
      s.tokens.push(tok);
      for (const f of s.subs) f(i, tok);
      if (++i >= OUT) { clearInterval(t); s.done = true; for (const f of s.subs) f(-1); setTimeout(() => streams.delete(id), KEEP_MS); }
    }, 1000 / TPS);
  }, (promptTokens / 1000) * PREFILL_MS_PER_1K);
  return s;
}

// Per-connection writer. FLUSH_MS=0 writes every token immediately; otherwise tokens that
// arrive within FLUSH_MS go out in one write (one syscall, one frame) instead of one each.
function coalesce(write, fmt, finish) {
  let buf = '', timer = null;
  const flush = () => { if (timer) { clearTimeout(timer); timer = null; } if (buf) { write(buf); buf = ''; } };
  return (i, tok) => {
    if (i < 0) return finish(flush);
    if (!FLUSH_MS) return write(fmt(i, tok));
    buf += fmt(i, tok);
    timer ??= setTimeout(flush, FLUSH_MS);
  };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/stats') {
    const m = process.memoryUsage();
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ rss: m.rss, heapUsed: m.heapUsed, cpu: process.cpuUsage(), open, streams: streams.size }));
  }
  if (u.pathname !== '/sse') { res.writeHead(404); return res.end(); }

  const id = u.searchParams.get('id') ?? Math.random().toString(36).slice(2);
  const from = req.headers['last-event-id'] != null ? +req.headers['last-event-id'] + 1 : 0;
  const s = generate(id, +(u.searchParams.get('prompt') ?? 1000));
  const headers = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' };
  if (process.env.NO_BUFFER_HEADER !== '1') headers['x-accel-buffering'] = 'no';
  res.writeHead(200, headers);
  open.sse++;
  const send = coalesce((chunk) => res.write(chunk), (i, tok) => `id: ${i}\ndata: ${JSON.stringify(tok)}\n\n`,
    (flush) => { flush(); res.end('event: done\ndata: [DONE]\n\n'); });
  for (let i = from; i < s.tokens.length; i++) send(i, s.tokens[i]);   // replay what was missed
  if (s.done) return send(-1);
  s.subs.add(send);
  const ka = setInterval(() => res.write(': ka\n\n'), 15_000);        // spec-recommended keepalive comment
  req.on('close', () => { s.subs.delete(send); clearInterval(ka); open.sse--; });
});

const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false });
wss.on('connection', (ws) => {
  open.ws++;
  ws.on('message', (raw) => {
    const { id, prompt = 1000, from = 0 } = JSON.parse(raw);
    const s = generate(id, prompt);
    const send = coalesce((chunk) => ws.send(chunk), (i, tok) => JSON.stringify({ i, tok }) + '\n',
      (flush) => { flush(); ws.send('{"done":true}'); });
    for (let i = from; i < s.tokens.length; i++) send(i, s.tokens[i]);
    if (s.done) return send(-1);
    s.subs.add(send);
    ws.on('close', () => s.subs.delete(send));
  });
  ws.on('close', () => open.ws--);
});

server.listen(PORT, () => console.log(`fake LLM on :${PORT}  TPS=${TPS} OUT=${OUT} FLUSH_MS=${FLUSH_MS} prefill=${PREFILL_MS_PER_1K}ms/1k`));
