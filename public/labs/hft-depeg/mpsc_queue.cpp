// The depeg engine's queue, fixed and tested: many producers, ONE consumer.
//   g++ -std=c++20 -O1 -g -fsanitize=thread -o mpsc mpsc_queue.cpp -pthread
//   ./mpsc 1     # 4 producers, 1 consumer: clean
//   ./mpsc 2     # 4 producers, 2 consumers: ThreadSanitizer reports heap-use-after-free, then it hangs
#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <thread>
#include <utility>
#include <vector>

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
    ~MpscQueue() { for (Node* n = head_; n;) { Node* next = n->next.load(); delete n; n = next; } }

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

int main(int argc, char** argv) {
    int consumers = argc > 1 ? std::atoi(argv[1]) : 1;
    constexpr int producers = 4, per_producer = 20000;
    MpscQueue<long> q;
    std::atomic<long> popped{0}, sum{0};
    std::vector<std::thread> ts;
    for (int p = 0; p < producers; p++)
        ts.emplace_back([&, p] { for (int i = 1; i <= per_producer; i++) q.push(p * 1000000L + i); });
    for (int c = 0; c < consumers; c++)
        ts.emplace_back([&] {
            long v;
            while (popped.load() < producers * per_producer)
                if (q.try_pop(v)) { popped++; sum += v; }
        });
    for (auto& t : ts) t.join();
    long want = 0;
    for (int p = 0; p < producers; p++) want += p * 1000000L * per_producer + per_producer * (per_producer + 1L) / 2;
    std::printf("%d producers, %d consumer(s): popped %ld items, sum %s\n", producers, consumers, popped.load(), sum == want ? "correct" : "WRONG");
}
