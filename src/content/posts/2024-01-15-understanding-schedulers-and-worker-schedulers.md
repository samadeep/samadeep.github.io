---
title: 'How a Task Scheduler Decides What Runs Next'
description: 'FCFS, shortest-job-first, round robin, starvation and work stealing, with a scheduler simulator you can run in your browser. Background jobs, explained.'
hook:
  stat: '40 s → 12.4 s'
  caption: 'average wait for the same 21 jobs → just by changing their order'
date: '2024-01-15'
updated: '2026-10-08'
topic: systems
series: system-design
tags: [schedulers, workers, job-queues, work-stealing, starvation, distributed-systems]
---

Here's a puzzle. Your background worker has one job queue. Sitting in it: a **30-second report**, and behind it, **twenty 1-second emails**. One worker. What order do you run them in?

The obvious answer is "the order they arrived". It's also the worst one. And the answer that fixes it creates a new problem, and the fix for *that* is basically how every real scheduler works. Let's walk it, with a simulator you can run right here.

<div data-lab="py" data-src="/labs/schedulers/sched_sim.py" data-presets="--report 30|--report 120|--starve|--pool"></div>

## First come, first served: fair and slow

Run the default preset. Three ways to order the same 21 jobs:

```text
one worker: a 30 s report queued first, then 20 one-second emails

FCFS          mean finish   40.0 s   p95   49.0 s   report done at   30.0 s
SJF           mean finish   12.4 s   p95   20.0 s   report done at   50.0 s
round robin 1s mean finish   13.3 s   p95   21.0 s   report done at   50.0 s
```

**First come, first served (FCFS)** runs the report first, so every email waits 30 seconds behind it. Twenty people waiting half a minute for an email, so one report can finish twenty seconds sooner. The average job finishes at **40 seconds**.

That's the **convoy effect**: one big job at the front, and everything small piles up behind it like cars behind a truck.

## Shortest job first: fast, until it isn't

Flip it: run the shortest job first (**SJF**). The emails fly out, one a second, and the report runs last. The average finish drops from 40 seconds to **12.4**. Same jobs, same worker, just a different order.

It's provably the best you can do for average wait on one worker. So why doesn't everyone just do this? Run the `--starve` preset:

```text
SJF, one email a second: the worker kept up (never more than 1 email waiting),
and after 600 s the report has still never run
```

New emails keep arriving, one a second. The worker keeps up with them perfectly. And because there's *always* a shorter job waiting, the report never gets its turn. Ten minutes in, it hasn't started. That's **starvation**.

```fig title="Under SJF a steady stream of short jobs can starve a long one forever"
row
q: shared "queue: report (30 s) + 1 email" span 3
row
w: main "worker: always picks the shortest" span 3
row
e: allow "email runs\n(1 s)"
n: peer "a new email arrives\n(1 s later)"
r: deny "report waits\n...forever"
q -> w
w -> e
e -> n
w -> r "never picked" lost
```

Two classic fixes, and real systems use both:

- **Aging.** A job's priority grows the longer it waits, so eventually the report outranks any fresh email.
- **A cap.** Nothing can be skipped more than N times, or for more than T seconds.

There's a second, quieter problem: SJF needs to know how long a job *will* take. In real life you usually don't.

## Round robin: nobody waits too long

**Round robin** sidesteps both problems. Every job gets a short slice of time (one second here), then goes to the back of the line. No size estimates needed, and nothing starves, because everything gets a turn.

Look at the numbers again: a mean of **13.3 seconds**, within a second of SJF's 12.4, without knowing a single job's size. The price is switching cost: every slice boundary means saving and restoring a job's state. That's why time slices are tuned, not set to zero.

> **Insight:** Every scheduler is a trade between three things: average wait, worst-case wait, and how much it has to know about the jobs. You can't max all three, so pick the one your users actually feel.

## More workers: how you hand out work matters more

Now the real world: four workers, forty jobs. Ten of them are big (10 s each), thirty are small (1 s). Run `--pool`:

