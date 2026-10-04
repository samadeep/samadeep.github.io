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

That's the interview answer. Below is why each clause is there. Every command has a **▶ Run** button that runs it on a real Linux machine inside your browser.

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

## Requirements

Assumptions for this design (an interview would set its own):

| Functional | Non-functional |
|---|---|
| send a message, get a streamed answer | **1M concurrent chats**, ~10% mid-answer at any moment |
| multi-turn context, up to 128K tokens | first token under ~1 s at p99 once a GPU is free |
| stop generating; resume after a dropped connection | no lost or duplicated tokens on reconnect |
| per-user quotas and rate limits | degrade by saying "busy", never by stalling |

## API

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

## The design

```d2 title="Ten components, one rule: the stream is a resource, and state lives where it's cheapest to keep warm"
grid-columns: 1
grid-gap: 70
edge: "Edge" {
  class: panel
  grid-columns: 2
  grid-gap: 60
  client: "1. Clients" {class: [peer; card]; icon: lucide:smartphone; b: "web · mobile · API\nEventSource / fetch" {class: body}}
  lb: "2. Edge / L7 LB" {class: [main; card]; icon: lucide:globe; b: "TLS · HTTP/2 · WAF\nno gzip, no buffering on SSE" {class: body}}
  client -> lb
}
control: "Control plane" {
  class: panel
  grid-columns: 3
  grid-gap: 60
  router: "5. KV-aware router" {class: [main; card]; icon: lucide:route; b: "cost = uncached work + queue\nsays busy when full" {class: body}}
  chat: "4. Chat service" {class: [main; card]; icon: lucide:messages-square; b: "auth · quotas · history (10)\nstable prefix first" {class: body}}
  gw: "3. Stream gateway" {class: [main; card]; icon: lucide:radio-tower; b: "holds SSE · ~15 KB/stream\n50 ms write batches" {class: body}}
  chat -> router
}
gpu: "GPU fleet" {
  class: panel
  grid-columns: 3
  grid-gap: 60
  prefill: "6. Prefill" {class: [worker; card]; icon: lucide:cpu; b: "compute-bound\nchunked prefill" {class: body}}
  decode: "7. Decode" {class: [worker; card]; icon: lucide:zap; b: "memory-bound · continuous\nbatching · paged KV" {class: body}}
  spacer: "" {width: 300; style: {opacity: 0}}
  prefill -> decode: KV
}
state: "State" {
  class: panel
  grid-columns: 3
  grid-gap: 40
  kv: "9. KV cache tiers" {class: [shared; card]; icon: lucide:layers; b: "GPU HBM -> CPU RAM -> SSD\nprefix blocks, LRU" {class: body}}
  db: "10. Conversation DB" {class: [shared; card]; icon: lucide:database; b: "messages · source of truth\nrebuilds cache on a miss" {class: body}}
  stream: "8. Stream store" {class: [shared; card]; icon: lucide:list-ordered; b: "tokens by stream id + seq\nTTL minutes · replay" {class: body}}
}
edge.lb -> control.gw
control.gw -> control.chat
control.router -> gpu.prefill: "new tokens"
gpu.prefill <-> state.kv
gpu.decode -> state.stream
state.stream -> control.gw: "fan out"
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

## Deep dive 2: connections are cheap, token writes are not

10,000 chats against one server, first with one write per token, then with tokens batched into 50 ms writes:

| Writes | Connections that opened | Failed | First token (p50) |
|---|---|---|---|
| one per token | ~5,200 | 106 | 4.4 s |
| 50 ms batches | 10,000 | 0 | 353 ms |

Memory was ~15 KB per open stream, so a million streams is ~15 GB across a fleet. The killer was 400,000 writes a second. SSE and WebSockets failed and recovered the same way. **Size the streaming tier in token writes per second, not connections.** (Measured on a 2-core Linux box; 10,000 streams is too heavy for the machine in your browser.)

## Deep dive 3: never let a hop buffer the stream

That 5-second stall was **compression**, not the usual suspect. nginx's `proxy_buffering` alone didn't delay anything; `gzip` held the whole answer until it ended. One response header fixed it, even with gzip on:

```text
== nginx + gzip, upstream sends X-Accel-Buffering: no
content-encoding: gzip; first token after 88 ms, 200 tokens in 200 chunks, last at 5104 ms
```

```d2 title="Every token was on time until the compressor"
shape: sequence_diagram
c: Client {class: peer}
n: "nginx + gzip" {class: main}
m: Model {class: worker}
c -> n: "GET /sse"
n -> m
m -> n: "token 1 (85 ms)"
m -> n: "tokens 2 ... 199: held" {class: lost}
m -> n: "token 200 (5.1 s)"
n -> c: "all 200 at once" {class: lost}
```

**Load tests that measure total time pass, and so do direct tests. Only time to first token, through the real edge, catches it.** Also mind idle timeouts while the model thinks (nginx 60 s, AWS ALB 60 s, Cloudflare 125 s) and send an SSE comment line every ~15 s, as the [spec](https://html.spec.whatwg.org/multipage/server-sent-events.html) suggests.

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

```d2 title="Generation keeps going while the client is gone; reconnect replays the gap"
shape: sequence_diagram
c: Client {class: peer}
s: "Stream store" {class: shared}
m: Model {class: worker}
m -> s: "tokens 0..19"
s -> c: "id 0..19"
c -> s: "connection drops" {class: lost}
m -> s: "20..85 (keeps going)"
c -> s: "Last-Event-ID: 19"
s -> c: "20..199" {class: good}
```

OpenAI's API does this with [background mode](https://developers.openai.com/api/docs/guides/background) (`starting_after`), the Vercel AI SDK with [resumable streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams). One catch: **"Stop generating" now needs its own endpoint**, because a closed tab looks like a network blip.

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

```d2 title="Follow the cache until it's busy: the cheapest GPU has the least new work"
direction: down
q: "Turn 7 of chat c42" {class: peer}
r: "Router\nnew work + queue" {class: main}
g3: "GPU 3\nhas turns 1-6\n0.205 s" {class: allow}
g5: "GPU 5\nidle, no history\n0.215 s" {class: ask}
g1: "GPU 1\nempty cache\n0.365 s" {class: deny}
q -> r
r -> g3: chosen {class: good}
r -> g5: {style.stroke-dash: 3}
r -> g1: {style.stroke-dash: 3}
```

- **Round-robin** spreads work and wastes it: a 10 s p99.
- **Hashing the first tokens** is the trap. Every chat with the popular app starts the same way, so they all land on one GPU: 78% busy next to one at 0%, and a **204 s p99**. OpenAI's prompt-caching docs warn about the same [overflow on one prefix](https://developers.openai.com/api/docs/guides/prompt-caching).
- **A cost of "uncached work + queue"** wins the tail at 294 ms. It's the shape of [NVIDIA Dynamo's KV router](https://docs.nvidia.com/dynamo/latest/architecture/kv_cache_routing.html); [llm-d](https://llm-d.ai/blog/kvcache-wins-you-can-see) reports 0.54 s vs 92.6 s P90 for this kind of routing over random.

Press `--users 8000` above: **every policy collapses to ~30 s.** Past capacity the answers are admission and architecture: reject early ([Mooncake](https://arxiv.org/abs/2407.00079)), split prefill from decode ([DistServe](https://arxiv.org/abs/2401.09670): 7.4x more requests within latency targets), and chunk long prefills ([Sarathi-Serve](https://arxiv.org/abs/2403.02310)).

## Data model

| Record | Key | Lives in | Lifetime |
|---|---|---|---|
| Conversation, messages | `chat_id`, `seq` | conversation DB (10) | forever |
| Stream | `stream_id` -> `{chat_id, status, last_seq}` | stream store (8) | minutes after done |
| Token event | `(stream_id, seq)` | stream store (8) | same as stream |
| KV block | hash(parent block, tokens) | GPU / CPU / SSD tiers (9) | LRU, seconds to hours |

**Keep the stable part of every prompt first and byte-identical** (system prompt, tools, documents): KV blocks are keyed by prefix, and so are the [providers' prompt caches](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

## Failure modes

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
