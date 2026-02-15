const DEFAULT_CONFIG = {
    maxOutputChars: 180000,
    pagination: {
        defaultMaxPages: 25,
        hardMaxPages: 300,
    },
    rate: {
        maxConcurrency: 2,
        globalDelayMs: 400,
        pageDelaySmallMs: 0,
        pageDelayMediumMs: 100,
        pageDelayLargeMs: 200,
        pageDelayMediumMinPages: 51,
        pageDelayLargeMinPages: 100,
        hostQuotaPerMinute: 120,
    },
    retry: {
        attempts: 3,
        baseMs: 1000,
        maxMs: 10000,
        jitterMs: 250,
    },
    cache: {
        enabled: true,
        ttlMs: 300000,
        swrMs: 1200000,
        maxEntries: 500,
    },
    jobs: {
        maxConcurrent: 4,
        retentionMs: 1800000,
        maxTotal: 200,
        cleanupIntervalMs: 60000,
    },
};

function parseIntEnv(env, key, fallback, min, max) {
    const raw = env[key];
    if (raw === undefined || raw === null || raw === "") {
        return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        throw new Error(`Invalid integer for ${key}: ${raw}`);
    }

    if (min !== undefined && parsed < min) {
        throw new Error(`Value for ${key} must be >= ${min}. Got: ${parsed}`);
    }

    if (max !== undefined && parsed > max) {
        throw new Error(`Value for ${key} must be <= ${max}. Got: ${parsed}`);
    }

    return parsed;
}

function parseBoolEnv(env, key, fallback) {
    const raw = env[key];
    if (raw === undefined || raw === null || raw === "") {
        return fallback;
    }

    const normalized = String(raw).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }

    throw new Error(`Invalid boolean for ${key}: ${raw}`);
}

function loadRuntimeConfig(env = process.env) {
    const config = {
        maxOutputChars: parseIntEnv(env, "VP_MAX_OUTPUT_CHARS", DEFAULT_CONFIG.maxOutputChars, 1000, 2000000),
        pagination: {
            defaultMaxPages: parseIntEnv(env, "VP_DEFAULT_MAX_PAGES", DEFAULT_CONFIG.pagination.defaultMaxPages, 1, 1000),
            hardMaxPages: parseIntEnv(env, "VP_HARD_MAX_PAGES", DEFAULT_CONFIG.pagination.hardMaxPages, 1, 10000),
        },
        rate: {
            maxConcurrency: parseIntEnv(env, "VP_MAX_CONCURRENCY", DEFAULT_CONFIG.rate.maxConcurrency, 1, 100),
            globalDelayMs: parseIntEnv(env, "VP_GLOBAL_DELAY_MS", DEFAULT_CONFIG.rate.globalDelayMs, 0, 60000),
            pageDelaySmallMs: parseIntEnv(env, "VP_PAGE_DELAY_SMALL_MS", DEFAULT_CONFIG.rate.pageDelaySmallMs, 0, 60000),
            pageDelayMediumMs: parseIntEnv(env, "VP_PAGE_DELAY_MEDIUM_MS", DEFAULT_CONFIG.rate.pageDelayMediumMs, 0, 60000),
            pageDelayLargeMs: parseIntEnv(env, "VP_PAGE_DELAY_LARGE_MS", DEFAULT_CONFIG.rate.pageDelayLargeMs, 0, 60000),
            pageDelayMediumMinPages: parseIntEnv(env, "VP_PAGE_DELAY_MEDIUM_MIN_PAGES", DEFAULT_CONFIG.rate.pageDelayMediumMinPages, 1, 100000),
            pageDelayLargeMinPages: parseIntEnv(env, "VP_PAGE_DELAY_LARGE_MIN_PAGES", DEFAULT_CONFIG.rate.pageDelayLargeMinPages, 1, 100000),
            hostQuotaPerMinute: parseIntEnv(env, "VP_HOST_QUOTA_PER_MINUTE", DEFAULT_CONFIG.rate.hostQuotaPerMinute, 1, 10000),
        },
        retry: {
            attempts: parseIntEnv(env, "VP_RETRY_ATTEMPTS", DEFAULT_CONFIG.retry.attempts, 1, 10),
            baseMs: parseIntEnv(env, "VP_RETRY_BASE_MS", DEFAULT_CONFIG.retry.baseMs, 0, 60000),
            maxMs: parseIntEnv(env, "VP_RETRY_MAX_MS", DEFAULT_CONFIG.retry.maxMs, 0, 600000),
            jitterMs: parseIntEnv(env, "VP_RETRY_JITTER_MS", DEFAULT_CONFIG.retry.jitterMs, 0, 60000),
        },
        cache: {
            enabled: parseBoolEnv(env, "VP_CACHE_ENABLED", DEFAULT_CONFIG.cache.enabled),
            ttlMs: parseIntEnv(env, "VP_CACHE_TTL_MS", DEFAULT_CONFIG.cache.ttlMs, 1000, 86400000),
            swrMs: parseIntEnv(env, "VP_CACHE_SWR_MS", DEFAULT_CONFIG.cache.swrMs, 0, 604800000),
            maxEntries: parseIntEnv(env, "VP_CACHE_MAX_ENTRIES", DEFAULT_CONFIG.cache.maxEntries, 1, 50000),
        },
        jobs: {
            maxConcurrent: parseIntEnv(env, "VP_JOB_MAX_CONCURRENT", DEFAULT_CONFIG.jobs.maxConcurrent, 1, 100),
            retentionMs: parseIntEnv(env, "VP_JOB_RETENTION_MS", DEFAULT_CONFIG.jobs.retentionMs, 1000, 604800000),
            maxTotal: parseIntEnv(env, "VP_JOB_MAX_TOTAL", DEFAULT_CONFIG.jobs.maxTotal, 1, 100000),
            cleanupIntervalMs: parseIntEnv(env, "VP_JOB_CLEANUP_INTERVAL_MS", DEFAULT_CONFIG.jobs.cleanupIntervalMs, 1000, 3600000),
        },
    };

    if (config.pagination.defaultMaxPages > config.pagination.hardMaxPages) {
        throw new Error(
            `VP_DEFAULT_MAX_PAGES (${config.pagination.defaultMaxPages}) must be <= VP_HARD_MAX_PAGES (${config.pagination.hardMaxPages})`
        );
    }

    if (config.retry.maxMs < config.retry.baseMs) {
        throw new Error(
            `VP_RETRY_MAX_MS (${config.retry.maxMs}) must be >= VP_RETRY_BASE_MS (${config.retry.baseMs})`
        );
    }

    if (config.rate.pageDelayMediumMinPages >= config.rate.pageDelayLargeMinPages) {
        throw new Error(
            `VP_PAGE_DELAY_MEDIUM_MIN_PAGES (${config.rate.pageDelayMediumMinPages}) must be < VP_PAGE_DELAY_LARGE_MIN_PAGES (${config.rate.pageDelayLargeMinPages})`
        );
    }

    return Object.freeze(config);
}

function getConfigSummary(config) {
    return {
        maxOutputChars: config.maxOutputChars,
        pagination: config.pagination,
        rate: config.rate,
        retry: config.retry,
        cache: config.cache,
        jobs: config.jobs,
    };
}

module.exports = {
    DEFAULT_CONFIG,
    loadRuntimeConfig,
    getConfigSummary,
};
