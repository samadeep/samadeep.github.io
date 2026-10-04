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

## The whole system

```d2 title="The gateway owns connections, the router owns GPUs, the stream store lets one outlive the other"
direction: down
client: Client {class: peer}
gw: "Stream gateway\nSSE connections" {class: main}
store: "Stream store\ntokens by id" {class: shared}
router: "KV-aware router" {class: main}
prefill: "Prefill GPUs" {class: worker}
decode: "Decode GPUs" {class: worker}
client -> gw: "POST /chat, then SSE"
gw -> router: "new turn"
router -> prefill: "uncached tokens only"
prefill -> decode: "KV cache"
decode -> store: tokens
store -> gw: "fan out, replay"
```

Two halves, two different problems: **the gateway is a fan-out problem, the GPU fleet is a memory-placement problem.**

## 1. Pick SSE

| | SSE | WebSocket |
|---|---|---|
| Direction | server to client | both ways |
| Runs over | plain HTTP | its own protocol after an upgrade |
| Resume | built in (`Last-Event-ID`) | build it yourself |
| Proxies, auth, logs | work like any request | need upgrade support everywhere |

A chat answer is one request followed by a one-way stream, which is exactly SSE, and it's what [OpenAI](https://developers.openai.com/api/docs/guides/streaming-responses) and [Anthropic](https://platform.claude.com/docs/en/build-with-claude/streaming) ship. Serve it over HTTP/2: on HTTP/1.1 a browser allows only [6 SSE connections per domain](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) across all tabs. **Reach for WebSockets when the client talks back mid-stream**, as agents with many tool calls do.

## 2. Connections are cheap, token writes are not

10,000 chats against one server, first with one write per token, then with tokens batched into 50 ms writes:

| Writes | Connections that opened | Failed | First token (p50) |
|---|---|---|---|
| one per token | ~5,200 | 106 | 4.4 s |
| 50 ms batches | 10,000 | 0 | 353 ms |

Memory was ~15 KB per open stream, so a million streams is ~15 GB across a fleet. The killer was 400,000 writes a second. SSE and WebSockets failed and recovered the same way. **Size the streaming tier in token writes per second, not connections.** (Measured on a 2-core Linux box; 10,000 streams is too heavy for the machine in your browser.)

## 3. Never let a hop buffer the stream

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

## 4. The answer has to outlive the connection

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

## 5. Where a request lands decides its latency

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

## The interview back-of-envelope

1M open chats, 10% mid-answer, 40 tokens/s each. Run it, change the numbers:

```python
chats, active, tps = 1_000_000, 0.10, 40
kb_per_conn, batch_ms = 15, 50
kv_gib_8k = 2.5                                  # Llama 3 70B, bf16, 8K tokens
streaming = chats * active
print(f"gateway RAM      {chats * kb_per_conn / 1e6:,.0f} GB")
print(f"tokens out       {streaming * tps:,.0f} /s")
print(f"writes unbatched {streaming * tps:,.0f} /s")
print(f"writes batched   {streaming * 1000 / batch_ms:,.0f} /s")
print(f"live KV state    {streaming * kv_gib_8k / 1024:,.0f} TiB")
```

The last line is why routing, eviction and caching tiers exist: that state can't all stay on GPUs. **Keep the stable part of every prompt first and byte-identical** (system prompt, tools, documents), because every cache, from vLLM's to the [providers'](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), matches on prefixes.

## Takeaways

1. **SSE over HTTP/2** for chat.
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
