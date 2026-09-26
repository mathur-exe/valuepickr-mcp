function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, "");
}

function isValidTopicUrl(value) {
    try {
        const parsed = new URL(value);
        const parts = parsed.pathname.split("/").filter(Boolean);
        const topicPath = parts[0] === "t" && (
            (parts.length === 2 && /^\d+$/.test(parts[1])) ||
            ((parts.length === 3 || parts.length === 4) && /^\d+$/.test(parts[2]) &&
                (parts.length === 3 || /^\d+$/.test(parts[3])))
        );
        return parsed.protocol === "https:" && parsed.hostname === "forum.valuepickr.com" &&
            !parsed.port && !parsed.username && !parsed.password && topicPath;
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
    if (!isValidTopicUrl(url)) throw new Error("Expected a ValuePickr forum topic URL");
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 4) parts.pop();
    return `${parsed.origin}/${parts.join("/")}`;
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
    isValidTopicUrl,
    toPositiveInt,
    normalizeTopicUrl,
    buildTopicJsonUrl,
    parseRetryAfterMs,
    formatDate,
};
