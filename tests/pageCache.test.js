const test = require("node:test");
const assert = require("node:assert/strict");

const { PageCache } = require("../src/core/cache/pageCache");

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

test("page cache returns fresh hit before ttl", async () => {
    const cache = new PageCache({ enabled: true, ttlMs: 1000, swrMs: 1000, maxEntries: 10 });
    let calls = 0;

    const fetcher = async () => {
        calls += 1;
        return { value: "A" };
    };

    const first = await cache.getOrFetch("k1", fetcher);
    const second = await cache.getOrFetch("k1", fetcher);

    assert.deepEqual(first, { value: "A" });
    assert.deepEqual(second, { value: "A" });
    assert.equal(calls, 1);
    assert.equal(cache.getStats().hit, 1);
});

test("page cache serves stale and refreshes in background", async () => {
    const cache = new PageCache({ enabled: true, ttlMs: 10, swrMs: 2000, maxEntries: 10 });
    let calls = 0;

    const fetcher = async () => {
        calls += 1;
        return { value: calls };
    };

    const first = await cache.getOrFetch("k2", fetcher);
    await delay(20);
    const stale = await cache.getOrFetch("k2", fetcher);

    assert.equal(first.value, 1);
    assert.equal(stale.value, 1);
    assert.equal(cache.getStats().staleServed, 1);

    await delay(30);
    const refreshed = await cache.getOrFetch("k2", fetcher);
    assert.equal(refreshed.value, 2);
});
