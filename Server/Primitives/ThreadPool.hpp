#pragma once

#include <iostream>
#include <deque>
#include <vector>
#include <functional>
#include <thread>
#include <condition_variable>
#include <mutex>
#include <atomic>

struct ThreadPool {
    ThreadPool(unsigned int n = 0);
    ~ThreadPool();

    unsigned int processed() const { return _processed; };

    void enqueue(std::function<void(void)> f);
    void finish();
private:
    std::vector<std::thread> workers;
    std::deque<std::function<void(void)>> tasks;
    std::mutex queue_mutex;
    std::condition_variable cv_task;
    std::condition_variable cv_finished;
    unsigned int busy;
    std::atomic_uint _processed;
    bool stop;
    void thread_proc();
};

ThreadPool::ThreadPool(unsigned int n): busy(0), _processed(0), stop(false) {
    for (unsigned int i = 0; i < n; ++i)
        workers.emplace_back(std::bind(&ThreadPool::thread_proc, this));
}

ThreadPool::~ThreadPool() {
    std::unique_lock<std::mutex> latch(queue_mutex);
    stop = true;
    cv_task.notify_all();
    latch.unlock();

    for (auto& t : workers)
        t.join();
}

void ThreadPool::thread_proc() {
    while (true) {
        std::unique_lock<std::mutex> latch(queue_mutex);
        cv_task.wait(latch, [this]() { return stop || !tasks.empty(); });
        if (!tasks.empty()) {
            // got work. set busy.
            ++busy;

            // pull from queue
            auto fn = tasks.front();
            tasks.pop_front();

            // release lock. run async
            latch.unlock();

            // run function outside context
            fn();
            ++_processed;

            latch.lock();
            --busy;
            cv_finished.notify_one();
        } else if (stop) break;
    }
}

void ThreadPool::enqueue(std::function<void(void)> f) {
    std::unique_lock<std::mutex> lock(queue_mutex);
    tasks.emplace_back(std::forward<std::function<void(void)>>(f));
    cv_task.notify_one();
}

void ThreadPool::finish() {
    std::unique_lock<std::mutex> lock(queue_mutex);
    cv_finished.wait(lock, [this]() { return tasks.empty() && (busy == 0); });
}
