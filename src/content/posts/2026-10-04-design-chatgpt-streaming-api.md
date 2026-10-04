---
title: 'How to Design a ChatGPT-Style Streaming API'
description: 'System design for token streaming at scale: SSE vs WebSockets, resumable streams, KV-cache-aware GPU routing. Every command runs in your browser.'
date: '2026-10-04'
topic: ai
vm:
  setup: 'cd /root/site/labs/llm-streaming'
tags: [system-design, llm-serving, sse, websockets, kv-cache, load-balancing, gpu]
---

**Short answer:** stream tokens over **SSE on HTTP/2**. Let the answer outlive the connection (a stream ID plus replay on reconnect). Batch tokens into ~50 ms writes, and make sure no proxy buffers or compresses the stream. On the GPU side, **send each turn to the GPU that already holds the conversation's cache, unless it's busy.** When the fleet is full, say no early.

That's the interview answer. The rest of the post is why each clause is there: a demo of the bug that motivates it, the requirements and numbers, the design, five deep dives with evidence, and the mistakes most diagrams make. Every command has a **▶ Run** button that runs it on a real Linux machine inside your browser.

## Same answer, 5 seconds late

A fake model streams 200 tokens at 40 tokens/s. Same chat, three routes:

```bash
./lab.sh proxy
```

```text
== direct
first token after 85 ms, 200 tokens in 201 chunks, last at 5106 ms
== nginx defaults (proxy_buffering on)
first token after 84 ms, 200 tokens in 200 chunks, last at 5101 ms
== nginx + gzip on text/event-stream
content-encoding: gzip; first token after 5107 ms, 200 tokens in 1 chunks, last at 5107 ms
```

**Every token was made on time. The user saw nothing for 5 seconds, then everything at once.** The model was fine; the thing in between wasn't. Try it:

<div data-lab="stream"></div>

> **Insight:** Users feel time to first token, not total time. Anything that batches whole responses for efficiency silently turns one into the other.

## Requirements: a million chats, first token in a second

Assumptions for this design (an interview would set its own):

| Functional | Non-functional |
|---|---|
| send a message, get a streamed answer | **1M concurrent chats**, ~10% mid-answer at any moment |
| multi-turn context, up to 128K tokens | first token under ~1 s at p99 once a GPU is free |
| stop generating; resume after a dropped connection | no lost or duplicated tokens on reconnect |
| per-user quotas and rate limits | degrade by saying "busy", never by stalling |

## API: the stream is a resource, not a connection

```text
POST /v1/chats/{chat_id}/turns        {"message": "..."}      -> 202 {"stream_id": "s_81f2"}
GET  /v1/streams/{stream_id}          Accept: text/event-stream, Last-Event-ID: 41
                                      -> id: 42  data: {"delta": "..."}  ...  event: done
POST /v1/streams/{stream_id}/cancel   -> 204
```

**Creating the turn and streaming it are separate calls.** That one choice is what makes resume, a second tab and "stop" simple: the stream is a resource with an ID, not a property of a connection.

## Capacity, back of the envelope

Run it and change the numbers:

```python
chats, active, tps = 1_000_000, 0.10, 40         # open chats, share mid-answer, tokens/s
kb_per_conn, batch_ms = 15, 50                   # measured below
kv_gib_8k = 2.5                                  # Llama 3 70B, bf16, 8K-token context
streaming = chats * active
print(f"gateway RAM        {chats * kb_per_conn / 1e6:,.0f} GB")
print(f"tokens out         {streaming * tps:,.0f} /s")
print(f"writes, unbatched  {streaming * tps:,.0f} /s")
print(f"writes, batched    {streaming * 1000 / batch_ms:,.0f} /s")
print(f"live KV state      {streaming * kv_gib_8k / 1024:,.0f} TiB")
```

Two numbers shape everything: **millions of writes a second at the edge**, and **hundreds of TiB of KV state that can't all stay on GPUs**.

> **Insight:** The edge scales with tokens per second; the GPU fleet scales with bytes of KV state. Different bottlenecks deserve different tiers.

## The design

