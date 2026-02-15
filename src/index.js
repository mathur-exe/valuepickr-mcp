#!/usr/bin/env node
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const axios = require("axios");

// Create server instance
const server = new Server(
    {
        name: "valuepickr-mcp",
        version: "1.1.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// --- Helpers ---

// Sleep helper for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_CONCURRENCY = 2;
const GLOBAL_DELAY_MS = 400;
const DEFAULT_MAX_PAGES = 25;
const HARD_MAX_PAGES = 300;
const MAX_OUTPUT_CHARS = 180000;

let activeRequests = 0;
let lastRequestStart = 0;
const requestQueue = [];
let queueTimer = null;

function processRequestQueue() {
    if (activeRequests >= MAX_CONCURRENCY || requestQueue.length === 0) {
        return;
    }

    const now = Date.now();
    const waitMs = Math.max(0, lastRequestStart + GLOBAL_DELAY_MS - now);

    if (waitMs > 0) {
        if (!queueTimer) {
            queueTimer = setTimeout(() => {
                queueTimer = null;
                processRequestQueue();
            }, waitMs);
        }
        return;
    }

    const task = requestQueue.shift();
    activeRequests++;
    lastRequestStart = Date.now();

    Promise.resolve()
        .then(task.fn)
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
            activeRequests--;
            processRequestQueue();
        });

    processRequestQueue();
}

function enqueueRequest(fn) {
    return new Promise((resolve, reject) => {
        requestQueue.push({ fn, resolve, reject });
        processRequestQueue();
    });
}

function rateLimitedGet(url, config) {
    return enqueueRequest(() => axios.get(url, config));
}

function toPositiveInt(value, fallback) {
    if (value === undefined || value === null) {
        return fallback;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.floor(parsed);
}

function getPageWindow(totalPages, { start_page, max_pages, full_thread }) {
    if (!totalPages || totalPages < 1) {
        return { startPage: 1, endPage: 1 };
    }

    const startPage = Math.min(Math.max(toPositiveInt(start_page, 1), 1), totalPages);
    if (full_thread) {
        return { startPage: 1, endPage: totalPages };
    }

    const boundedMaxPages = Math.min(toPositiveInt(max_pages, DEFAULT_MAX_PAGES), HARD_MAX_PAGES);
    const endPage = Math.min(totalPages, startPage + boundedMaxPages - 1);
    return { startPage, endPage };
}

async function fetchPostsForPageRange(url, initialData, startPage, endPage, totalPages) {
    let allPosts = [];
    const seenIds = new Set();

    if (startPage === 1) {
        const initialPosts = (initialData.post_stream && initialData.post_stream.posts) || [];
        initialPosts.forEach((post) => {
            if (!seenIds.has(post.id)) {
                seenIds.add(post.id);
                allPosts.push(post);
            }
        });
    } else {
        const startPageData = await fetchPage(url, startPage);
        const startPosts = (startPageData && startPageData.post_stream && startPageData.post_stream.posts) || [];
        startPosts.forEach((post) => {
            if (!seenIds.has(post.id)) {
                seenIds.add(post.id);
                allPosts.push(post);
            }
        });
    }

    if (endPage > startPage) {
        const delay = getOptimalDelay(totalPages);
        console.error(`Using ${delay}ms delay for pages ${startPage + 1}-${endPage}`);

        for (let page = startPage + 1; page <= endPage; page++) {
            if (delay > 0) await sleep(delay);
            const pageData = await fetchPage(url, page);
            const pagePosts = (pageData && pageData.post_stream && pageData.post_stream.posts) || [];
            pagePosts.forEach((post) => {
                if (!seenIds.has(post.id)) {
                    seenIds.add(post.id);
                    allPosts.push(post);
                }
            });
        }
    }

    allPosts.sort((a, b) => a.post_number - b.post_number);
    return allPosts;
}

function maybeTruncateOutput(text) {
    if (text.length <= MAX_OUTPUT_CHARS) {
        return { text, truncated: false };
    }

    const truncatedText = text.slice(0, MAX_OUTPUT_CHARS);
    return {
        text: `${truncatedText}\n\n[Output truncated at ${MAX_OUTPUT_CHARS} characters. Narrow the range with start_page/max_pages, or run additional chunk calls.]`,
        truncated: true,
    };
}

// Get optimal delay based on thread size to avoid rate limits
function getOptimalDelay(totalPages) {
    if (totalPages <= 50) return 0;      // No delay for small-medium threads (1-1000 posts)
    if (totalPages <= 99) return 100;    // 100ms for large threads (1001-1980 posts)
    return 200;                          // 200ms for very large threads (2000+ posts)
}

// Helper to clean HTML tags
function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, "");
}

