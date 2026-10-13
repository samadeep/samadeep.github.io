// Read memory the way a sampling profiler does, three ways:
//   readv    process_vm_readv on our own pid: one system call per read, a bad address returns EFAULT
//   memcpy   a plain copy: free, but a bad address kills the process with SIGSEGV
//   guarded  a plain copy with a SIGSEGV/SIGBUS handler armed around it: a bad address
//            jumps back (siglongjmp) and the copy returns -1 with errno = EFAULT
// The guarded copy follows the idea in Datadog's dd-trace-py (echion/danger.cc), cut down.
//
// Modes:
//   ./fastcopy bench [reads]          cost of one small read, each way
//   ./fastcopy snapshot [tasks]       walk task -> coroutine -> frame -> code chains, time a snapshot
//   ./fastcopy fault [n]              copy from an unmapped page n times: the process survives, cost per fault
//   ./fastcopy crash                  the same bad copy without the guard, in a child process
//   ./fastcopy race [ms]              one thread maps and unmaps pages while another copies from them
//   ./fastcopy nodefer                handler installed WITHOUT SA_NODEFER: the second fault is fatal
#define _GNU_SOURCE
#include <errno.h>
#include <pthread.h>
#include <setjmp.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/uio.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define barrier() __asm__ __volatile__("" ::: "memory")

static long page;
static struct sigaction old_segv, old_bus;
static __thread sigjmp_buf jenv;
static __thread volatile sig_atomic_t armed;

static void on_fault(int sig, siginfo_t *si, void *uc) {
    (void)si; (void)uc;
    if (!armed) {
        // Not a fault inside our copy: put the previous handler back and return.
        // The faulting instruction runs again and the previous owner handles it
        // (Datadog's version calls the previous handler directly and guards against cycles).
        sigaction(sig, sig == SIGSEGV ? &old_segv : &old_bus, NULL);
        return;
    }
    siglongjmp(jenv, 1);  // back to the sigsetjmp in guarded_copy, which returns -1
}

static int install(int nodefer) {
    struct sigaction sa = {0};
    sa.sa_sigaction = on_fault;
    sigemptyset(&sa.sa_mask);
    // SA_ONSTACK: run on a separate stack. SA_NODEFER: do not block SIGSEGV while the handler
    // runs; we leave the handler by siglongjmp without restoring the mask, so without it the
    // signal would stay blocked and the next fault would kill the process ("nodefer" mode).
    sa.sa_flags = SA_SIGINFO | SA_ONSTACK | (nodefer ? SA_NODEFER : 0);
    return sigaction(SIGSEGV, &sa, &old_segv) | sigaction(SIGBUS, &sa, &old_bus);
}

static void altstack(void) {  // per thread: a fault handler needs a stack it can trust
    stack_t ss = { .ss_sp = malloc(64 * 1024), .ss_size = 64 * 1024, .ss_flags = 0 };
    sigaltstack(&ss, NULL);
}

static int savemask = 0;  // 1 = sigsetjmp also saves the signal mask: one extra system call per copy

// The copy itself lives in its own function, so nothing guarded_copy needs after a
// siglongjmp is held in a register the jump could clobber.
__attribute__((noinline)) static void chunked_copy(uint8_t *d, const uint8_t *s, size_t rem) {
    while (rem) {  // page-sized chunks, like the original: at most one fault per bad page
        size_t to_s = page - ((uintptr_t)s & (page - 1)), to_d = page - ((uintptr_t)d & (page - 1));
        size_t c = rem < to_s ? rem : to_s; if (c > to_d) c = to_d;
        memcpy(d, s, c);
        d += c; s += c; rem -= c;
    }
}

static ssize_t guarded_copy(void *dst, const void *src, size_t n) {
    armed = 1; barrier();
    if (sigsetjmp(jenv, savemask)) { barrier(); armed = 0; errno = EFAULT; return -1; }
    chunked_copy(dst, src, n);
    barrier(); armed = 0;
    return (ssize_t)n;
}

static ssize_t readv_copy(void *dst, const void *src, size_t n) {
    struct iovec l = { dst, n }, r = { (void *)src, n };
    return process_vm_readv(getpid(), &l, 1, &r, 1, 0);
}

static ssize_t plain_copy(void *dst, const void *src, size_t n) { memcpy(dst, src, n); return (ssize_t)n; }