```fig title="Ten components, one rule: the stream is a resource, and state lives where it's cheapest to keep warm"
layout stack
panel Edge
row
_
client: peer "1. Clients" icon smartphone body "web · mobile · API\nEventSource / fetch"
lb: main "2. Edge / L7 LB" icon globe body "TLS · HTTP/2 · WAF\nno gzip, no buffering on SSE"
panel Control plane
row
router: main "5. KV-aware router" icon route body "cost = uncached work + queue\nsays busy when full"
chat: main "4. Chat service" icon messages-square body "auth · quotas · history (10)\nstable prefix first"
gw: main "3. Stream gateway" icon radio-tower body "holds SSE · ~15 KB/stream\n50 ms write batches"
panel GPU fleet
row
prefill: worker "6. Prefill" icon cpu body "compute-bound\nchunked prefill"
decode: worker "7. Decode" icon zap body "memory-bound · continuous\nbatching · paged KV"
_
panel State
row
kv: shared "9. KV cache tiers" icon layers body "GPU HBM -> CPU RAM -> SSD\nprefix blocks, LRU"
stream: shared "8. Stream store" icon list-ordered body "tokens by stream id + seq\nTTL minutes · replay"
db: shared "10. Conversation DB" icon database body "messages · source of truth\nrebuilds cache on a miss"
client -> lb
lb -> gw
gw -> chat
chat -> router
router -> prefill "new tokens"
prefill -> decode "KV"
prefill <-> kv
decode -> stream
stream -> gw "fan out" via right
```

**Life of a request:**

1. The client `POST`s the turn; the edge terminates TLS and rate-limits.
2. The chat service checks quota, loads history (10), and assembles the prompt with the stable part first.
3. It returns a `stream_id` at once; the client opens `GET /streams/{id}` through the gateway (3).
4. The router (5) picks the GPU with the least *new* work: the one already holding this chat's prefix in its KV cache (9), unless that GPU is busy. If every GPU is busy, it says so now.
5. Prefill (6) computes only the uncached tokens and hands the KV blocks to decode (7).
6. Decode appends tokens to the stream store (8), keyed by stream id and sequence number.
7. The gateway batches new tokens into ~50 ms writes to every subscriber of that stream.
8. On reconnect, the gateway replays from `Last-Event-ID`; on cancel, decode stops at the next step.

The deep dives below are where each of those choices comes from.

## Deep dive 1: pick SSE

| | SSE | WebSocket |
|---|---|---|
| Direction | server to client | both ways |
| Runs over | plain HTTP | its own protocol after an upgrade |
| Resume | built in (`Last-Event-ID`) | build it yourself |
| Proxies, auth, logs | work like any request | need upgrade support everywhere |

A chat answer is one request followed by a one-way stream, which is exactly SSE, and it's what [OpenAI](https://developers.openai.com/api/docs/guides/streaming-responses) and [Anthropic](https://platform.claude.com/docs/en/build-with-claude/streaming) ship. Serve it over HTTP/2: on HTTP/1.1 a browser allows only [6 SSE connections per domain](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) across all tabs. **Reach for WebSockets when the client talks back mid-stream**, as agents with many tool calls do.

> **Insight:** Pick the transport that matches the shape of the traffic. A chat answer is a one-way stream, and SSE gets HTTP's whole toolchain (proxies, auth, logs, HTTP/2) for free.

## Deep dive 2: connections are cheap, token writes are not

10,000 chats against one server, first with one write per token, then with tokens batched into 50 ms writes:

| Writes | Connections that opened | Failed | First token (p50) |
|---|---|---|---|
| one per token | ~5,200 | 106 | 4.4 s |
| 50 ms batches | 10,000 | 0 | 353 ms |

Memory was ~15 KB per open stream, so a million streams is ~15 GB across a fleet. The killer was 400,000 writes a second. SSE and WebSockets failed and recovered the same way. **Size the streaming tier in token writes per second, not connections.** (Measured on a 2-core Linux box; 10,000 streams is too heavy for the machine in your browser.)

> **Insight:** Connection count is a memory problem and cheap; write rate is a CPU problem and expensive. A 50 ms batch trades latency nobody perceives for an order of magnitude of headroom.

## Deep dive 3: never let a hop buffer the stream

That 5-second stall was **compression**, not the usual suspect. nginx's `proxy_buffering` alone didn't delay anything; `gzip` held the whole answer until it ended. One response header fixed it, even with gzip on:

```text
== nginx + gzip, upstream sends X-Accel-Buffering: no
content-encoding: gzip; first token after 88 ms, 200 tokens in 200 chunks, last at 5104 ms
```

```fig title="Every token was on time until the compressor"
seq
c: peer "Client"
n: main "nginx + gzip"
m: worker "Model"
c -> n "GET /sse"
n -> m "forward"
m -> n "token 1 (85 ms)"
m -> n "tokens 2 ... 199: held" lost
m -> n "token 200 (5.1 s)"
n -> c "all 200 at once" lost
```

