const test = require("node:test");
const assert = require("node:assert/strict");

const { loadRuntimeConfig } = require("../src/core/config");

test("loadRuntimeConfig uses defaults", () => {
    const config = loadRuntimeConfig({});
    assert.equal(config.rate.maxConcurrency, 2);
    assert.equal(config.cache.enabled, true);
    assert.equal(config.jobs.maxConcurrent, 4);
});

test("loadRuntimeConfig applies env overrides", () => {
    const config = loadRuntimeConfig({
        VP_MAX_CONCURRENCY: "5",
        VP_CACHE_ENABLED: "false",
        VP_JOB_MAX_TOTAL: "999",
    });

    assert.equal(config.rate.maxConcurrency, 5);
    assert.equal(config.cache.enabled, false);
    assert.equal(config.jobs.maxTotal, 999);
});

test("loadRuntimeConfig rejects invalid values", () => {
    assert.throws(() => {
        loadRuntimeConfig({ VP_MAX_CONCURRENCY: "abc" });
    }, /Invalid integer/);

    assert.throws(() => {
        loadRuntimeConfig({ VP_PAGE_DELAY_MEDIUM_MIN_PAGES: "100", VP_PAGE_DELAY_LARGE_MIN_PAGES: "50" });
    }, /must be < VP_PAGE_DELAY_LARGE_MIN_PAGES/);
});
