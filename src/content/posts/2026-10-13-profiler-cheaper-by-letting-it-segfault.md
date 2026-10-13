---
title: 'Make a Profiler Cheaper by Letting It Segfault'
description: 'How Datadog cut async Python profiler overhead by 60%: swap process_vm_readv for a memcpy guarded by a SIGSEGV handler and siglongjmp. Measured, runnable.'
hook:
  stat: '510 ns → 10 ns'
  caption: 'one 64-byte read: a system call vs a copy that is allowed to segfault'
date: '2026-10-13'
topic: systems
series: under-the-hood
tags: [profiling, linux-signals, python-asyncio, process-vm-readv, sigsetjmp]
---

<aside class="tldr">

**TL;DR** A profiler was asking the kernel's permission before every memory read, just in case the memory had vanished. It almost never had. So Datadog stopped asking, read the memory directly, and installed a safety net for the rare time it really is gone. The safety net is a segfault handler. Inside your production service. On purpose.

</aside>

Make a profiler cheaper by letting it segfault.

That sentence should make you nervous. A segfault is the thing that takes your service down at 3 a.m. Here it's the plan, and it cut the profiler's overhead by more than 60%[^dd].

A profiler is the tool that tells you which functions your service is spending its CPU on, so when a deploy makes everything slower, you know exactly which one to fix. Many times a second it takes a snapshot of the call stack, the list of functions that are running right now, and whichever function shows up in the most snapshots is where the time is going. It runs in production beside your code the whole time, so every bit of CPU it burns is CPU your service doesn't get. That cost is its overhead.