**Load tests that measure total time pass, and so do direct tests. Only time to first token, through the real edge, catches it.** Also mind idle timeouts while the model thinks (nginx 60 s, AWS ALB 60 s, Cloudflare 125 s) and send an SSE comment line every ~15 s, as the [spec](https://html.spec.whatwg.org/multipage/server-sent-events.html) suggests.

> **Insight:** A streaming system is only as streaming as its least streaming hop, and that hop is usually one nobody on the team thinks of as part of the product.

## Deep dive 4: the answer has to outlive the connection

Phones switch networks and tabs reload. Generate per **stream ID**, keep the tokens, tag each event with `id:`, and the browser sends `Last-Event-ID` on reconnect:

```bash
./lab.sh resume
```

```text
dropped after 20 tokens (last id 19) at 564 ms
reconnected with Last-Event-ID: 19; first replayed id 20, got 180 more
total 200 tokens, unique 200, gaps or duplicates: 0
```

```fig title="Generation keeps going while the client is gone; reconnect replays the gap"
seq
c: peer "Client"
s: shared "Stream store"
m: worker "Model"
m -> s "tokens 0..19"
s -> c "id 0..19"
c -> s "connection drops" lost
m -> s "20..85 (keeps going)"
c -> s "Last-Event-ID: 19"
s -> c "20..199" good
```

OpenAI's API does this with [background mode](https://developers.openai.com/api/docs/guides/background) (`starting_after`), the Vercel AI SDK with [resumable streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams). One catch: **"Stop generating" now needs its own endpoint**, because a closed tab looks like a network blip.

> **Insight:** If losing the connection loses the work, the connection has become part of your storage layer by accident. Give the work an ID and the connection becomes disposable.

## Deep dive 5: where a request lands decides its latency

A conversation's KV cache (the attention state for every token so far) lives on one GPU, and it's big. For Llama 3 70B ([80 layers, 8 KV heads, head dim 128](https://arxiv.org/html/2407.21783)):

```python
layers, kv_heads, head_dim, bytes_bf16 = 80, 8, 128, 2
per_token = 2 * layers * kv_heads * head_dim * bytes_bf16
print(f"{per_token / 1024:.0f} KiB per token")
print(f"{per_token * 8_192 / 2**30:.1f} GiB for an 8K-token chat")
print(f"{per_token * 131_072 / 2**30:.0f} GiB for a 128K-token chat")
```

**Send turn 7 to a GPU that doesn't have turns 1 to 6 and you redo all that work.** So routing is the real design question. Run the fleet simulator: 8 GPUs, 4,000 chats, 20 apps where a few are very popular.

<div data-lab="py" data-src="/labs/llm-streaming/route_sim.py" data-args="--users 4000" data-presets="--users 4000|--users 8000|--users 1500 --cache-tokens 400000|--gpus 16 --users 8000|--zipf 0.5 --users 4000"></div>

```text
policy                    KV hit  TTFT p50  TTFT p99  busiest GPU  idlest GPU
round-robin                 56%     215ms    9789ms         36%        34%
hash(first 1k tokens)       71%     158ms  204235ms         78%         0%
hash(conversation)          77%      57ms     863ms         21%        20%
cache + load cost           75%      75ms     294ms         31%        11%
```

```fig title="Follow the cache until it's busy: the cheapest GPU has the least new work"
row
q: peer "Turn 7 of chat c42" span 3
row
r: main "Router: new work + queue" span 3
row
g3: allow "GPU 3\nhas turns 1-6\n0.205 s"
g5: ask "GPU 5\nidle, no history\n0.215 s"
g1: deny "GPU 1\nempty cache\n0.365 s"
q -> r
r -> g3 "chosen" good
r -> g5 dashed
r -> g1 dashed
```

- **Round-robin** spreads work and wastes it: a 10 s p99.
- **Hashing the first tokens** is the trap. Every chat with the popular app starts the same way, so they all land on one GPU: 78% busy next to one at 0%, and a **204 s p99**. OpenAI's prompt-caching docs warn about the same [overflow on one prefix](https://developers.openai.com/api/docs/guides/prompt-caching).
- **A cost of "uncached work + queue"** wins the tail at 294 ms. It's the shape of [NVIDIA Dynamo's KV router](https://docs.nvidia.com/dynamo/latest/architecture/kv_cache_routing.html); [llm-d](https://llm-d.ai/blog/kvcache-wins-you-can-see) reports 0.54 s vs 92.6 s P90 for this kind of routing over random.

Press `--users 8000` above: **every policy collapses to ~30 s.** Past capacity the answers are admission and architecture: reject early ([Mooncake](https://arxiv.org/abs/2407.00079)), split prefill from decode ([DistServe](https://arxiv.org/abs/2401.09670): 7.4x more requests within latency targets), and chunk long prefills ([Sarathi-Serve](https://arxiv.org/abs/2403.02310)).

> **Insight:** LLM serving is a cache-placement problem disguised as load balancing. The cheapest GPU is the one with the least *new* work, not the shortest queue.

## Data model: four records, four lifetimes

| Record | Key | Lives in | Lifetime |
|---|---|---|---|
| Conversation, messages | `chat_id`, `seq` | conversation DB (10) | forever |
| Stream | `stream_id` -> `{chat_id, status, last_seq}` | stream store (8) | minutes after done |
| Token event | `(stream_id, seq)` | stream store (8) | same as stream |
| KV block | hash(parent block, tokens) | GPU / CPU / SSD tiers (9) | LRU, seconds to hours |

**Keep the stable part of every prompt first and byte-identical** (system prompt, tools, documents): KV blocks are keyed by prefix, and so are the [providers' prompt caches](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

## Failure modes: each one already has an answer

| What breaks | What the user sees | Design answer |
|---|---|---|
| Phone switches network mid-answer | nothing, if done right | stream store + `Last-Event-ID` replay |
| Gateway instance restarts | a reconnect | gateways are stateless; any one can replay a stream |
| Decode GPU dies mid-answer | a pause | re-prefill on another GPU from history + tokens so far, continue the same stream |
| A popular prompt overloads one GPU | slow first tokens for that app | load term in the router; spill to the next-cheapest GPU |
| Whole fleet saturated | "busy, retry in N s" | admission control before prefill, not after |
| A proxy buffers or compresses | answer appears all at once | `X-Accel-Buffering: no`; TTFT checks through the real edge |

## What most system design diagrams get wrong

- **"KV cache in Redis."** The KV cache is GPU memory (with CPU and SSD tiers behind it); a network round trip per token step would be far too slow. Redis-style stores are right for the *stream store* and sessions.
- **Sticky sessions at the load balancer.** That pins a TCP connection, not a cache. Cache affinity belongs in the router, keyed by conversation and prefix, with a load cap.
- **Streaming as a box after inference.** If tokens flow straight from GPU to socket, a dropped connection loses the answer. Put a stream store between them and the reconnect, multi-tab and cancel stories fall out for free.

## Takeaways

1. **Make the stream a resource** (create turn, then stream by id) and serve it over **SSE on HTTP/2**.
2. **Size the edge in token writes per second.** Batch into ~50 ms writes.
3. **Test time to first token through the real edge.** One compressing hop hides the whole answer.
4. **Give every stream an ID and replay**, plus a separate stop endpoint.
5. **Route by cache, capped by load.** Hashing the first tokens makes hot spots.
6. **Past capacity, reject early and split prefill from decode.**

## Try it

Every command above runs on the Linux machine in your browser. To run it on your own box (Node 18+, Python 3 and nginx needed):

```zsh
mkdir llm-lab && cd llm-lab
for f in lab.sh load.mjs nginx-gzip.conf nginx.conf package-lock.json package.json probe-gzip.mjs probe.mjs route_sim.py server.mjs; do curl -sO https://samadeep.github.io/labs/llm-streaming/$f; done
chmod +x lab.sh && ./lab.sh setup && ./lab.sh proxy
```

Found a hop that breaks the stream in a way not covered here? [Open an issue](https://github.com/samadeep/samadeep.github.io/issues) with the trace.

<details>
<summary>Limits and sources</summary>

- The 10,000-connection numbers come from one Node process with the load generator on the same 2-core machine; the ratios are the point. The machine in your browser is real Linux but emulated, so it's slower.
- The fake model emits tokens on a timer. The fleet simulator models queueing plus prefill, not decode, and its parameters are flags; a 400K-token cache changes the gaps (try the preset).
- Paper figures are the authors' best cases; llm-d's are from a project blog. How ChatGPT itself resumes a dropped answer isn't published.
- Serving papers: [Orca](https://www.usenix.org/conference/osdi22/presentation/yu) (continuous batching), [vLLM / PagedAttention](https://arxiv.org/abs/2309.06180), [SGLang](https://arxiv.org/abs/2312.07104), [Splitwise](https://arxiv.org/abs/2311.18677), [Preble](https://arxiv.org/abs/2407.00023), [Llumnix](https://arxiv.org/abs/2406.03243).
- Connection scale: [WhatsApp, 2M sockets on a box](https://blog.whatsapp.com/1-million-is-so-2011), [Phoenix, 2M WebSockets](https://phoenixframework.org/blog/the-road-to-2-million-websocket-connections).
- Edge timeouts: [nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [AWS ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html), [Cloudflare](https://developers.cloudflare.com/fundamentals/reference/connection-limits/).
- The [lab](/labs/llm-streaming/lab.sh) runs on any Linux box with Node, Python and nginx.

</details>
