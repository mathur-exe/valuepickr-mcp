const test = require("node:test");
const assert = require("node:assert/strict");

const { JobStore } = require("../src/core/jobs/jobStore");

test("job store lifecycle transitions", () => {
    const store = new JobStore({ retentionMs: 1000, maxTotal: 10 });
    const job = store.createJob({ type: "read_forum_thread", params: { url: "x" } });

    assert.equal(job.status, "queued");
    store.markRunning(job.id);
    assert.equal(store.get(job.id).status, "running");

    store.markCompleted(job.id, { text: "ok" });
    const done = store.get(job.id);
    assert.equal(done.status, "completed");
    assert.equal(done.result.text, "ok");
});

test("job store evicts expired terminal jobs on cleanup", async () => {
    const store = new JobStore({ retentionMs: 5, maxTotal: 10 });
    const job = store.createJob({ type: "search_within_thread", params: { url: "x", keyword: "k" } });
    store.markCompleted(job.id, { text: "ok" });

    await new Promise((resolve) => setTimeout(resolve, 10));
    store.cleanup();

    assert.equal(store.get(job.id), null);
});
