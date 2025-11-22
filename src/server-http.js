// HTTP-based MCP server for remote deployment (Render, Railway, etc.)
// Implements standard MCP Protocol via Server-Sent Events (SSE)
const express = require("express");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const axios = require("axios");

const app = express();

// Create MCP Server instance
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Get optimal delay based on thread size to avoid rate limits
function getOptimalDelay(totalPages) {
    if (totalPages <= 50) return 0;      // No delay for small-medium threads
    if (totalPages <= 99) return 100;    // 100ms for large threads
    return 200;                          // 200ms for very large threads
}

function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, "");
}

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

async function fetchTopic(url) {
    if (!isValidUrl(url)) {
        throw new Error("Invalid URL provided");
    }
    const jsonUrl = url.split("?")[0].replace(/\/$/, "") + ".json";
    console.log(`Fetching topic: ${jsonUrl}`);
    const response = await axios.get(jsonUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json"
        }
    });
    return response.data;
}

async function fetchPage(url, page) {
    const jsonUrl = url.split("?")[0].replace(/\/$/, "") + ".json?page=" + page;
    console.log(`Fetching page ${page}: ${jsonUrl}`);
    let retries = 3;
    while (retries > 0) {
        try {
            const response = await axios.get(jsonUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept": "application/json"
                }
            });
            return response.data;
        } catch (error) {
            console.error(`Error fetching page ${page} (attempt ${4 - retries}): ${error.message}`);
            retries--;
            if (retries === 0) return null;
            await sleep(1000);
        }
    }
}

async function searchForum(query, limit = 10) {
    const baseUrl = "https://forum.valuepickr.com";
    const searchUrl = `${baseUrl}/search/query.json?term=${encodeURIComponent(query)}`;
    console.log(`Searching: ${searchUrl}`);

    const response = await axios.get(searchUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json"
        }
    });

    if (!response.data || !response.data.topics) {
        return [];
    }
    const results = response.data.topics || [];
    return results.slice(0, limit);
}

// --- Tool Definitions ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "read_forum_thread",
                description: "Reads a ValuePickr/Discourse forum thread. Handles pagination automatically.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The full URL of the forum topic",
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
                            description: "The search query",
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
                description: "Searches for a keyword within a specific forum thread.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The full URL of the forum topic",
                        },
                        keyword: {
                            type: "string",
                            description: "The keyword or phrase to search for",
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

            const postsPerPage = 20;
            const totalPages = Math.ceil(totalPosts / postsPerPage);

            if (totalPages > 1) {
                const delay = getOptimalDelay(totalPages);
                console.log(`Using ${delay}ms delay for ${totalPages} pages`);
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

            const views = initialData.views || "Unknown";
            const replyCount = initialData.reply_count || (totalPosts - 1);
            const likeCount = initialData.like_count || 0;
            const category = initialData.category_id || "Unknown";

            let transcript = `# Thread: ${title}\n`;
            transcript += `**Metadata**: ${views} views | ${replyCount} replies | ${likeCount} likes | Category ID: ${category}\n`;
            transcript += `**URL**: ${url}\n\n---\n\n`;

            allPosts.sort((a, b) => a.post_number - b.post_number);
            allPosts.forEach((post) => {
                if (post.deleted_at) return;
                const date = new Date(post.created_at).toISOString().split('T')[0];
                const content = stripHtml(post.cooked).trim();
                transcript += `### [${post.post_number}] ${post.username} (${date}):\n${content}\n\n---\n\n`;
            });

            return {
                content: [{ type: "text", text: transcript }],
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
                output += `- **Date**: ${date} | **Replies**: ${topic.posts_count - 1} | **Views**: ${topic.views}\n\n`;
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

            const postsPerPage = 20;
            const totalPages = Math.ceil(totalPosts / postsPerPage);

            if (totalPages > 1) {
                const delay = getOptimalDelay(totalPages);
                console.log(`Using ${delay}ms delay for ${totalPages} pages`);
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

            let output = `# Search Results for "${keyword}" in "${title}"\n\n`;
            output += `**Found ${matchingPosts.length} matching post(s) out of ${totalPosts} total posts**\n\n`;
            output += `**Thread URL**: ${url}\n\n---\n\n`;

            matchingPosts.forEach((post) => {
                const date = new Date(post.created_at).toISOString().split('T')[0];
                const content = stripHtml(post.cooked).trim();
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

// --- SSE Transport Setup ---

let transport;

app.get("/sse", async (req, res) => {
    console.log("New SSE connection established");
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);

    // Keep connection alive
    req.on("close", () => {
        console.log("SSE connection closed");
        // transport.close(); // Optional: clean up
    });
});

app.post("/messages", async (req, res) => {
    if (!transport) {
        res.status(400).send("No active SSE connection");
        return;
    }
    await transport.handlePostMessage(req, res);
});

// Health check
app.get("/", (req, res) => {
    res.json({
        status: "running",
        protocol: "mcp-sse",
        endpoints: {
            sse: "/sse",
            messages: "/messages"
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`ValuePickr MCP Server (SSE) running on port ${PORT}`);
    console.log(`SSE Endpoint: http://localhost:${PORT}/sse`);
});
