"""What order should a worker run its jobs in? A tiny scheduler simulator (standard library only).

  python sched_sim.py                     one worker: 1 report (30 s) + 20 emails (1 s), all queued at t=0
  python sched_sim.py --report 120        make the report longer
  python sched_sim.py --starve            SJF with one email a second: does the report ever run?
  python sched_sim.py --pool              4 workers, uneven queues: static split vs shared queue vs work stealing
"""
import argparse, heapq

p = argparse.ArgumentParser()
p.add_argument("--report", type=float, default=30, help="seconds the long report takes")
p.add_argument("--emails", type=int, default=20, help="number of 1-second emails")
p.add_argument("--quantum", type=float, default=1, help="round-robin time slice, seconds")
p.add_argument("--starve", action="store_true")
p.add_argument("--pool", action="store_true")
a = p.parse_args()

def fcfs(jobs):            # in arrival order
    t, done = 0.0, {}
    for name, size in jobs:
        t += size; done[name] = t
    return done

def sjf(jobs):             # shortest first (stable for ties)
    return fcfs(sorted(jobs, key=lambda j: j[1]))

def round_robin(jobs, q):  # everyone gets a slice in turn
    t, done, left = 0.0, {}, [[n, s] for n, s in jobs]
    while left:
        nxt = []
        for job in left:
            run = min(q, job[1]); t += run; job[1] -= run
            if job[1] > 1e-9: nxt.append(job)
            else: done[job[0]] = t
        left = nxt
    return done

def report(name, done):
    waits = sorted(done.values())
    mean = sum(waits) / len(waits)
    p95 = waits[int(0.95 * (len(waits) - 1))]
    print(f"{name:13} mean finish {mean:6.1f} s   p95 {p95:6.1f} s   report done at {done['report']:6.1f} s")

if a.pool:
    # 4 workers; 40 jobs handed out in turn, but every 4th job is 10x bigger, so worker 0 gets all the big ones
    jobs = [10.0 if i % 4 == 0 else 1.0 for i in range(40)]
    static = [sum(jobs[i::4]) for i in range(4)]
    print("4 workers, 40 jobs (10 big ones of 10 s, 30 small of 1 s), dealt out in turn:")
    print(f"  static split    each worker's total: {static}  -> all done at {max(static):.0f} s")
    free = [0.0] * 4; heapq.heapify(free)
    for size in jobs:                     # shared queue: whoever is free takes the next job
        heapq.heappush(free, heapq.heappop(free) + size)
    print(f"  shared queue    all done at {max(free):.0f} s")
    # work stealing: own deque first; an idle worker steals from the back of the busiest queue
    queues = [jobs[i::4] for i in range(4)]; busy = [0.0] * 4
    while any(queues):
        w = min(range(4), key=lambda i: busy[i])
        if queues[w]: busy[w] += queues[w].pop(0)
        else:
            victim = max(range(4), key=lambda i: len(queues[i]))
            busy[w] += queues[victim].pop()
    print(f"  work stealing   all done at {max(busy):.0f} s   (ideal: {sum(jobs) / 4:.0f} s)")
elif a.starve:
    # one email a second, forever: the worker keeps up with them exactly, yet a waiting email always beats the report
    t, waiting, report_at, arrivals = 0.0, [], None, iter(float(i) for i in range(10_000))
    nxt = next(arrivals); waiting.append(("report", a.report)); most = 0
    while t < 600 and report_at is None:
        while nxt <= t: waiting.append(("email", 1.0)); nxt = next(arrivals)
        most = max(most, sum(1 for j in waiting if j[0] == "email"))
        if not waiting: t = nxt; continue
        waiting.sort(key=lambda j: j[1]); name, size = waiting.pop(0); t += size
        if name == "report": report_at = t
    print(f"SJF, one email a second: the worker kept up (never more than {most} email waiting),")
    print(f"and after {t:.0f} s the report has", f"run (at {report_at:.0f} s)" if report_at else "still never run")
    print("fix: age waiting jobs (priority grows with wait time), or cap how long anything can be skipped")
else:
    jobs = [("report", a.report)] + [(f"email{i}", 1.0) for i in range(a.emails)]
    print(f"one worker: a {a.report:g} s report queued first, then {a.emails} one-second emails\n")
    report("FCFS", fcfs(jobs))
    report("SJF", sjf(jobs))
    report(f"round robin {a.quantum:g}s", round_robin(jobs, a.quantum))
