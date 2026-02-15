function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, "");
}

function isValidHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (_) {
        return false;
    }
}

function toPositiveInt(value, fallback) {
    if (value === undefined || value === null) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

function normalizeTopicUrl(url) {
    return url.split("?")[0].replace(/\/$/, "");
}

function buildTopicJsonUrl(url, page) {
    const base = `${normalizeTopicUrl(url)}.json`;
    if (page === undefined || page === null || page === 1) {
        return base;
    }

    return `${base}?page=${page}`;
}

function parseRetryAfterMs(headerValue) {
    if (!headerValue) return null;

    const asNumber = Number(headerValue);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
        return asNumber * 1000;
    }

    const asDate = Date.parse(headerValue);
    if (Number.isNaN(asDate)) {
        return null;
    }

    return Math.max(0, asDate - Date.now());
}

function formatDate(dateValue) {
    return new Date(dateValue).toISOString().split("T")[0];
}

module.exports = {
    sleep,
    stripHtml,
    isValidHttpUrl,
    toPositiveInt,
    normalizeTopicUrl,
    buildTopicJsonUrl,
    parseRetryAfterMs,
    formatDate,
};
