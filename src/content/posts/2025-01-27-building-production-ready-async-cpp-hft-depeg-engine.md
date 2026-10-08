---
title: 'Building an Async C++ Depeg Engine: From Sync to 500x'
description: 'How a once-a-minute stablecoin depeg checker became an async C++ engine: event bus, lock-free queue, priority workers and circuit breakers, step by step.'
hook:
  stat: '1,000 → 100,000'
  caption: 'market data points a second, sync engine → async engine'
date: '2025-01-27'
updated: '2026-10-08'
topic: low-latency
series: build-logs
tags: [cpp, high-frequency-trading, async-programming, lock-free, stablecoin, performance]
---

Here's where it started:

```cpp
// Before: Basic synchronous approach
void detect_depeg() {
    while (true) {
        auto data = fetch_market_data("USDT");  // Blocking call
        auto risk = calculate_risk(data);       // Single-threaded

        if (risk > 0.7) {
            std::cout << " Alert! USDT risk detected!" << std::endl;
        }

        std::this_thread::sleep_for(std::chrono::seconds(60));
    }
}
```

One coin. One check. Then sixty seconds of sleep. When a stablecoin slips off its $1.00 peg, the opportunity (and the risk) can come and go well inside that minute, and this loop would never see it.

This is the story of how I transformed a basic synchronous C++ stablecoin depeg detection system into a production-ready, high-frequency trading engine capable of processing 100,000+ data points per second with sub-millisecond latency.

## Where it needed to go

My journey began with a simple console application that could detect when stablecoins like USDT or USDC deviated from their $1.00 peg. It worked, but look at what that loop gets wrong: every network call blocks, one thread does everything, one failed fetch can stall the whole thing, and the only "monitoring" is a line printed to the console.

I envisioned a system that could:

- Process **100,000+ market data points per second**
- Deliver **sub-millisecond prediction latency**
- Handle **multiple asset classes** simultaneously
- Provide **professional monitoring** and alerting
- Scale **horizontally** across multiple instances

That's three orders of magnitude more data, with latency going *down*. You don't get there by making the loop faster. You get there by deleting the loop.

## Stop polling, start reacting

The fix for "check once a minute" is to stop checking at all. Market data arrives as events, and everything downstream reacts to events. Nothing sleeps, and nothing waits for anything it doesn't need.

```fig title="Data flows one way through queues; nothing on the hot path waits on anything else"
row
src: peer "exchanges + chains\nWebSocket · REST · RPC"
agg: worker "data aggregator"
q: shared "lock-free queues"
row
bus: main "event bus" span 3
row
pred: worker "prediction engine\nfeatures + models"
alert: allow "alert manager\nemail · Slack · webhook"
health: ask "health + circuit breakers"
src -> agg
agg -> q
q -> bus "MARKET_DATA_UPDATE"
bus -> pred
bus -> alert "ALERT_GENERATED"
bus -> health
```

The backbone is an **event bus**: components publish events (`MARKET_DATA_UPDATE`, `RISK_THRESHOLD_BREACH`, `ALERT_GENERATED`) and subscribe to the ones they care about. The data aggregator doesn't know the prediction engine exists; it just publishes.

```cpp
class EventBus {
    std::unordered_map<EventType, std::vector<EventHandler>> handlers_;
    std::shared_mutex handlers_mutex_;          // many readers dispatch, rare writers subscribe
    std::deque<std::shared_ptr<Event>> queue_;
    std::mutex queue_mutex_;
    std::condition_variable ready_;
    bool running_ = true;

public:
    void subscribe(EventType type, EventHandler handler) {
        std::unique_lock lock(handlers_mutex_);
        handlers_[type].push_back(std::move(handler));
    }

    void publish(std::shared_ptr<Event> event) {
        { std::lock_guard lock(queue_mutex_); queue_.push_back(std::move(event)); }
        ready_.notify_one();                     // wake one sleeping dispatcher
    }

    void process_events() {                      // run on each dispatcher thread
        for (;;) {
            std::shared_ptr<Event> event;
            {
                std::unique_lock lock(queue_mutex_);
                ready_.wait(lock, [&] { return !queue_.empty() || !running_; });   // sleep, don't spin
                if (!running_ && queue_.empty()) return;
                event = std::move(queue_.front());
                queue_.pop_front();
            }
            std::shared_lock lock(handlers_mutex_);
            if (auto it = handlers_.find(event->type); it != handlers_.end())
                for (const auto& handler : it->second) handler(event);
        }
    }
};
```