// Helper to validate URL
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

// Helper to fetch topic data
async function fetchTopic(url) {
    if (!isValidUrl(url)) {
        throw new Error("Invalid URL provided");
    }

    // Ensure URL ends with .json
    const jsonUrl = url.split("?")[0].replace(/\/$/, "") + ".json";

    console.error(`Fetching initial topic: ${jsonUrl}`);
    const response = await rateLimitedGet(jsonUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
            "Accept": "application/json"
        }
    });

    return response.data;
}

// Helper to fetch specific page with retry
async function fetchPage(url, page) {
    const jsonUrl = url.split("?")[0].replace(/\/$/, "") + ".json?page=" + page;
    console.error(`Fetching page ${page}: ${jsonUrl}`);

    let retries = 3;
    while (retries > 0) {
        try {
            const response = await rateLimitedGet(jsonUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
                    "Accept": "application/json"
                }
            });
            return response.data;
        } catch (error) {
            console.error(`Error fetching page ${page} (attempt ${4 - retries}): ${error.message}`);
            retries--;
            if (retries === 0) return null;
            await sleep(1000); // Wait 1s before retry
        }
    }
}

// Helper to search forum
async function searchForum(query, limit = 10) {
    // Default to ValuePickr if no domain specified, but we can infer from context if needed.
    // For now, we'll hardcode ValuePickr base URL since this is the "ValuePickr MCP".
    const baseUrl = "https://forum.valuepickr.com";
    const searchUrl = `${baseUrl}/search/query.json?term=${encodeURIComponent(query)}`;

    console.error(`Searching: ${searchUrl}`);

    const response = await rateLimitedGet(searchUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
            "Accept": "application/json"
        }
    });

    if (!response.data || !response.data.topics) {
        return [];
    }

    // The API returns 'posts' and 'topics'. We usually want topics.
    // We'll map topics and include snippet if available.
    const results = response.data.topics || [];
    return results.slice(0, limit);
}

// --- Tool Definitions ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "read_forum_thread",
                description: "Reads a ValuePickr/Discourse forum thread. Defaults to chunked pagination; set full_thread=true for full retrieval in one call.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The full URL of the forum topic (e.g., https://forum.valuepickr.com/t/ranjans-portfolio/45082)",
                        },
                        start_page: {
                            type: "number",
                            description: "1-based page to start from (default: 1). Ignored when full_thread=true.",
                        },
                        max_pages: {
                            type: "number",
                            description: `Maximum pages to fetch in this call (default: ${DEFAULT_MAX_PAGES}, max: ${HARD_MAX_PAGES}). Ignored when full_thread=true.`,
                        },
                        full_thread: {
                            type: "boolean",
                            description: "If true, fetches all pages in one call.",
                        },
                        include_full_content: {
                            type: "boolean",
                            description: "If false, returns snippets instead of full post text.",
                        },
                    },
                    required: ["url"],
                },
            },
            {
                name: "search_forum",
                description: "Searches the ValuePickr forum for topics matching a query.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query (e.g., 'microcap carnage', 'Asian Paints analysis')",
                        },
                        limit: {
                            type: "number",
                            description: "Number of results to return (default: 10)",
                        },
                    },
                    required: ["query"],
                },
            },
            {
                name: "search_within_thread",
                description: "Searches for a keyword within a forum thread. Defaults to chunked pagination; set full_thread=true to scan all pages.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The full URL of the forum topic",
                        },
                        keyword: {
                            type: "string",
                            description: "The keyword or phrase to search for within the thread",
                        },
                        case_sensitive: {
                            type: "boolean",
                            description: "Whether the search should be case-sensitive (default: false)",
                        },
                        start_page: {
                            type: "number",
                            description: "1-based page to start scanning from (default: 1). Ignored when full_thread=true.",
                        },
                        max_pages: {
                            type: "number",
                            description: `Maximum pages to scan in this call (default: ${DEFAULT_MAX_PAGES}, max: ${HARD_MAX_PAGES}). Ignored when full_thread=true.`,
                        },
                        full_thread: {
                            type: "boolean",
                            description: "If true, scans all pages in one call.",
                        },
                        include_full_content: {
                            type: "boolean",
                            description: "If false, returns snippets instead of full post text for matches.",
                        },
                    },
                    required: ["url", "keyword"],
                },
            },
        ],
    };
});

