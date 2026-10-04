// One chat, printed as it arrives: when each chunk landed and how many tokens it carried.
//   node probe.mjs <url>            stream once
//   node probe.mjs <url> resume 20  drop the connection after 20 tokens, reconnect with Last-Event-ID
import http from 'node:http';
const [url, mode, cutArg = '20'] = process.argv.slice(2);
const cut = +cutArg;
const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);

function stream(u, lastId) {
  return new Promise((ok) => {
    const ids = [], chunks = [];
    const req = http.get(u, { headers: lastId != null ? { 'last-event-id': String(lastId) } : {} }, (r) => {
      r.on('data', (c) => {
        const got = [...String(c).matchAll(/^id: (\d+)/gm)].map((m) => +m[1]);
        ids.push(...got); chunks.push({ at: ms(), tokens: got.length });
        if (mode === 'resume' && lastId == null && ids.length >= cut) { req.destroy(); ok({ ids, chunks, dropped: true }); }
      });
      r.on('end', () => ok({ ids, chunks }));
    });
    req.on('error', () => {});
  });
}

const a = await stream(url);
if (mode !== 'resume') {
  const c = a.chunks;
  console.log(`first token after ${c[0]?.at} ms, ${a.ids.length} tokens in ${c.length} chunks, last at ${c.at(-1)?.at} ms`);
  console.log('chunk sizes (tokens):', c.slice(0, 12).map((x) => x.tokens).join(' '), c.length > 12 ? '...' : '');
} else {
  const last = a.ids.at(-1);
  console.log(`dropped after ${a.ids.length} tokens (last id ${last}) at ${ms()} ms`);
  await new Promise((r) => setTimeout(r, 1000));
  const b = await stream(url, last);
  const all = [...a.ids, ...b.ids];
  const gaps = all.filter((v, i) => i && v !== all[i - 1] + 1).length;
  console.log(`reconnected with Last-Event-ID: ${last}; first replayed id ${b.ids[0]}, got ${b.ids.length} more`);
  console.log(`total ${all.length} tokens, unique ${new Set(all).size}, gaps or duplicates: ${gaps}`);
}