typedef ssize_t (*copy_fn)(void *, const void *, size_t);

static double now_ns(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e9 + t.tv_nsec; }

// ---- bench: one small read (64 bytes, the size of a small Python object header and a few fields)
static void bench(long reads) {
    enum { OBJS = 4096 };
    void **objs = malloc(OBJS * sizeof *objs);
    for (int i = 0; i < OBJS; i++) { objs[i] = malloc(64); memset(objs[i], i, 64); }
    char buf[64]; volatile char sink = 0;
    struct { const char *name; copy_fn f; int sm; } m[] = {
        { "process_vm_readv", readv_copy, 0 }, { "plain memcpy", plain_copy, 0 },
        { "guarded memcpy", guarded_copy, 0 }, { "guarded, mask saved", guarded_copy, 1 },
    };
    printf("%ld reads of 64 bytes each, scattered over %d heap objects\n", reads, OBJS);
    double base = 0;
    for (int k = 0; k < 4; k++) {
        savemask = m[k].sm;
        for (long i = 0; i < 10000; i++) m[k].f(buf, objs[i % OBJS], 64);  // warm up
        double t = now_ns();
        for (long i = 0; i < reads; i++) { m[k].f(buf, objs[(i * 2654435761u) % OBJS], 64); sink ^= buf[i & 63]; }
        double per = (now_ns() - t) / reads;
        if (k == 0) { base = per; printf("  %-20s %7.1f ns per read\n", m[k].name, per); }
        else printf("  %-20s %7.1f ns per read   (%5.1fx cheaper than the syscall)\n", m[k].name, per, base / per);
    }
    savemask = 0; (void)sink;
}

// ---- snapshot: a toy event loop. Each task points to a coroutine, which points to a frame,
// which points to a code object; tasks form a list. The profiler cannot batch these reads:
// it learns where the coroutine lives only after it has copied the task.
struct code { char name[48]; };
struct frame { struct code *code; char pad[56]; };
struct coro { struct frame *frame; char pad[56]; };
struct task { struct coro *coro; struct task *next; char pad[48]; };

static struct task *make_tasks(int n) {
    struct task *head = NULL;
    for (int i = 0; i < n; i++) {
        struct code *c = malloc(sizeof *c); snprintf(c->name, sizeof c->name, "handler_%d", i % 97);
        struct frame *f = malloc(sizeof *f); f->code = c;
        struct coro *co = malloc(sizeof *co); co->frame = f;
        struct task *t = malloc(sizeof *t); t->coro = co; t->next = head; head = t;
    }
    return head;
}

static long walk(struct task *head, copy_fn cp, long *bad) {  // returns reads made
    long reads = 0; struct task t; struct coro co; struct frame f; struct code c;
    for (struct task *p = head; p; p = t.next) {
        reads++; if (cp(&t, p, sizeof t) < 0) { (*bad)++; return reads; }
        reads++; if (cp(&co, t.coro, sizeof co) < 0) { (*bad)++; continue; }
        reads++; if (cp(&f, co.frame, sizeof f) < 0) { (*bad)++; continue; }
        reads++; if (cp(&c, f.code, sizeof c) < 0) { (*bad)++; continue; }
    }
    return reads;
}

static void snapshot(int tasks) {
    struct task *head = make_tasks(tasks);
    printf("%d asyncio-style tasks, 4 dependent reads each (task, coroutine, frame, code)\n", tasks);
    struct { const char *name; copy_fn f; } m[] = { { "process_vm_readv", readv_copy }, { "guarded memcpy", guarded_copy } };
    for (int k = 0; k < 2; k++) {
        long bad = 0, reads = 0; int reps = 50;
        walk(head, m[k].f, &bad);
        double t = now_ns();
        for (int r = 0; r < reps; r++) reads = walk(head, m[k].f, &bad);
        double ms = (now_ns() - t) / reps / 1e6;
        // How often could you take this snapshot if the profiler may spend 1% of one core?
        printf("  %-18s %6ld reads, %8.3f ms per snapshot -> %7.1f snapshots/s inside a 1%% CPU budget\n",
               m[k].name, reads, ms, 10.0 / ms);
    }
}

