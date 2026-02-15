const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "expired"]);

class JobStore {
    constructor({ retentionMs, maxTotal }) {
        this.retentionMs = retentionMs;
        this.maxTotal = maxTotal;
        this.jobs = new Map();
        this.counter = 0;
    }

    createJob({ type, params }) {
        const now = Date.now();
        const id = this.generateId();

        const job = {
            id,
            type,
            params,
            status: "queued",
            progress: {
                message: "Queued",
                currentPage: null,
                totalPages: null,
                processedPages: 0,
            },
            createdAt: now,
            startedAt: null,
            updatedAt: now,
            finishedAt: null,
            error: null,
            result: null,
            cancelRequested: false,
            abortController: null,
        };

        this.jobs.set(id, job);
        this.enforceCapacity();
        return job;
    }

    generateId() {
        this.counter += 1;
        return `job_${Date.now()}_${this.counter}`;
    }

    get(id) {
        return this.jobs.get(id) || null;
    }

    list() {
        return Array.from(this.jobs.values());
    }

    setAbortController(id, controller) {
        const job = this.get(id);
        if (!job) return null;
        job.abortController = controller;
        job.updatedAt = Date.now();
        return job;
    }

    markRunning(id) {
        const job = this.get(id);
        if (!job) return null;
        const now = Date.now();
        job.status = "running";
        job.startedAt = now;
        job.updatedAt = now;
        job.progress.message = "Running";
        return job;
    }

    updateProgress(id, progress) {
        const job = this.get(id);
        if (!job) return null;
        job.progress = {
            ...job.progress,
            ...progress,
            message: progress.message || "Running",
        };
        job.updatedAt = Date.now();
        return job;
    }

    markCompleted(id, result) {
        const job = this.get(id);
        if (!job) return null;
        const now = Date.now();
        job.status = "completed";
        job.result = result;
        job.finishedAt = now;
        job.updatedAt = now;
        job.progress.message = "Completed";
        return job;
    }

    markFailed(id, errorMessage) {
        const job = this.get(id);
        if (!job) return null;
        const now = Date.now();
        job.status = "failed";
        job.error = errorMessage;
        job.finishedAt = now;
        job.updatedAt = now;
        job.progress.message = "Failed";
        return job;
    }

    markCancelled(id) {
        const job = this.get(id);
        if (!job) return null;
        const now = Date.now();
        job.status = "cancelled";
        job.finishedAt = now;
        job.updatedAt = now;
        job.progress.message = "Cancelled";
        return job;
    }

    requestCancel(id) {
        const job = this.get(id);
        if (!job) return null;
        job.cancelRequested = true;
        job.updatedAt = Date.now();

        if (job.abortController) {
            job.abortController.abort();
        }

        return job;
    }

    isTerminal(status) {
        return TERMINAL_STATUSES.has(status);
    }

    cleanup() {
        const now = Date.now();
        for (const [id, job] of this.jobs.entries()) {
            if (!this.isTerminal(job.status)) continue;
            const finishedAt = job.finishedAt || job.updatedAt || now;
            if (now - finishedAt > this.retentionMs) {
                this.jobs.delete(id);
            }
        }

        this.enforceCapacity();
    }

    enforceCapacity() {
        if (this.jobs.size <= this.maxTotal) {
            return;
        }

        const terminalJobs = Array.from(this.jobs.values())
            .filter((job) => this.isTerminal(job.status))
            .sort((a, b) => (a.finishedAt || a.updatedAt) - (b.finishedAt || b.updatedAt));

        for (const job of terminalJobs) {
            if (this.jobs.size <= this.maxTotal) break;
            this.jobs.delete(job.id);
        }
    }
}

module.exports = {
    JobStore,
    TERMINAL_STATUSES,
};
