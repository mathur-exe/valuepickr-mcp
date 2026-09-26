const axios = require("axios");
const {
    isValidTopicUrl,
    normalizeTopicUrl,
    buildTopicJsonUrl,
    parseRetryAfterMs,
    sleep,
} = require("../utils");

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "application/json",
};

class ForumClient {
    constructor({ config, rateController, pageCache, axiosInstance, logger = console }) {
        this.config = config;
        this.rateController = rateController;
        this.pageCache = pageCache;
        this.axios = axiosInstance || axios.create();
        this.logger = logger;
    }

    ensureValidUrl(url) {
        if (!isValidTopicUrl(url)) {
            throw new Error("Expected an HTTPS ValuePickr forum topic URL");
        }
    }

    async fetchTopic(url, { signal } = {}) {
        this.ensureValidUrl(url);
        const jsonUrl = buildTopicJsonUrl(url, 1);
        const host = new URL(jsonUrl).host;
        const cacheKey = `topic:${normalizeTopicUrl(url)}`;
        this.logger.error?.(`Fetching initial topic: ${jsonUrl}`);

        return this.pageCache.getOrFetch(cacheKey, async () => {
            return this.requestJson(jsonUrl, { host, signal });
        });
    }

    async fetchPage(url, page, { signal } = {}) {
        this.ensureValidUrl(url);
        const pageNumber = Number(page);
        if (!Number.isFinite(pageNumber) || pageNumber < 1) {
            throw new Error(`Invalid page number: ${page}`);
        }

        const jsonUrl = buildTopicJsonUrl(url, pageNumber);
        const host = new URL(jsonUrl).host;
        const cacheKey = `topic:${normalizeTopicUrl(url)}:page:${pageNumber}`;
        this.logger.error?.(`Fetching page ${pageNumber}: ${jsonUrl}`);

        return this.pageCache.getOrFetch(cacheKey, async () => {
            return this.requestJson(jsonUrl, { host, signal });
        });
    }

    async searchForum(query, limit = 10, { signal } = {}) {
        const baseUrl = "https://forum.valuepickr.com";
        const normalizedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 10;
        const searchUrl = `${baseUrl}/search/query.json?term=${encodeURIComponent(query)}`;
        const host = new URL(searchUrl).host;
        const cacheKey = `search:${query}:${normalizedLimit}`;

        this.logger.error?.(`Searching: ${searchUrl}`);

        const data = await this.pageCache.getOrFetch(cacheKey, async () => {
            return this.requestJson(searchUrl, { host, signal });
        });

        if (!data || !Array.isArray(data.topics)) {
            return [];
        }

        return data.topics.slice(0, normalizedLimit);
    }

    async requestJson(url, { host, signal }) {
        const retryConfig = this.config.retry;

        for (let attempt = 1; attempt <= retryConfig.attempts; attempt += 1) {
            try {
                const response = await this.rateController.schedule(() => this.axios.get(url, {
                    headers: DEFAULT_HEADERS,
                    signal,
                    timeout: 15000,
                    maxContentLength: 5 * 1024 * 1024,
                    maxRedirects: 3,
                    beforeRedirect: (options) => {
                        if (options.protocol !== "https:" || options.hostname !== "forum.valuepickr.com") {
                            throw new Error("Forum redirect left the allowed host");
                        }
                    },
                }), { host });
                return response.data;
            } catch (error) {
                if (signal && signal.aborted) {
                    throw new Error("Request cancelled");
                }

                if (!this.isRetryable(error) || attempt >= retryConfig.attempts) {
                    throw error;
                }

                const delayMs = this.getBackoffDelayMs(error, attempt, retryConfig);
                this.logger.error?.(
                    `Request failed (attempt ${attempt}/${retryConfig.attempts}) for ${url}: ${error.message}. Retrying in ${delayMs}ms`
                );
                await sleep(delayMs);
            }
        }

        throw new Error(`Failed to fetch ${url}`);
    }

    isRetryable(error) {
        const status = error.response?.status;
        if (status === 429 || status === 408 || status === 425) {
            return true;
        }

        if (status >= 500 && status < 600) {
            return true;
        }

        // Network or transport failure.
        return !status;
    }

    getBackoffDelayMs(error, attempt, retryConfig) {
        const status = error.response?.status;
        if (status === 429) {
            const retryAfterMs = parseRetryAfterMs(error.response?.headers?.["retry-after"]);
            if (retryAfterMs !== null) {
                return Math.min(Math.max(0, retryAfterMs), retryConfig.maxMs);
            }
        }

        const exp = retryConfig.baseMs * (2 ** Math.max(0, attempt - 1));
        const bounded = Math.min(exp, retryConfig.maxMs);
        const jitter = retryConfig.jitterMs > 0 ? Math.floor(Math.random() * retryConfig.jitterMs) : 0;
        return bounded + jitter;
    }
}

module.exports = {
    ForumClient,
};
