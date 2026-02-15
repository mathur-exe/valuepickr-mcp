class PageCache {
    constructor({ enabled, ttlMs, swrMs, maxEntries }) {
        this.enabled = enabled;
        this.ttlMs = ttlMs;
        this.swrMs = swrMs;
        this.maxEntries = maxEntries;

        this.store = new Map();
        this.stats = {
            hit: 0,
            miss: 0,
            staleServed: 0,
            refresh: 0,
            evicted: 0,
        };
    }

    async getOrFetch(key, fetcher) {
        if (!this.enabled) {
            return fetcher();
        }

        const now = Date.now();
        const entry = this.store.get(key);

        if (entry) {
            entry.lastAccess = now;
            const age = now - entry.fetchedAt;

            if (age <= this.ttlMs) {
                this.stats.hit += 1;
                return entry.value;
            }

            if (age <= this.ttlMs + this.swrMs) {
                this.stats.staleServed += 1;
                this.refreshInBackground(key, fetcher, entry);
                return entry.value;
            }
        }

        this.stats.miss += 1;
        const value = await fetcher();
        this.set(key, value);
        return value;
    }

    refreshInBackground(key, fetcher, entry) {
        if (entry.refreshPromise) {
            return;
        }

        this.stats.refresh += 1;
        entry.refreshPromise = Promise.resolve()
            .then(fetcher)
            .then((value) => {
                this.set(key, value);
            })
            .catch(() => {
                // Best effort background refresh.
            })
            .finally(() => {
                const current = this.store.get(key);
                if (current) {
                    current.refreshPromise = null;
                }
            });
    }

    set(key, value) {
        this.store.set(key, {
            value,
            fetchedAt: Date.now(),
            lastAccess: Date.now(),
            refreshPromise: null,
        });

        this.enforceCapacity();
    }

    enforceCapacity() {
        if (this.store.size <= this.maxEntries) {
            return;
        }

        const entries = Array.from(this.store.entries());
        entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

        const toRemove = this.store.size - this.maxEntries;
        for (let i = 0; i < toRemove; i += 1) {
            this.store.delete(entries[i][0]);
            this.stats.evicted += 1;
        }
    }

    getStats() {
        return {
            ...this.stats,
            size: this.store.size,
            enabled: this.enabled,
        };
    }
}

module.exports = {
    PageCache,
};