Notice the `wait` in `process_events`. An earlier version of this bus signalled a condition variable that nothing ever waited on, so its dispatchers spun at 100% CPU even when the market was quiet. A dispatcher should sleep until there's work.

## Never let the hot path take a lock

Market data is the firehose. Several feed threads push into it at once, and if every push grabs a mutex, the feeds end up queuing behind each other. So I implemented custom lock-free data structures. The one on the hot path is a classic **multi-producer, single-consumer** queue: any number of threads can push with one atomic exchange, and exactly one thread pops.

```cpp
template <typename T>
class MpscQueue {
    struct Node {
        std::atomic<Node*> next{nullptr};
        T value{};
    };
    std::atomic<Node*> tail_;   // producers swing this with one atomic exchange
    Node* head_;                // touched by the single consumer only

public:
    MpscQueue() : tail_(new Node), head_(tail_.load()) {}   // a dummy node, so push and pop never meet on nullptr

    void push(T item) {                                       // safe from any number of threads
        Node* node = new Node;
        node->value = std::move(item);
        Node* prev = tail_.exchange(node, std::memory_order_acq_rel);
        prev->next.store(node, std::memory_order_release);    // publish: the consumer can now see it
    }

    bool try_pop(T& out) {                                    // ONE consumer thread only
        Node* next = head_->next.load(std::memory_order_acquire);
        if (!next) return false;                              // empty, or a push is half-way through
        out = std::move(next->value);
        delete head_;                                         // the old dummy goes; `next` becomes the dummy
        head_ = next;
        return true;
    }
};
```

That "ONE consumer" comment isn't decoration. Here's the queue under ThreadSanitizer, first used as designed, then with a second consumer:

```zsh
$ g++ -std=c++20 -O1 -g -fsanitize=thread -o mpsc mpsc_queue.cpp -pthread
$ ./mpsc 1
4 producers, 1 consumer(s): popped 80000 items, sum correct
$ ./mpsc 2
WARNING: ThreadSanitizer: heap-use-after-free
    #0 MpscQueue<long>::try_pop(long&) mpsc_queue.cpp:35
SUMMARY: ThreadSanitizer: data race ... in operator delete(void*, unsigned long)
```

With two consumers, both can read the same `head_`, and one deletes a node the other is still using. The earlier version of this queue was advertised as safe for everyone and also forgot the dummy node, so its very first push dereferenced garbage. Lock-free code is only as good as the tests you run it under, and a sanitizer catches in seconds what a code review misses for months.

> **Insight:** "Lock-free" is a promise about one specific usage pattern, never about the whole class. Write the pattern down (here: many producers, one consumer) and test exactly that, under a sanitizer.

## Not all work is equal

Once data flows, the next bottleneck is deciding what runs first. A fresh price tick matters more than a log rotation. So I implemented priority-based worker pools: four queues, and a free worker always drains the most urgent one first.

```cpp
enum class TaskPriority {
    CRITICAL = 0,  // Market data processing
    HIGH = 1,      // Risk calculations
    MEDIUM = 2,    // Analytics
    LOW = 3        // Maintenance
};

std::function<void()> get_next_task() {
    // Process highest priority tasks first
    for (auto& queue : priority_queues_) {
        if (!queue.empty()) {
            auto task = queue.front();
            queue.pop();
            return task;
        }
    }
    return nullptr;
}
```

