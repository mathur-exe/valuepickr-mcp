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
    const response = await axios.get(jsonUrl, {
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
            const response = await axios.get(jsonUrl, {
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

    const response = await axios.get(searchUrl, {
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
                description: "Reads a ValuePickr/Discourse forum thread. Handles pagination automatically to retrieve the full discussion.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The full URL of the forum topic (e.g., https://forum.valuepickr.com/t/ranjans-portfolio/45082)",
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
                description: "Searches for a keyword within a specific forum thread. Fetches the entire thread and returns only posts containing the keyword.",
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
        const { url } = request.params.arguments;

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
            let allPosts = [...post_stream.posts];

            // 2. Check if we need more pages
            const postsPerPage = 20;
            const totalPages = Math.ceil(totalPosts / postsPerPage);

            if (totalPages > 1) {
                // Fetch remaining pages sequentially with dynamic rate limiting
                const delay = getOptimalDelay(totalPages);
                console.error(`Using ${delay}ms delay for ${totalPages} pages`);

                for (let i = 2; i <= totalPages; i++) {
                    if (delay > 0) await sleep(delay);
                    const pageData = await fetchPage(url, i);
                    if (pageData && pageData.post_stream && pageData.post_stream.posts) {
                        const newPosts = pageData.post_stream.posts.filter(
                            (p) => !allPosts.find((existing) => existing.id === p.id)
                        );
                        allPosts = [...allPosts, ...newPosts];
                    }
                }
            }

            // 3. Format the transcript
            const views = initialData.views || "Unknown";
            const replyCount = initialData.reply_count || (totalPosts - 1);
            const likeCount = initialData.like_count || 0;
            const category = initialData.category_id || "Unknown";

            let transcript = `# Thread: ${title}\n`;
            transcript += `**Metadata**: ${views} views | ${replyCount} replies | ${likeCount} likes | Category ID: ${category}\n`;
            transcript += `**URL**: ${url}\n\n---\n\n`;

            // Sort by post number
            allPosts.sort((a, b) => a.post_number - b.post_number);

            // Filter deleted posts and format
            allPosts.forEach((post) => {
                if (post.deleted_at) return; // Skip deleted posts

                const date = new Date(post.created_at).toISOString().split('T')[0];
                const content = stripHtml(post.cooked).trim();

                transcript += `### [${post.post_number}] ${post.username} (${date}):\n${content}\n\n---\n\n`;
            });

            return {
                content: [
                    {
                        type: "text",
                        text: transcript,
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
        const { url, keyword, case_sensitive = false } = request.params.arguments;

        try {
            // 1. Fetch the entire thread
            const initialData = await fetchTopic(url);

            if (!initialData || !initialData.post_stream) {
                return {
                    content: [{ type: "text", text: "Error: Invalid Discourse topic URL or no data returned." }],
                    isError: true,
                };
            }

            const { title, post_stream } = initialData;
            const totalPosts = initialData.posts_count || post_stream.stream.length;
            let allPosts = [...post_stream.posts];

            // 2. Fetch all pages
            const postsPerPage = 20;
            const totalPages = Math.ceil(totalPosts / postsPerPage);

            if (totalPages > 1) {
                const delay = getOptimalDelay(totalPages);
                console.error(`Using ${delay}ms delay for ${totalPages} pages`);

                for (let i = 2; i <= totalPages; i++) {
                    if (delay > 0) await sleep(delay);
                    const pageData = await fetchPage(url, i);
                    if (pageData && pageData.post_stream && pageData.post_stream.posts) {
                        const newPosts = pageData.post_stream.posts.filter(
                            (p) => !allPosts.find((existing) => existing.id === p.id)
                        );
                        allPosts = [...allPosts, ...newPosts];
                    }
                }
            }

            // 3. Filter posts by keyword
            allPosts.sort((a, b) => a.post_number - b.post_number);

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
            output += `**Found ${matchingPosts.length} matching post(s) out of ${totalPosts} total posts**\n\n`;
            output += `**Thread URL**: ${url}\n\n---\n\n`;

            matchingPosts.forEach((post) => {
                const date = new Date(post.created_at).toISOString().split('T')[0];
                const content = stripHtml(post.cooked).trim();

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
                output += `**Full content**:\n${content}\n\n---\n\n`;
            });

            return {
                content: [{ type: "text", text: output }],
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
