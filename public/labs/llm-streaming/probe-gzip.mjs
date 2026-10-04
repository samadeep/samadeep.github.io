// Like probe.mjs, but asks for gzip and decompresses, to see what compression does to a stream.
import http from 'node:http'; import zlib from 'node:zlib';
const t0=performance.now(); const ms=()=>Math.round(performance.now()-t0);
http.get(process.argv[2],{headers:{'accept-encoding':'gzip'}},(r)=>{const g=zlib.createGunzip(); const chunks=[]; let n=0;
 g.on('data',c=>{const k=(String(c).match(/^id: /gm)||[]).length; if(k){n+=k; chunks.push({at:ms(),k});}});
 g.on('end',()=>{console.log(`content-encoding: ${r.headers['content-encoding']}; first token after ${chunks[0].at} ms, ${n} tokens in ${chunks.length} chunks, last at ${chunks.at(-1).at} ms`); console.log('chunk sizes (tokens):', chunks.slice(0,12).map(c=>c.k).join(' '), chunks.length>12?'...':'')});
 r.pipe(g);});
