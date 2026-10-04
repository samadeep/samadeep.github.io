---
title: 'How to Design a ChatGPT-Style Streaming API'
description: 'System design for token streaming at scale: SSE vs WebSockets, resumable streams, KV-cache-aware GPU routing, with a runnable lab and real numbers.'
date: '2026-10-04'
topic: ai
tags: [system-design, llm-serving, sse, websockets, kv-cache, load-balancing, gpu]
---

**Short answer:** stream tokens over **SSE on HTTP/2**, and make the generation outlive the connection (a stream ID, a replay buffer, `Last-Event-ID` on reconnect). Coalesce tokens into ~50 ms writes. Make sure no proxy buffers or compresses the stream. Behind that, **route each turn to the GPU that already holds the conversation's KV cache, but cap it by load**. When the fleet is full, reject early; no routing trick creates capacity.

That's the interview answer. The rest of this post is why each of those clauses is there, with a lab you can run and the papers and engineering blogs behind each claim.

## A 5-second first token from one line of config

I built a fake LLM that streams 200 tokens at 40 tokens/s, and put nginx in front of it. Same chat, three routes:

```text
== direct
first token after 85 ms, 200 tokens in 201 chunks, last at 5106 ms
== nginx defaults (proxy_buffering on)
first token after 84 ms, 200 tokens in 200 chunks, last at 5101 ms
== nginx + gzip on text/event-stream
content-encoding: gzip; first token after 5107 ms, 200 tokens in 1 chunks, last at 5107 ms
```

**The third line is the whole bug class of this system:** every token was generated on time, and the user saw nothing for five seconds, then the entire answer at once. The model was fine. The thing between the model and the user wasn't.

A ChatGPT-style API is two systems joined by a stream: a **connection layer** that has to hold millions of slow, long-lived responses, and a **GPU layer** where the place a request lands decides most of its latency. This post designs both, and breaks each one in a lab first. Everything quoted is from those runs; the [lab](/labs/llm-streaming/lab.sh) reproduces them on any Linux box with Node, Python and nginx.

**Two parts of the lab run right here in your browser**, nothing to install: a streaming demo in Finding 2 and the GPU routing simulator in Finding 4.

## The basics in two minutes

Skip this if you've served an LLM before.

| Term | What it means | Why you care |
|---|---|---|
| **Prefill** | Processing the whole prompt in one pass to build the KV cache | Compute-bound; sets time to first token |
| **Decode** | Generating one token at a time, each reading the whole KV cache | Memory-bandwidth-bound; sets tokens/s |
| **KV cache** | The attention keys and values for every token so far, kept in GPU memory | Reuse it and you skip prefill; lose it and you redo it |
| **TTFT / TPOT** | Time to first token / time per output token | The two latencies users feel |
| **SSE** | Server-Sent Events: one long HTTP response of `data:` lines | How OpenAI and Anthropic stream today |

## The architecture

```plantuml title="Figure 1: the stream gateway owns connections, the router owns GPU placement, and the stream store lets one outlive the other"
@startuml
rectangle "Client\nbrowser / app" <<peer>> as C
rectangle "Edge / L7 load balancer\nTLS, HTTP/2, no buffering" <<main>> as E
rectangle "Stream gateway\nholds SSE connections" <<main>> as G
rectangle "Stream store\ntokens by stream id + seq" <<shared>> as S
rectangle "Chat service\nauth, history, quotas" <<main>> as A
rectangle "KV-aware router\ncost = uncached prefill + queue" <<main>> as R
rectangle "Prefill pool" <<worker>> as P
rectangle "Decode pool" <<worker>> as D
C --> E : POST /chat\nthen SSE
E --> G
G --> A
A --> R
R --> P : new tokens only
P --> D : KV cache
D --> S : tokens
S --> G : fan out,\nreplay on resume
@enduml
```

Read it top to bottom as one request. The only unusual box is the **stream store**: generation writes tokens there, and connections read from it. That single indirection is what makes resume, multiple tabs and "stop generating" possible, and it comes up again in Finding 3.

## Step 1: pick the transport

