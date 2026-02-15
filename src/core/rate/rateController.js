class RateController {
    constructor({ maxConcurrency, globalDelayMs, hostQuotaPerMinute }) {
        this.maxConcurrency = maxConcurrency;
        this.globalDelayMs = globalDelayMs;
        this.hostQuotaPerMinute = hostQuotaPerMinute;

        this.activeRequests = 0;
        this.lastRequestStart = 0;
        this.queue = [];
        this.queueTimer = null;
        this.hostWindows = new Map();
    }

    schedule(fn, { host = "default" } = {}) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject, host });
            this.processQueue();
        });
    }

    processQueue() {
        if (this.activeRequests >= this.maxConcurrency || this.queue.length === 0) {
            return;
        }

        const now = Date.now();
        const taskIndex = this.findRunnableTaskIndex(now);
        if (taskIndex === -1) {
            this.scheduleNextTick(now);
            return;
        }

        const task = this.queue.splice(taskIndex, 1)[0];
        const waitMs = this.getWaitMsForHost(task.host, now);

        if (waitMs > 0) {
            // Put task back at front to preserve fairness.
            this.queue.unshift(task);
            this.scheduleNextTick(now + waitMs);
            return;
        }

        this.activeRequests += 1;
        this.lastRequestStart = Date.now();
        this.recordHostRequest(task.host, this.lastRequestStart);

        Promise.resolve()
            .then(task.fn)
            .then(task.resolve)
            .catch(task.reject)
            .finally(() => {
                this.activeRequests -= 1;
                this.processQueue();
            });

        this.processQueue();
    }

    findRunnableTaskIndex(now) {
        for (let i = 0; i < this.queue.length; i += 1) {
            const waitMs = this.getWaitMsForHost(this.queue[i].host, now);
            if (waitMs === 0) {
                return i;
            }
        }

        return -1;
    }

    getWaitMsForHost(host, now = Date.now()) {
        const globalWait = Math.max(0, this.lastRequestStart + this.globalDelayMs - now);

        const window = this.getHostWindow(host);
        this.trimHostWindow(window, now);
        if (window.length < this.hostQuotaPerMinute) {
            return globalWait;
        }

        const quotaWait = Math.max(0, window[0] + 60000 - now);
        return Math.max(globalWait, quotaWait);
    }

    recordHostRequest(host, timestamp) {
        const window = this.getHostWindow(host);
        this.trimHostWindow(window, timestamp);
        window.push(timestamp);
    }

    getHostWindow(host) {
        if (!this.hostWindows.has(host)) {
            this.hostWindows.set(host, []);
        }

        return this.hostWindows.get(host);
    }

    trimHostWindow(window, now) {
        while (window.length > 0 && now - window[0] > 60000) {
            window.shift();
        }
    }

    scheduleNextTick(targetTime) {
        const now = Date.now();
        const waitMs = Math.max(1, targetTime - now);

        if (this.queueTimer) {
            return;
        }

        this.queueTimer = setTimeout(() => {
            this.queueTimer = null;
            this.processQueue();
        }, waitMs);
    }
}

module.exports = {
    RateController,
};
