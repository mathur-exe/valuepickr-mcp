const { JobStore, TERMINAL_STATUSES } = require("../jobs/jobStore");

class JobService {
    constructor({ threadService, config, logger = console }) {
        this.threadService = threadService;
        this.config = config;
        this.logger = logger;

        this.jobStore = new JobStore({
            retentionMs: config.jobs.retentionMs,
            maxTotal: config.jobs.maxTotal,
        });

        this.queue = [];
        this.running = 0;

        this.cleanupTimer = setInterval(() => {
            this.jobStore.cleanup();
        }, config.jobs.cleanupIntervalMs);

        if (typeof this.cleanupTimer.unref === "function") {
            this.cleanupTimer.unref();
        }
    }

    startReadForumThreadJob(params) {
        return this.startJob("read_forum_thread", params);
    }

    startSearchWithinThreadJob(params) {
        return this.startJob("search_within_thread", params);
    }

    startJob(type, params) {
        const job = this.jobStore.createJob({ type, params });
        this.queue.push(job.id);
        this.drain();

        return this.serializeJob(job);
    }

    async drain() {
        while (this.running < this.config.jobs.maxConcurrent && this.queue.length > 0) {
            const nextJobId = this.queue.shift();
            const job = this.jobStore.get(nextJobId);
            if (!job || job.cancelRequested || job.status !== "queued") {
                if (job && job.cancelRequested) {
                    this.jobStore.markCancelled(job.id);
                }
                continue;
            }

            this.running += 1;
            this.executeJob(job)
                .catch((error) => {
                    this.logger.error?.(`Job ${job.id} execution error: ${error.message}`);
                })
                .finally(() => {
                    this.running -= 1;
                    this.drain();
                });
        }
    }

    async executeJob(job) {
        this.jobStore.markRunning(job.id);
        const controller = new AbortController();
        this.jobStore.setAbortController(job.id, controller);

        const onProgress = (progress) => {
            this.jobStore.updateProgress(job.id, {
                ...progress,
                message: `Processing page ${progress.currentPage ?? "?"}`,
            });
        };

        try {
            let result;
            if (job.type === "read_forum_thread") {
                result = await this.threadService.readForumThread(job.params, {
                    signal: controller.signal,
                    onProgress,
                });
            } else if (job.type === "search_within_thread") {
                result = await this.threadService.searchWithinThread(job.params, {
                    signal: controller.signal,
                    onProgress,
                });
            } else {
                throw new Error(`Unknown job type: ${job.type}`);
            }

            const latest = this.jobStore.get(job.id);
            if (latest?.cancelRequested) {
                this.jobStore.markCancelled(job.id);
                return;
            }

            this.jobStore.markCompleted(job.id, result);
        } catch (error) {
            const latest = this.jobStore.get(job.id);
            if (latest?.cancelRequested || controller.signal.aborted) {
                this.jobStore.markCancelled(job.id);
                return;
            }

            this.jobStore.markFailed(job.id, error.message || "Unknown job error");
        }
    }

    getJobStatus(jobId) {
        const job = this.jobStore.get(jobId);
        if (!job) {
            return null;
        }

        return this.serializeJob(job);
    }

    getJobResult(jobId) {
        const job = this.jobStore.get(jobId);
        if (!job) {
            return null;
        }

        if (job.status !== "completed") {
            return {
                ready: false,
                status: job.status,
                error: job.error,
                progress: job.progress,
            };
        }

        return {
            ready: true,
            status: job.status,
            result: job.result,
        };
    }

    cancelJob(jobId) {
        const job = this.jobStore.get(jobId);
        if (!job) {
            return null;
        }

        if (TERMINAL_STATUSES.has(job.status)) {
            return {
                cancelled: false,
                status: job.status,
            };
        }

        if (job.status === "queued") {
            this.queue = this.queue.filter((id) => id !== jobId);
            this.jobStore.requestCancel(jobId);
            this.jobStore.markCancelled(jobId);
            return {
                cancelled: true,
                status: "cancelled",
            };
        }

        this.jobStore.requestCancel(jobId);
        return {
            cancelled: true,
            status: "cancelling",
        };
    }

    serializeJob(job) {
        return {
            job_id: job.id,
            type: job.type,
            status: job.status,
            progress: job.progress,
            created_at: new Date(job.createdAt).toISOString(),
            started_at: job.startedAt ? new Date(job.startedAt).toISOString() : null,
            updated_at: new Date(job.updatedAt).toISOString(),
            finished_at: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
            error: job.error,
            result_ready: job.status === "completed",
        };
    }
}

module.exports = {
    JobService,
};