Here is the whole trick in one picture ([Fig. 1](#fig-1)): two ways to read one 64-byte object, timed on a 2.1 GHz Xeon.

```fig title="The system call turns a bad address into an error for 510 ns on every read; the guarded copy pays 10 ns, and about 1 µs only on the rare read that faults" alt="Two panels. Left, process_vm_readv: profiler to kernel labelled system call, every read; kernel to task object labelled 510 ns per read; a bad address returns EFAULT and the snapshot is dropped. Right, guarded memcpy: profiler to task object labelled memcpy, 10 ns; a bad address raises SIGSEGV, the handler siglongjmps back, the copy returns -1 and the snapshot is dropped, about 1,040 ns, only when it happens."
panel process_vm_readv
row
a1: main "profiler"
row
a2: box "kernel\nchecks the address"
row
a3: worker "task object\n64 bytes"
row
a4: ask "bad address\nEFAULT, drop snapshot"
a1 -> a2 "system call, every read"
a2 -> a3 "510 ns"
a3 -> a4 "rare" muted
panel guarded memcpy
row
b1: main "profiler"
row
b2: worker "task object\n64 bytes"
row
b3: deny "bad address\nSIGSEGV"
row
b4: allow "handler: siglongjmp\n-1, drop snapshot"
b1 -> b2 "memcpy, 10 ns"
b2 -> b3 "rare" muted
b3 -> b4 "~1,040 ns, only then"
```

Both sides end the same way when memory has gone bad: the snapshot is thrown away and the service lives. The difference is who pays, and how often. Before reading on, try it. Pick a reader, push the load up, and press **Python frees a task mid-copy**.

<div data-lab="fastcopy"></div>

## How async I/O broke the flame graph

Datadog's trouble started with async I/O, where one request is split across many small tasks, and every task keeps a call stack of its own. A snapshot could show time going to a database query without showing which request asked for it ([Fig. 2](#fig-2)).

```fig title="Sampled one task at a time, the Cassandra query floats free; following who awaits whom stitches it back under the request that asked for it" alt="Two panels. Left, one stack per task: three separate boxes, handle_checkout, cassandra.query marked who asked, and send_metrics, with no arrows between them. Right, stitched: handle_checkout awaits cassandra.query, which shows as one stack with the handler on top; send_metrics stays separate."
panel One stack per task
row
p1: peer "handle_checkout"
p2: worker "cassandra.query\n?? who asked"
p3: box "send_metrics"
panel Stitched along awaits
row
q1: peer "handle_checkout"
q3: box "send_metrics"
row
q2: worker "cassandra.query\nunder checkout"
_
q1 -> q2 "awaits"
```

So Datadog taught the profiler to follow which task is waiting on which, and stitch the pieces back into one stack[^dd]. To do that, it has to read every task's memory on every snapshot. A busy server holds a task for every request in flight, so a snapshot is now thousands of reads instead of a handful.

## Why every read went through the kernel

The profiler lives inside the same process as your code, but it can't trust what it reads. It samples from its own thread, without holding Python's lock, while your code keeps running. By the time it follows a pointer from a task to its coroutine, Python may have freed that coroutine and handed the page back to the operating system. Touch it and you crash.

So it was reading through a system call, `process_vm_readv`, a request to the kernel that returns an error instead of crashing if the memory is no longer there[^readv]. Ask for an unmapped page and you get `EFAULT`, not a dead process. Safe. And each call is a trip into the kernel.

```zsh
$ ./fastcopy bench
2000000 reads of 64 bytes each, scattered over 4096 heap objects
  process_vm_readv       510.4 ns per read
  plain memcpy             5.2 ns per read   ( 98.7x cheaper than the syscall)
  guarded memcpy          10.7 ns per read   ( 47.5x cheaper than the syscall)
  guarded, mask saved    129.6 ns per read   (  3.9x cheaper than the syscall)
```

Can't you batch them? `process_vm_readv` takes a list of addresses. But the reads chase pointers: you learn where the coroutine lives only after you've copied the task, and where the frame lives only after the coroutine. Four dependent reads per task, four system calls. Here's a toy event loop with 2,000 tasks, and a profiler allowed 1% of one core:

```zsh
$ ./fastcopy snapshot 2000
2000 asyncio-style tasks, 4 dependent reads each (task, coroutine, frame, code)
  process_vm_readv     8000 reads,    4.292 ms per snapshot ->     2.3 snapshots/s inside a 1% CPU budget
  guarded memcpy       8000 reads,    0.093 ms per snapshot ->   107.6 snapshots/s inside a 1% CPU budget
$ strace -c -e trace=process_vm_readv ./fastcopy snapshot 2000 2>&1 | grep readv$
100.00    4.317029          10    408000           process_vm_readv
```

That's 8,000 system calls per snapshot (51 snapshots ran under strace). Datadog's profiler keeps itself cheap by sampling less often when sampling gets expensive, and on busy async services it hit its floor of one snapshot a second[^dd], which tells you almost nothing. Push the simulator's load to 20,000 tasks with `process_vm_readv` and watch it pin at the floor and blow through its budget anyway.

## The cheap read that can kill you

The profiler is in the same address space. It can skip the kernel and copy those bytes directly: a `memcpy`, 5 ns. One catch. If Python frees the memory halfway through the copy, the whole service dies:

```zsh
$ ./fastcopy crash
plain memcpy from an unmapped page: child killed by signal 11 (Segmentation fault)
```

A 100x faster read that occasionally deletes your production service is not a trade anyone takes. Unless the crash can be caught.

## So let it crash, and catch it

When a thread touches an unmapped page, the CPU traps into the kernel, and the kernel sends that thread `SIGSEGV`. Normally nobody handles it and the process dies. But you can install a handler, and a handler can do something unusual: instead of returning, it can jump. `sigsetjmp` saves "where I am right now"; `siglongjmp` from inside the handler lands back there, as if `sigsetjmp` had returned a second time[^setjmp]. That's the whole mechanism, and it fits in a dozen lines:

```c
static __thread sigjmp_buf jenv;
static __thread volatile sig_atomic_t armed;

static void on_fault(int sig, siginfo_t *si, void *uc) {
    if (!armed) { /* not our copy: hand it to whoever owned SIGSEGV before */ }
    siglongjmp(jenv, 1);                 // jump back into guarded_copy
}

ssize_t guarded_copy(void *dst, const void *src, size_t n) {
    armed = 1;
    if (sigsetjmp(jenv, 0)) { armed = 0; errno = EFAULT; return -1; }  // landed here from the handler
    chunked_copy(dst, src, n);           // plain memcpy, page by page
    armed = 0;
    return n;
}
```

Datadog's real version lives in `danger.cc` in dd-trace-py[^danger]. It catches `SIGBUS` too, copies page by page so one bad page costs at most one fault, and runs the handler on its own alternate stack ([Fig. 3](#fig-3)).

```fig title="On a bad page the copy never finishes: the handler jumps back to the saved point, the copy returns -1, and the sampler drops one snapshot" alt="Sequence diagram with four actors: sampler thread, guarded_copy, kernel, handler. Sampler calls guarded_copy for the task at a freed address. guarded_copy arms the handler and calls sigsetjmp. memcpy touches the unmapped page and the CPU traps into the kernel. The kernel delivers SIGSEGV to the handler on the alternate stack. The handler sees armed and calls siglongjmp. sigsetjmp returns 1 in guarded_copy, which disarms and returns -1 EFAULT. The sampler drops this snapshot and carries on."
seq
s: peer "sampler thread"
g: main "guarded_copy"
k: box "kernel"
hd: worker "handler"
s -> g "copy task at 0x7f3a..."
g -> g "arm, sigsetjmp saves this spot"
g -> k "memcpy hits unmapped page" lost
k -> hd "SIGSEGV, on the alt stack"
hd -> g "armed: siglongjmp"
g -> s "-1, EFAULT"
s -> s "drop this snapshot"
```

```zsh
$ ./fastcopy fault
process_vm_readv from an unmapped page: returned -1, errno EFAULT
guarded memcpy from an unmapped page:   returned -1, errno EFAULT, process still alive
100000 more faulting copies: 100000 returned -1, 1041 ns each (signal delivery + siglongjmp)
```

Same answer as the system call, same `EFAULT`. Two costs changed places: a good read went from 510 ns to 10 ns, and a bad read went from 510 ns to about 1,040 ns.

## Two ways to get the handler subtly wrong

Both of these look fine in a quick test.

**Saving the signal mask.** `sigsetjmp(env, 1)` also saves the thread's signal mask, so the jump can restore it. Sounds safer. It costs a system call on every copy, which is the very thing you were removing: 130 ns instead of 10 ns, in the benchmark above.

**Skipping it, without `SA_NODEFER`.** By default the kernel blocks `SIGSEGV` while your handler runs, and unblocks it when the handler *returns*. Yours never returns: it jumps. So the signal stays blocked, and a second fault on that thread is fatal, because a synchronous `SIGSEGV` that arrives while blocked has undefined behaviour[^mask], and Linux just kills you ([Fig. 4](#fig-4)):

```zsh
$ ./fastcopy nodefer
handler without SA_NODEFER, sigsetjmp without saving the mask
  fault 1: copy returned -1
Segmentation fault
```

```fig title="Jumping out of the handler leaves SIGSEGV blocked unless the handler was installed with SA_NODEFER, so the first fault is caught and the second one kills the process" alt="Two panels. Left, without SA_NODEFER: fault 1 is caught and returns -1; SIGSEGV is still blocked after the jump; fault 2 kills the process, marked -X-. Right, with SA_NODEFER: fault 1 caught; the signal is never blocked; fault 2 caught; the process keeps running."
panel Without SA_NODEFER
row
n1: allow "fault 1\ncaught, -1"
row
n2: ask "siglongjmp out\nSIGSEGV still blocked"
row
n3: deny "fault 2\n-X- process killed"
n1 -> n2
n2 -> n3 lost
panel With SA_NODEFER
row
y1: allow "fault 1\ncaught, -1"
row
y2: box "siglongjmp out\nnothing blocked"
row
y3: allow "fault 2\ncaught, -1"
y1 -> y2
y2 -> y3 good
```

The guards that miss it: a unit test that faults once, a soak test where faults are rare enough that no thread sees two, and any review that reads the handler but not its `sigaction` flags. Datadog's source sets `SA_NODEFER` with a comment saying it's there to avoid saving the mask[^danger]. Their handler also chains to whatever owned `SIGSEGV` before (crash reporters, Python's `faulthandler`), guards against two handlers calling each other forever, and is switched off by default when Python is embedded in a host process that may own those signals itself.

## Pay only when it breaks

When does guarding lose? When faults are common enough that their extra cost eats the savings. With p the fraction of reads that fault, guarded copying wins while

$$
(1-p)\,t_{\text{guard}} + p\,t_{\text{fault}} < t_{\text{syscall}}
\quad\Longleftrightarrow\quad
p < \frac{t_{\text{syscall}} - t_{\text{guard}}}{t_{\text{fault}} - t_{\text{guard}}}
$$

```python
syscall, guard, fault = 510.4, 10.7, 1041.0     # ns, measured above
p = (syscall - guard) / (fault - guard)
print(f"guarded copy wins while fewer than {p:.0%} of reads fault")
for rate in (0.0001, 0.01, 0.10):
    cost = (1 - rate) * guard + rate * fault
    print(f"  {rate:>7.2%} faulting: {cost:6.1f} ns per read, {syscall / cost:4.1f}x cheaper")
```

```text
guarded copy wins while fewer than 49% of reads fault
    0.01% faulting:   10.8 ns per read, 47.2x cheaper
    1.00% faulting:   21.0 ns per read, 24.3x cheaper
   10.00% faulting:  113.7 ns per read,  4.5x cheaper
```

Faults would have to hit half of all reads. In reality they're rare, because the memory lives far longer than the instant a copy takes. Even a deliberately hostile test, one thread mapping and unmapping a page as fast as it can while another copies from it, faults on half a percent of copies:

```zsh
$ ./fastcopy race
1000 ms of copies racing a thread that unmaps pages: 6423874 succeeded, 36411 faulted and were dropped (0.56%), process alive
```

> **Insight:** It used to pay on every read to prevent a crash that almost never comes, and now it only pays when one does. When a check fails rarely and failure is detectable, make the failure path expensive and the common path free.

In Datadog's write-up, swapping `process_vm_readv` for the guarded copy cut overhead by about half on its own. Two smaller fixes followed: taking C++ exceptions off the sampling path (about 15%) and interning function and file names instead of copying them on every sample (another 25%). Together, the profiler's overhead on Datadog's own services fell by more than 60%, and the adaptive sampler spent that headroom on more snapshots[^dd].

## An old trick in a new place

The JVM has done this for years. HotSpot's `SafeFetch` reads an address that might be garbage and returns a default value instead of crashing, for stack walking and crash reports; on a couple of platforms it's built from `sigsetjmp`, just like this[^safefetch]. What's new is the scale: not one careful read in a crash report, but thousands per snapshot, many times a second, in every production process.

So: make a profiler cheaper by letting it segfault. It still sounds wrong. It's just a branch that is almost never taken, where the branch happens to be a signal.

## Try it

Everything above is one C file in [`/labs/profiler-fast-copy/`](/labs/profiler-fast-copy/fastcopy.c) (Linux, any recent gcc or clang):

```zsh
curl -O https://samadeep.github.io/labs/profiler-fast-copy/fastcopy.c
gcc -O2 -pthread -o fastcopy fastcopy.c
./fastcopy bench && ./fastcopy snapshot 2000 && ./fastcopy fault
./fastcopy crash && ./fastcopy race && ./fastcopy nodefer
```

Try `snapshot 20000` to see a busier event loop, or run it inside a container or VM and see how much the system call costs there.

<details>
<summary>What this shows, and what it doesn't</summary>

- **What was run:** every output above is real, from one 2.1 GHz Xeon with two cores, running inside a lightweight VM (Linux 6.18, gcc 13, `-O2`). Each benchmark was run three times; the numbers moved by about 10%. System calls inside a VM can cost more than on bare metal, so the 510 ns, and the 47x, are likely on the high side for a physical server.
- **The toy is not Datadog's profiler.** The "4 dependent reads per task" event loop and the 1% CPU budget are this post's model, chosen to show the shape. Datadog's real budget, read counts and per-service numbers aren't public in the write-up; the 50%, 15%, 25% and 60% figures are theirs, not reproduced here.
- **A fault isn't the only way a read goes wrong.** Python's allocator usually keeps freed memory mapped for reuse, so reading a freed object often returns stale bytes rather than faulting. Both readers have that problem equally and must sanity-check what they read; the guard only removes the crash.
- **The lab's handler is cut down.** When a fault isn't ours it restores the previous handler and returns, so the fault repeats under the old owner. Datadog's version calls the previous handler directly and guards against cycles; read `danger.cc` before copying either into production.

</details>

<details>
<summary>Before you start: the terms</summary>

| term | meaning |
|---|---|
| system call | a request from your program to the kernel; costs a switch into kernel mode and back |
| `process_vm_readv` | a system call that copies memory from a process (here, our own) and reports a bad address as `EFAULT`[^readv] |
| `SIGSEGV`, `SIGBUS` | signals the kernel sends a thread that touched memory it may not access |
| `sigsetjmp` / `siglongjmp` | save an execution point, then jump back to it from anywhere, even a signal handler[^setjmp] |
| `SA_NODEFER` | a `sigaction` flag: don't block the signal while its handler runs |
| asyncio task | one unit of work on Python's event loop; it wraps a coroutine, which holds a frame |

</details>

[^dd]: Thomas Kowalski and Scott Gerring, [How we built an async-aware Python profiler](https://www.datadoghq.com/blog/engineering/async-python-profiler/), Datadog Engineering, 2026.
[^readv]: Linux man-pages, [process_vm_readv(2)](https://man7.org/linux/man-pages/man2/process_vm_readv.2.html), man7.org.
[^danger]: Datadog, [danger.cc](https://github.com/DataDog/dd-trace-py/blob/main/ddtrace/internal/datadog/profiling/stack/src/echion/danger.cc), dd-trace-py on GitHub, 2026.
[^setjmp]: Linux man-pages, [setjmp(3)](https://man7.org/linux/man-pages/man3/setjmp.3.html), man7.org.
[^mask]: Linux man-pages, [sigprocmask(2)](https://man7.org/linux/man-pages/man2/sigprocmask.2.html), man7.org.
[^safefetch]: Martin Doerr, [RFR: JDK-8283326: Implement SafeFetch statically](https://mail.openjdk.org/pipermail/hotspot-dev/2022-April/059161.html), hotspot-dev mailing list, 2022.
