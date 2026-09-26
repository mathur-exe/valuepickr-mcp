const { loadRuntimeConfig, getConfigSummary } = require("./config");
const { RateController } = require("./rate/rateController");
const { PageCache } = require("./cache/pageCache");
const { ForumClient } = require("./http/forumClient");
const { ThreadService } = require("./services/threadService");
const { SearchService } = require("./services/searchService");
const { JobService } = require("./services/jobService");
const { createToolHandlers } = require("./tools/handlers");

function createCore({ logger = console, env = process.env } = {}) {
    const config = loadRuntimeConfig(env);

    const rateController = new RateController({
        maxConcurrency: config.rate.maxConcurrency,
        globalDelayMs: config.rate.globalDelayMs,
        hostQuotaPerMinute: config.rate.hostQuotaPerMinute,
    });

    const pageCache = new PageCache({
        enabled: config.cache.enabled,
        ttlMs: config.cache.ttlMs,
        swrMs: config.cache.swrMs,
        maxEntries: config.cache.maxEntries,
    });

    const forumClient = new ForumClient({
        config,
        rateController,
        pageCache,
        logger,
    });

    const threadService = new ThreadService({
        forumClient,
        config,
        logger,
    });

    const searchService = new SearchService({
        forumClient,
    });

    const jobService = new JobService({
        threadService,
        config,
        logger,
    });

    const handlers = createToolHandlers({
        threadService,
        searchService,
        jobService,
    });

    return {
        config,
        configSummary: getConfigSummary(config),
        services: {
            rateController,
            pageCache,
            forumClient,
            threadService,
            searchService,
            jobService,
        },
        handlers,
    };
}

module.exports = {
    createCore,
};