```text
4 workers, 40 jobs (10 big ones of 10 s, 30 small of 1 s), dealt out in turn:
  static split    each worker's total: [100.0, 10.0, 10.0, 10.0]  -> all done at 100 s
  shared queue    all done at 36 s
  work stealing   all done at 40 s   (ideal: 32 s)
```

Deal the jobs out in turn, like cards, and every big job happens to land on worker 0. It grinds for **100 seconds** while the other three finish in 10 and sit idle. Same total work, three times slower.

```fig title="Dealing jobs out in turn can pile all the big ones on one worker"
panel Static split
row
s0: deny "worker 0\n100 s"
s1: box "worker 1\n10 s"
s2: box "worker 2\n10 s"
s3: box "worker 3\n10 s"
panel Shared queue
row
q0: allow "worker 0\n≤ 36 s"
q1: allow "worker 1\n≤ 36 s"
q2: allow "worker 2\n≤ 36 s"
q3: allow "worker 3\n≤ 36 s"
```

Two fixes:

- **One shared queue.** Whoever is free takes the next job. Here it finishes in 36 seconds, close to the ideal 32. The catch at scale: every worker now fights over one queue, and that lock becomes the bottleneck.
- **Work stealing.** Each worker has its own queue (no fighting), and an idle worker steals from the busiest one. It took 40 seconds here: a bit worse than the shared queue, because steals only happen once a worker runs dry. But it scales to many cores, which is why runtimes like Go's goroutine scheduler and Java's ForkJoinPool use it.

## When jobs fail

A real job system also has to survive failure, and the pieces fit around the same queue:

```fig title="A production job system: the queue in the middle, retries and a dead-letter queue around it"
row
prod: peer "producers"
queue: shared "job queue\n(durable)"
sched: main "scheduler"
row
dlq: deny "dead-letter queue"
_
pool: worker "worker pool"
row
_
db: shared "job state DB"
results: allow "result store"
prod -> queue "submit"
queue -> sched
sched -> pool "assign"
pool -> results
pool -> db "status"
pool -> dlq "gave up"
```

- **Retry with exponential backoff and jitter.** Wait 1 s, 2 s, 4 s, each plus a random bit, so a thousand failed jobs don't all retry in the same instant and knock the database over again.
- **A dead-letter queue.** After N tries, park the job somewhere visible instead of retrying forever. Someone gets paged; nothing silently disappears.
- **Idempotent jobs.** A worker can die *after* doing the work but *before* reporting it, so the job runs twice. Design for that: sending "email 42" twice should still send one email.
- **Keep jobs small.** A two-hour job that dies at minute 119 starts over. Ten 12-minute chunks don't.

> **Insight:** At-least-once delivery is the default in almost every job queue, so "this job might run twice" isn't an edge case. It's the normal case your job code has to handle.

## Back to the puzzle

So what order *should* the worker run them in? If you know the sizes and nothing else arrives, shortest first: 40 seconds of average wait becomes 12. If jobs keep arriving, add aging so the report eventually gets its turn. If you don't know the sizes, round robin gets within a second of the best without knowing anything. And the moment you add a second worker, how you hand out work matters more than the order, so use a shared queue or let idle workers steal.

## Try it

The simulator runs above in your browser. On your own machine (standard library only):

```zsh
curl -O https://samadeep.github.io/labs/schedulers/sched_sim.py
python3 sched_sim.py --report 120     # a longer report: FCFS gets much worse, SJF barely moves
python3 sched_sim.py --pool
```

<details>
<summary>Limits</summary>

- The simulator is deliberately tiny: fixed job sizes, no switching cost in round robin, and a simple steal rule (take from the back of the longest queue). Real schedulers measure, estimate and tune; the orderings and the shape of the trade-offs are the point, not the exact seconds.
- SJF is optimal for mean completion time on one worker when all jobs are known up front; with arrivals over time, its preemptive cousin (shortest remaining time first) takes that role.
- This post was rewritten in October 2026 from a January 2024 overview, with the runnable simulator added.

</details>