// ---- fault: copy from a page that is not mapped
static void *dead_page(void) {
    void *p = mmap(NULL, page, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    munmap(p, page);  // the address is now unmapped, like memory the runtime handed back to the OS
    return p;
}

static void fault(long n) {
    void *p = dead_page(); char buf[64];
    errno = 0; ssize_t r = readv_copy(buf, p, 64);
    printf("process_vm_readv from an unmapped page: returned %zd, errno %s\n", r, strerrorname_np(errno));
    errno = 0; r = guarded_copy(buf, p, 64);
    printf("guarded memcpy from an unmapped page:   returned %zd, errno %s, process still alive\n", r, strerrorname_np(errno));
    double t = now_ns(); long failed = 0;
    for (long i = 0; i < n; i++) failed += guarded_copy(buf, p, 64) < 0;
    double per = (now_ns() - t) / n;
    printf("%ld more faulting copies: %ld returned -1, %.0f ns each (signal delivery + siglongjmp)\n", n, failed, per);
}

static void crash(void) {
    void *p = dead_page(); volatile char vbuf[64]; char *buf = (char *)vbuf;
    pid_t pid = fork();
    if (pid == 0) { memcpy(buf, p, 64); printf("child survived, read %d\n", buf[0]); _exit(0); }
    int st; waitpid(pid, &st, 0);
    if (WIFSIGNALED(st)) printf("plain memcpy from an unmapped page: child killed by signal %d (%s)\n", WTERMSIG(st), strsignal(WTERMSIG(st)));
    else printf("child exited %d\n", WEXITSTATUS(st));
}

// ---- race: the "runtime" thread maps a page, fills it, publishes it, then unmaps it.
// The "profiler" thread copies from whatever page was published last.
static _Atomic(char *) published;
static atomic_int stop;

static void *runtime(void *arg) {
    (void)arg;
    while (!atomic_load(&stop)) {
        char *p = mmap(NULL, page, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        memset(p, 'x', page);
        atomic_store(&published, p);
        for (volatile int i = 0; i < 2000; i++) {}  // the object lives a little while
        munmap(p, page);                            // ...then the page is handed back
    }
    return NULL;
}

static void race(int ms) {
    pthread_t th; char *first = mmap(NULL, page, PROT_READ, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    atomic_store(&published, first);
    pthread_create(&th, NULL, runtime, NULL);
    char buf[256]; long ok = 0, faulted = 0;
    double end = now_ns() + ms * 1e6;
    while (now_ns() < end) {
        if (guarded_copy(buf, atomic_load(&published), sizeof buf) < 0) faulted++; else ok++;
    }
    atomic_store(&stop, 1); pthread_join(th, NULL);
    printf("%d ms of copies racing a thread that unmaps pages: %ld succeeded, %ld faulted and were dropped (%.2f%%), process alive\n",
           ms, ok, faulted, 100.0 * faulted / (ok + faulted));
}

static void nodefer(void) {
    install(0);  // replace our handler with one that blocks SIGSEGV while it runs
    void *p = dead_page(); char buf[64];
    printf("handler without SA_NODEFER, sigsetjmp without saving the mask\n");
    fflush(stdout);
    printf("  fault 1: copy returned %zd\n", guarded_copy(buf, p, 64)); fflush(stdout);
    printf("  fault 2: copy returned %zd\n", guarded_copy(buf, p, 64)); fflush(stdout);
}

int main(int argc, char **argv) {
    page = sysconf(_SC_PAGESIZE);
    setvbuf(stdout, NULL, _IOLBF, 0);
    altstack();
    if (install(1)) { perror("sigaction"); return 1; }
    const char *mode = argc > 1 ? argv[1] : "bench";
    long n = argc > 2 ? atol(argv[2]) : 0;
    if (!strcmp(mode, "bench")) bench(n ? n : 2000000);
    else if (!strcmp(mode, "snapshot")) snapshot(n ? (int)n : 2000);
    else if (!strcmp(mode, "fault")) fault(n ? n : 100000);
    else if (!strcmp(mode, "crash")) crash();
    else if (!strcmp(mode, "race")) { altstack(); race(n ? (int)n : 1000); }
    else if (!strcmp(mode, "nodefer")) nodefer();
    else { fprintf(stderr, "modes: bench snapshot fault crash race nodefer\n"); return 2; }
    return 0;
}