| | SSE | WebSocket | WebTransport |
|---|---|---|---|
| Direction | server to client | both ways | both ways |
| Runs over | plain HTTP (1.1 or 2) | its own protocol after an upgrade | HTTP/3 (QUIC) |
| Resume | built in: `Last-Event-ID` | build it yourself | build it yourself |
| Backpressure | TCP, through HTTP | the standard API ["doesn't support backpressure"](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) | streams have it |
| Proxies, auth, logs | work as for any HTTP request | need upgrade support everywhere | needs HTTP/3 everywhere |

A chat answer is one request followed by a one-way stream, which is exactly what SSE is. It's also what the big APIs ship. [OpenAI's Chat Completions](https://developers.openai.com/cookbook/examples/how_to_stream_completions) streams "data-only server-sent events". The [Responses API](https://developers.openai.com/api/docs/guides/streaming-responses) uses named events like `response.output_text.delta`. [Anthropic's API](https://platform.claude.com/docs/en/build-with-claude/streaming) sends `message_start`, `content_block_delta` and `message_stop`, plus `ping` events, and warns that new event types may appear.

Two caveats push the choice around:

- **HTTP/1.1 caps a browser at 6 SSE connections per domain**, across all tabs, and Chrome and Firefox marked that ["Won't fix"](https://developer.mozilla.org/en-US/docs/Web/API/EventSource). HTTP/2 multiplexes, so serve SSE over HTTP/2.
- **Agents that call many tools** are chatty in both directions. OpenAI added a [WebSocket mode](https://developers.openai.com/api/docs/guides/websocket-mode) for the Responses API that reports "up to roughly 40% faster" end to end on workflows with 20+ tool calls, with connections capped at 60 minutes.

**Rule of thumb:** SSE for chat, WebSockets when the client talks back mid-stream, WebTransport when you're ready to require HTTP/3.

What about cost per connection? The lab opened 10,000 concurrent chats against one Node process:

| Transport | Open at peak | Server memory per open chat |
|---|---|---|
| SSE | 10,000 | 15.2 KB |
| WebSocket | 9,229 | 10.9 KB |

Both are small. At ~15 KB each, a million open streams is ~15 GB of RAM across a gateway fleet. WhatsApp held [2,277,845 TCP sockets on one box in 2012](https://blog.whatsapp.com/1-million-is-so-2011), and Phoenix reached [2 million WebSockets on one 40-core, 128 GB server](https://phoenixframework.org/blog/the-road-to-2-million-websocket-connections). **Connections are not the hard part.** The first finding shows what is.

## Finding 1: connections are cheap, token writes are not

Same 10,000 chats, first with one write per token (how a naive server streams), then with tokens batched into 50 ms writes:

```text
== sse, FLUSH_MS=0
{"server_cpu_pct":68,"completed":9894,"failed":106,"open_at_peak":5208,
 "ttft_ms":{"p50":4422,"p99":27843},"total_ms":{"p50":13653,"p99":33016}}
== ws, FLUSH_MS=0
{"server_cpu_pct":64,"completed":9836,"failed":164,"open_at_peak":5213,
 "ttft_ms":{"p50":4605,"p99":27826},"total_ms":{"p50":12723,"p99":32877}}
== sse, FLUSH_MS=50
{"server_cpu_pct":93,"completed":10000,"failed":0,"open_at_peak":10000,
 "ttft_ms":{"p50":353,"p99":2179},"total_ms":{"p50":14404,"p99":15302}}
== ws, FLUSH_MS=50
{"server_cpu_pct":85,"completed":10000,"failed":0,"open_at_peak":9229,
 "ttft_ms":{"p50":454,"p99":2895},"total_ms":{"p50":11263,"p99":13160}}
```

With one write per token, **the server never even got all 10,000 connections open**: it peaked at about 5,200, and over a hundred chats failed outright. Median TTFT was 4.4 s. Ten thousand streams at 40 tokens/s is 400,000 writes a second, and the event loop spent its time on those instead of accepting connections. At 1,000 chats the same server had a 250 ms p50 TTFT, so this is load, not a bug.

Batching tokens into 50 ms writes cut TTFT p50 from 4.4 s to 353 ms, and every chat completed. A 50 ms batch is below what a reader notices in text appearing.

> **Lab note:** the transport barely mattered. SSE and WebSocket failed the same way and recovered the same way. The variable was writes per second.

**The rule:** size the streaming tier in **token writes per second**, not connections. Batch at the edge, and expect the box to be CPU-bound on fan-out long before it runs out of memory. Even batched, this single process ran at 93% CPU with answers stretched from 5 s to 14 s, so 10,000 fast streams is more than one Node process on two shared cores can serve.

## Finding 2: a proxy can hold the whole answer

Back to the opening bug. The expected culprit was `proxy_buffering`, nginx's default and the usual suspect in "SSE doesn't stream" threads. It wasn't: with buffering on and nothing else, tokens still arrived one by one (line 2 of the opening output). The [docs](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) describe buffering as reading from the upstream "as soon as possible" into buffers, and in this run that didn't delay delivery to the client. The same page documents the escape hatch: a response header, `X-Accel-Buffering: no`, turns buffering off for that one response.

The real break was **compression**. With `gzip on` for `text/event-stream`, the compressor sat on the stream until the response ended:

```plantuml title="Figure 2: every token was on time until the compressor. Then the user waited for the whole answer"
@startuml
participant "Client" as C
participant "nginx\ngzip on" as N
participant "Model server" as M
C -> N : GET /sse
N -> M : GET /sse
M --> N : token 1 (t=85ms)
M --> N : token 2 ... token 199
note over N : gzip buffers\ncompressed output
M --> N : token 200 (t=5.1s), end
N --> C : all 200 tokens in 1 chunk (t=5.1s)
@enduml
```

One response header from the upstream fixed it, even with gzip still enabled:

```text
== nginx + gzip, upstream sends X-Accel-Buffering: no
content-encoding: gzip; first token after 88 ms, 200 tokens in 200 chunks, last at 5104 ms
```

Try it below: pick a path, send the prompt, and watch where the tokens land. The demo models the lab with timers in your browser; the numbers above are from the real runs.

<div data-lab="stream"></div>

The guards that should have caught it, and didn't:

- **Load tests** that measure total time pass: total time was the same 5.1 s in every route.
- **Tests that go direct to the server** pass: line 1 of the opening output.
- **"Is it streaming?" checks by eye on a short answer** pass: a 10-token answer arrives in under a second either way.

Only a check on **time to first token, through the real edge,** catches it. nginx is just the proxy I tested. Any hop that compresses or buffers whole responses (a CDN, an API gateway, compression middleware in your app) can do the same.

Timeouts are the other edge trap, because an LLM can think silently for a while before the first token:

| Hop | Default | Source |
|---|---|---|
| nginx `proxy_read_timeout` | 60 s between two reads | [nginx docs](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) |
| AWS ALB idle timeout | 60 s (1 to 4000 s) | [AWS docs](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html) |
| Cloudflare proxy read timeout | 125 s, raise only on Enterprise, returns 524 | [Cloudflare docs](https://developers.cloudflare.com/fundamentals/reference/connection-limits/) |

The SSE spec has the fix built in: send a comment line (`:`) ["every 15 seconds or so"](https://html.spec.whatwg.org/multipage/server-sent-events.html). The lab server does exactly that, and Anthropic's `ping` events play the same role.

## Finding 3: the answer has to outlive the connection

Phones switch networks, laptops sleep, and a tab reloads. If generation is tied to the HTTP request, every drop throws away GPU work and the user gets half an answer. So the lab server generates per **stream ID**, keeps the tokens, and tags each SSE event with `id:`. The browser's `EventSource` sends the last one back as `Last-Event-ID` when it reconnects:

```text
dropped after 20 tokens (last id 19) at 564 ms
reconnected with Last-Event-ID: 19; first replayed id 20, got 180 more
total 200 tokens, unique 200, gaps or duplicates: 0
```

```plantuml title="Figure 3: generation keeps going while the client is gone; the reconnect replays from the last id it saw"
@startuml
participant "Client" as C
participant "Gateway" as G
participant "Stream store" as S
participant "Model" as M
C -> G : GET /sse?id=r1
M -> S : tokens 0..19
S -> G
G -> C : id 0..19
C ->x G : network drops
M -> S : tokens 20..85 (keeps going)
C -> G : GET /sse?id=r1\nLast-Event-ID: 19
S -> G : replay 20..85, then live
G -> C : id 20..199
@enduml
```

**The rule: the stream is a resource with an ID, not a property of a connection.** The production versions look the same:

- **OpenAI background mode:** you set `background: true`, save each event's `sequence_number`, and reconnect with `starting_after`. "the response continues running and you can reconnect" ([docs](https://developers.openai.com/api/docs/guides/background)).
- **Vercel AI SDK resumable streams:** stores an `activeStreamId` per chat in Redis and returns 204 when nothing is running ([docs](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)).

One consequence the AI SDK docs call out: once a dropped connection no longer stops generation, **"Stop generating" needs its own endpoint**, because closing the tab is now indistinguishable from a network blip.

## Where the time goes on the GPU

Prefill and decode are different workloads on the same hardware. [Splitwise](https://arxiv.org/abs/2311.18677) describes prompt processing as compute-intensive and token generation as memory-intensive. Three ideas from the serving papers carry most of the weight:

- **Continuous batching** ([Orca, OSDI '22](https://www.usenix.org/conference/osdi22/presentation/yu)): schedule one iteration at a time, so a finished request leaves and a new one joins without waiting for the slowest in its batch. Orca reported 36.9x throughput over FasterTransformer at the same latency on GPT-3 175B.
- **PagedAttention** ([vLLM, SOSP '23](https://arxiv.org/abs/2309.06180)): before it, only 20.4% to 38.2% of KV cache memory held actual token state. Paging the cache into blocks brought waste near zero and throughput up 2 to 4x.
- **Prefix caching**: if two requests share a prefix, reuse its KV blocks instead of recomputing them. vLLM hashes each full block together with its parent's hash and has this [on by default](https://docs.vllm.ai/en/latest/design/prefix_caching.html). [SGLang's RadixAttention](https://arxiv.org/abs/2312.07104) reports up to 6.4x throughput on multi-turn chat, agent and RAG workloads.

**Why the KV cache dominates the design.** Per token it costs `2 × layers × kv_heads × head_dim × bytes`. Llama 3 70B has [80 layers, 8 KV heads (GQA) and head dim 128](https://arxiv.org/html/2407.21783), so in bf16:

```text
2 × 80 × 8 × 128 × 2 bytes = 327,680 bytes ≈ 320 KiB per token
   8K-token chat  ≈ 2.5 GiB
 128K-token chat  ≈ 40 GiB
```

A long conversation's cache is gigabytes of state sitting on one specific GPU. Rebuilding it means re-running prefill on the whole history. **Sending turn 7 of a chat to a GPU that doesn't have turns 1 to 6 is the most expensive mistake this system can make.** That makes routing the central question.

## Finding 4: where a request lands decides its latency

I wrote a [small simulator](/labs/llm-streaming/route_sim.py) of a GPU fleet to compare routing policies:

- 8 GPUs, each with a 1.5M-token KV cache (LRU) and prefill at 20,000 tokens/s.
- 4,000 users having 8-turn chats with 20 apps whose popularity follows Zipf, so a few apps get most of the traffic.
- Each prompt is a 3,000-token system prompt plus the history so far.

TTFT here is queue time plus prefill:

```text
policy                    KV hit  TTFT p50  TTFT p99  busiest GPU  idlest GPU
round-robin                 56%     215ms    9789ms         36%        34%
least-loaded                56%     194ms    6799ms         38%        37%
hash(first 1k tokens)       71%     158ms  204235ms         78%         0%
hash(conversation)          77%      57ms     863ms         21%        20%
cache + load cost           75%      75ms     294ms         31%        11%
```

**Round-robin and least-loaded** spread work perfectly and waste it: they only hit the shared system prompt, never the conversation's own history, so the p99 is 7 to 10 s.

**Hashing the first tokens** looks like the obvious prefix-aware fix, and it's the dead end. Every chat with the most popular app shares the same first 1,000 tokens, so they all land on one GPU: 78% busy while another sits at 0%, and a **p99 of 204 seconds**. OpenAI's prompt caching docs describe the same effect: requests are routed by a hash of the initial prefix, and traffic above about 15 requests per minute on one prefix [can overflow to other machines and lower hit rates](https://developers.openai.com/api/docs/guides/prompt-caching).

**Hashing the conversation** keeps each chat on its GPU, so the history stays warm: 77% hit, p99 under a second.

**A cost function** does best on the tail, at 294 ms. It sends each request to the GPU with the least `uncached prefill work + queued work`, so it follows the cache until a GPU gets busy, then spills. It's the same shape as [NVIDIA Dynamo's KV router](https://docs.nvidia.com/dynamo/latest/architecture/kv_cache_routing.html) (`overlap_score_weight × prefill_blocks + decode_blocks`). Its hit rate is two points below conversation hashing because it trades some cache hits for balance on purpose.

Run the simulator yourself. This is the same `route_sim.py` that produced the table, running in your browser with [Pyodide](https://pyodide.org). Change the flags, or open the code and change the policies:

<div data-lab="py" data-src="/labs/llm-streaming/route_sim.py" data-args="--users 4000" data-presets="--users 4000|--users 8000|--users 1500 --cache-tokens 400000|--gpus 16 --users 8000|--zipf 0.5 --users 4000"></div>

```plantuml title="Figure 4: follow the cache until it's busy. The cheapest GPU is the one with the least new work, not the shortest queue"
@startuml
rectangle "Turn 7 of chat c42\nprompt: 7,300 tokens" <<peer>> as Q
rectangle "Router\nper GPU: uncached tokens / prefill rate\n+ queued seconds" <<main>> as R
rectangle "GPU 3\nhas c42 turns 1-6\n100 new tokens, queue 0.2s\ncost 0.205s" <<allow>> as G3
rectangle "GPU 5\nidle, has system prompt only\n4,300 new tokens\ncost 0.215s" <<ask>> as G5
rectangle "GPU 1\nempty cache\n7,300 new tokens\ncost 0.365s" <<deny>> as G1
Q --> R
R --> G3 : chosen
R ..> G5
R ..> G1
@enduml
```

The production systems publish bigger versions of the same result:

- **llm-d** ([blog](https://llm-d.ai/blog/kvcache-wins-you-can-see); Qwen-32B, 16 H100s): precise prefix-cache-aware routing got a P90 TTFT of 0.54 s, against 92.6 s for random routing, and 8,730 against 4,429 tokens/s. That's a project blog, not a peer-reviewed paper.
- **Preble** ([paper](https://arxiv.org/abs/2407.00023)), which schedules for both reuse and load: 2 to 10x better p99 than prior systems.
- **Kubernetes Gateway API Inference Extension** ([project](https://gateway-api-inference-extension.sigs.k8s.io/)): makes this a standard component, an endpoint picker that routes on signals like prefix cache state.

## Finding 5: when the fleet is full, routing can't save you

Same simulator, double the users, same 8 GPUs (three of the five rows shown; `./lab.sh route` prints all):

```text
policy                    KV hit  TTFT p50  TTFT p99  busiest GPU  idlest GPU
round-robin                 54%   35473ms  101461ms         68%        68%
hash(conversation)          57%   27563ms   98715ms         62%        61%
cache + load cost           57%   27441ms   94832ms         67%        58%
```

Every policy collapses to a p50 near 30 s. Under pressure the caches churn, hit rates fall back toward the system-prompt floor, and the work outruns the fleet. **Past capacity, the design answers are admission and architecture, not routing:**

- **Reject early.** [Mooncake](https://arxiv.org/abs/2407.00079), Kimi's serving system, predicts load and turns requests away at the door rather than accepting work it will serve late. A fast "busy, retry" beats a 30 s first token.
- **Split prefill from decode.** When they share GPUs, long prefills stall everyone's decoding. [DistServe](https://arxiv.org/abs/2401.09670) separates them and reports 7.4x more requests served within latency targets. [Splitwise](https://arxiv.org/abs/2311.18677) reports 1.4x throughput at 20% lower cost.
- **Chunk long prefills.** [Sarathi-Serve](https://arxiv.org/abs/2403.02310) splits each prefill into chunks so decodes keep flowing, for 2.6x to 5.6x more serving capacity under tail-latency targets.
- **Move requests when a GPU gets hot.** [Llumnix](https://arxiv.org/abs/2406.03243) live-migrates requests and their KV state between instances, for about 10x better tail latency.

## Caching the context window, layer by layer

"Cache the context" means four different things, at four timescales:

| Layer | What's cached | Lifetime | Example |
|---|---|---|---|
| GPU memory | KV blocks of active and recent prefixes | seconds to minutes | vLLM prefix caching, LRU |
| CPU / SSD tier | KV blocks evicted from GPU | minutes to hours | Mooncake's KVCache pool from spare DRAM and SSD |
| Provider prompt cache | your prompt prefix, billed cheaper | 5 min to 24 h | OpenAI: [from 1,024 tokens on current models, reads at 0.1x](https://developers.openai.com/api/docs/guides/prompt-caching); Anthropic: [5 min or 1 h TTL, reads at 0.1x on most models](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) |
| Conversation store | the messages themselves | forever | your database; rebuilds the KV cache when all else misses |

For an application builder the provider row is the actionable one: **keep the stable part of the prompt first and byte-identical** (system prompt, tools, documents), and append the changing part at the end, because every cache above matches on prefixes.

## The interview version: a back-of-envelope

Assume 1M concurrent chats, 10% of them mid-answer at any moment, and 40 tokens/s per answer:

```text
open connections      1,000,000 × ~15 KB (lab, SSE)      ≈ 15 GB RAM across the gateway fleet
tokens out            100,000 × 40 tokens/s               = 4,000,000 tokens/s
writes, unbatched     4,000,000/s  (Finding 1: this is what melts the gateway)
writes, 50 ms batches 100,000 × 20/s                      = 2,000,000/s
KV state, 8K context  100,000 × 2.5 GiB (70B, bf16)       ≈ 244 TiB live, so it can't all stay on GPUs
```

The last line is why the routing, eviction and tiering sections exist. **The gateway is a fan-out problem and the GPU fleet is a memory-placement problem.** Most of the design follows from those two facts.

## What this lab doesn't show

- **The streaming numbers come from one Node process** with the load generator on the same 2-core machine. Absolute figures will differ on real hardware; the ratios (per-token writes vs batched, gzip vs not) are the point.
- **The fake model isn't a GPU.** It emits tokens on a timer. Decode contention, batching and memory pressure are only in the simulator, and decode isn't in the simulator either: TTFT there is queueing plus prefill.
- **The simulator's parameters are illustrative.** Cache size, prefill speed and the app distribution are flags, and they move the results. In a run with 1,500 users and a 400K-token cache per GPU, conversation hashing's p99 (534 ms) fell behind round-robin's (400 ms), because chats got evicted before their next turn. The cost function still had the best tail (287 ms), and hashing the first tokens was still the worst by far (22 s).
- **Paper numbers are the authors' best-case "up to" figures** on their own setups, and the llm-d numbers come from a project blog.
- **How ChatGPT itself resumes a dropped answer isn't published.** I found nothing official, so Finding 3 uses OpenAI's API background mode and the Vercel AI SDK instead.

## Key takeaways

1. **SSE over HTTP/2** for chat. It's plain HTTP, resume is built in, and it's what OpenAI and Anthropic ship.
2. **Size the edge in token writes per second.** Batch tokens into ~50 ms writes.
3. **Test time to first token through the real edge.** A compressor or buffering hop hides the whole answer and passes every other test.
4. **Give every stream an ID and a replay buffer**, and a separate stop endpoint.
5. **Route by cache, capped by load.** Hashing the first tokens creates hot spots; conversation affinity plus a load term wins the tail.
6. **Past capacity, reject early and split prefill from decode.** Routing can't create GPUs.

The opening bug took one header to fix and none of the usual checks caught it. Clone the lab, point `probe.mjs` at your own endpoint, and check where your first token goes. If a hop on your path breaks the stream in a way this post doesn't cover, [open an issue on the repo](https://github.com/samadeep/samadeep.github.io/issues) with the trace.