Strict priority has one sharp edge: if critical work never stops arriving, maintenance never runs. For a trading engine that's usually the right trade, but it's a choice you should make on purpose.

## When an exchange goes down

Exchanges fail, rate-limit and time out. Without protection, one dead API means every worker piles up waiting on it. A **circuit breaker** wraps each external call: after enough failures it opens and fails fast, then lets a single trial request through to see if the service is back.

```fig title="A circuit breaker turns a dead dependency into a fast failure instead of a pile-up"
row
closed: allow "CLOSED\ncalls go through"
open: deny "OPEN\nfail fast, no call"
half: ask "HALF-OPEN\none trial call"
closed -> open "failures ≥ threshold"
open -> half "recovery timeout"
half -> closed "trial succeeds" good via below
```

If the trial fails, it goes straight back to OPEN. The point isn't to make the exchange work, it's to keep the rest of the engine fast while it doesn't.

## Logs a machine can read

The last change was the least glamorous and maybe the most useful. That first loop "alerted" by printing to the console:

```cpp
// Before
std::cout << " Alert! USDT risk detected!" << std::endl;

// After: structured, and written by its own thread off the hot path
LOG_ALERT("DEPEG_RISK", "High risk detected for USDT", {
    {"symbol", "USDT"},
    {"risk_level", "HIGH"},
    {"confidence", "0.87"},
    {"trigger", "price_deviation_exceeded"},
    {"price_deviation", "0.23%"},
    {"volume_anomaly", "45%"}
});
```

Now every alert says *why* it fired, and you can search, graph and alert on the fields.

## Where it ended up

| Metric | Before (Sync) | After (Async) | **Improvement** |
|--------|---------------|---------------|-----------------|
| **Data Ingestion** | 1,000 pts/sec | 100,000 pts/sec | **100x** |
| **Prediction Latency** | 50ms | 500μs | **100x** |
| **Alert Processing** | 10 alerts/sec | 1,000 alerts/sec | **100x** |
| **Memory Usage** | 2GB | 512MB | **4x reduction** |
| **CPU Efficiency** | 40% | 85% | **2.1x** |
| **Overall Throughput** | 100 ops/sec | 50,000 ops/sec | **500x** |

Latency: P50 100μs, P95 500μs, P99 2ms, P99.9 10ms, and a 50ms maximum during GC or system events.

The system now processes over **100,000 market data points per second**, delivers **sub-millisecond prediction latency**, and maintains **99.99% uptime** in production environments. It's been deployed by institutional traders, DeFi protocols, and market makers worldwide, protecting billions of dollars in cryptocurrency assets.

From a loop that slept sixty seconds between checks to a hundred thousand data points a second, and none of it came from a faster loop. It came from deleting the loop: react to events, keep locks off the hot path, decide what matters most, and fail fast when the world breaks.

*The complete source code and detailed implementation guides are available in my [GitHub repository](https://github.com/samadeep/async-hft-engine).*

<details>
<summary>Code notes and further reading</summary>

- The queue, event bus and worker pool shown here are the essential parts, corrected in October 2026: the queue is documented and tested as single-consumer and gained its dummy node; the event bus uses a `shared_mutex` and sleeps instead of spinning. The full queue test is at [`/labs/hft-depeg/mpsc_queue.cpp`](/labs/hft-depeg/mpsc_queue.cpp) and needs `g++` with ThreadSanitizer.
- The performance table and latency figures are from the original build and were not re-measured for this rewrite.
- Further reading: [Boost.Lockfree](https://www.boost.org/doc/libs/1_81_0/doc/html/lockfree.html), [Modern C++ concurrency](https://www.modernescpp.com/index.php/category/multithreading), [Agner Fog's optimization manuals](https://www.agner.org/optimize/).

</details>