// --- Tool Execution ---

server.setRequestHandler(CallToolRequestSchema, async (request) => {

    // Tool: read_forum_thread
    if (request.params.name === "read_forum_thread") {
        const {
            url,
            start_page,
            max_pages,
            full_thread = false,
            include_full_content = true,
        } = request.params.arguments;

        try {
            // 1. Fetch the first page/metadata
            const initialData = await fetchTopic(url);

            if (!initialData || !initialData.post_stream) {
                return {
                    content: [{ type: "text", text: "Error: Invalid Discourse topic URL or no data returned." }],
                    isError: true,
                };
            }

            const { title, post_stream } = initialData;
            const totalPosts = initialData.posts_count || post_stream.stream.length;
            const postsPerPage = 20;
            const totalPages = Math.ceil(totalPosts / postsPerPage);
            const { startPage, endPage } = getPageWindow(totalPages, {
                start_page,
                max_pages,
                full_thread,
            });
            const hasMore = endPage < totalPages;
            const nextPage = hasMore ? endPage + 1 : null;
            const allPosts = await fetchPostsForPageRange(url, initialData, startPage, endPage, totalPages);

            // 3. Format the transcript
            const views = initialData.views || "Unknown";
            const replyCount = initialData.reply_count || (totalPosts - 1);
            const likeCount = initialData.like_count || 0;
            const category = initialData.category_id || "Unknown";

            let transcript = `# Thread: ${title}\n`;
            transcript += `**Metadata**: ${views} views | ${replyCount} replies | ${likeCount} likes | Category ID: ${category}\n`;
            transcript += `**URL**: ${url}\n\n---\n\n`;
            transcript += `**Pagination**: pages ${startPage}-${endPage} of ${totalPages} | has_more=${hasMore}${nextPage ? ` | next_page=${nextPage}` : ""}\n`;
            transcript += `**Mode**: ${full_thread ? "full_thread" : "chunked"}\n\n---\n\n`;

            // Filter deleted posts and format
            allPosts.forEach((post) => {
                if (post.deleted_at) return; // Skip deleted posts

                const date = new Date(post.created_at).toISOString().split('T')[0];
                const content = stripHtml(post.cooked).trim();
                const renderedContent = include_full_content
                    ? content
                    : `${content.slice(0, 300)}${content.length > 300 ? "..." : ""}`;

                transcript += `### [${post.post_number}] ${post.username} (${date}):\n${renderedContent}\n\n---\n\n`;
            });
            const { text: finalOutput } = maybeTruncateOutput(transcript);

            return {
                content: [
                    {
                        type: "text",
                        text: finalOutput,
                    },
                ],
            };

        } catch (error) {
            return {
                content: [{ type: "text", text: `Error fetching thread: ${error.message}` }],
                isError: true,
            };
        }
    }

    // Tool: search_forum
    if (request.params.name === "search_forum") {
        const { query, limit = 10 } = request.params.arguments;

        try {
            const results = await searchForum(query, limit);

            if (results.length === 0) {
                return {
                    content: [{ type: "text", text: `No results found for query: "${query}"` }],
                };
            }

            let output = `# Search Results for "${query}"\n\n`;

            results.forEach((topic, index) => {
                const date = new Date(topic.created_at).toISOString().split('T')[0];
                const url = `https://forum.valuepickr.com/t/${topic.slug}/${topic.id}`;

                output += `### ${index + 1}. ${topic.title}\n`;
                output += `- **URL**: ${url}\n`;
                output += `- **Date**: ${date} | **Replies**: ${topic.posts_count - 1} | **Views**: ${topic.views}\n`;
                output += `\n`;
            });

            return {
                content: [{ type: "text", text: output }],
            };

        } catch (error) {
            return {
                content: [{ type: "text", text: `Error searching forum: ${error.message}` }],
                isError: true,
            };
        }
    }

    // Tool: search_within_thread
    if (request.params.name === "search_within_thread") {
        const {
            url,
            keyword,
            case_sensitive = false,
            start_page,
            max_pages,
            full_thread = false,
            include_full_content = true,
        } = request.params.arguments;

        try {
            // 1. Fetch metadata + selected page window
            const initialData = await fetchTopic(url);

            if (!initialData || !initialData.post_stream) {
                return {
                    content: [{ type: "text", text: "Error: Invalid Discourse topic URL or no data returned." }],
                    isError: true,
                };
            }

            const { title, post_stream } = initialData;
            const totalPosts = initialData.posts_count || post_stream.stream.length;
            const postsPerPage = 20;
            const totalPages = Math.ceil(totalPosts / postsPerPage);
            const { startPage, endPage } = getPageWindow(totalPages, {
                start_page,
                max_pages,
                full_thread,
            });
            const hasMore = endPage < totalPages;
            const nextPage = hasMore ? endPage + 1 : null;
            const allPosts = await fetchPostsForPageRange(url, initialData, startPage, endPage, totalPages);

            // 3. Filter posts by keyword
            const searchTerm = case_sensitive ? keyword : keyword.toLowerCase();
            const matchingPosts = allPosts.filter((post) => {
                if (post.deleted_at) return false;
                const content = stripHtml(post.cooked);
                const searchContent = case_sensitive ? content : content.toLowerCase();
                return searchContent.includes(searchTerm);
            });

            if (matchingPosts.length === 0) {
                return {
                    content: [{ type: "text", text: `No posts found containing "${keyword}" in thread: ${title}` }],
                };
            }

            // 4. Format results
            let output = `# Search Results for "${keyword}" in "${title}"\n\n`;
            output += `**Found ${matchingPosts.length} matching post(s) in scanned pages ${startPage}-${endPage} of ${totalPages}**\n`;
            output += `**Pagination**: has_more=${hasMore}${nextPage ? ` | next_page=${nextPage}` : ""}\n\n`;
            output += `**Thread URL**: ${url}\n\n---\n\n`;

            matchingPosts.forEach((post) => {
                const date = new Date(post.created_at).toISOString().split('T')[0];
                const content = stripHtml(post.cooked).trim();
                const renderedContent = include_full_content
                    ? content
                    : `${content.slice(0, 300)}${content.length > 300 ? "..." : ""}`;

                // Highlight the keyword in context (show snippet)
                const searchContent = case_sensitive ? content : content.toLowerCase();
                const keywordIndex = searchContent.indexOf(searchTerm);
                const snippetStart = Math.max(0, keywordIndex - 100);
                const snippetEnd = Math.min(content.length, keywordIndex + searchTerm.length + 100);
                const snippet = content.substring(snippetStart, snippetEnd);
                const prefix = snippetStart > 0 ? "..." : "";
                const suffix = snippetEnd < content.length ? "..." : "";

                output += `### [Post #${post.post_number}] ${post.username} (${date})\n`;
                output += `**Context**: ${prefix}${snippet}${suffix}\n\n`;
                output += `**Content**:\n${renderedContent}\n\n---\n\n`;
            });
            const { text: finalOutput } = maybeTruncateOutput(output);

            return {
                content: [{ type: "text", text: finalOutput }],
            };

        } catch (error) {
            return {
                content: [{ type: "text", text: `Error searching within thread: ${error.message}` }],
                isError: true,
            };
        }
    }

    throw new Error("Tool not found");
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport);
