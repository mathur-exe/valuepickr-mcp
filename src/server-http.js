// HTTP-based MCP server for remote deployment (Render, Railway, etc.)
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// --- Helpers (same as stdio version) ---

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Get optimal delay based on thread size to avoid rate limits
function getOptimalDelay(totalPages) {
    if (totalPages <= 50) return 0;      // No delay for small-medium threads (1-1000 posts)
    if (totalPages <= 99) return 100;    // 100ms for large threads (1001-1980 posts)
    return 200;                          // 200ms for very large threads (2000+ posts)
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

// --- HTTP Endpoints ---

// Health check
app.get("/", (req, res) => {
    res.json({
        name: "ValuePickr MCP Server",
        version: "1.1.0",
        status: "running",
        endpoints: {
            health: "GET /",
            tools: "GET /tools",
            readThread: "POST /read-thread",
            search: "POST /search",
            searchWithinThread: "POST /search-within-thread"
        }
    });
});

// List available tools
app.get("/tools", (req, res) => {
    res.json({
        tools: [
            {
                name: "read_forum_thread",
                description: "Reads a ValuePickr/Discourse forum thread. Handles pagination automatically.",
                parameters: {
                    url: "string (required) - Full URL of the forum topic"
                }
            },
            {
                name: "search_forum",
                description: "Searches the ValuePickr forum for topics matching a query.",
                parameters: {
                    query: "string (required) - Search query",
                    limit: "number (optional, default: 10) - Number of results"
                }
            },
            {
                name: "search_within_thread",
                description: "Searches for a keyword within a specific forum thread.",
                parameters: {
                    url: "string (required) - Full URL of the forum topic",
                    keyword: "string (required) - Keyword to search for",
                    case_sensitive: "boolean (optional, default: false) - Case-sensitive search"
                }
            }
        ]
    });
});

// Read forum thread
app.post("/read-thread", async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: "URL is required" });
        }

        const initialData = await fetchTopic(url);

        if (!initialData || !initialData.post_stream) {
            return res.status(400).json({ error: "Invalid Discourse topic URL or no data returned" });
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

        res.json({
            success: true,
            title,
            metadata: { views, replyCount, likeCount, category },
            postsCount: allPosts.filter(p => !p.deleted_at).length,
            transcript
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search within thread
app.post("/search-within-thread", async (req, res) => {
    try {
        const { url, keyword, case_sensitive = false } = req.body;

        if (!url || !keyword) {
            return res.status(400).json({ error: "URL and keyword are required" });
        }

        // 1. Fetch the entire thread
        const initialData = await fetchTopic(url);

        if (!initialData || !initialData.post_stream) {
            return res.status(400).json({ error: "Invalid Discourse topic URL or no data returned" });
        }

        const { title, post_stream } = initialData;
        const totalPosts = initialData.posts_count || post_stream.stream.length;
        let allPosts = [...post_stream.posts];

        // 2. Fetch all pages
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
            return res.json({
                success: true,
                title,
                keyword,
                matchCount: 0,
                totalPosts,
                matches: []
            });
        }

        // 4. Format results
        const matches = matchingPosts.map((post) => {
            const date = new Date(post.created_at).toISOString().split('T')[0];
            const content = stripHtml(post.cooked).trim();

            // Create snippet
            const searchContent = case_sensitive ? content : content.toLowerCase();
            const keywordIndex = searchContent.indexOf(searchTerm);
            const snippetStart = Math.max(0, keywordIndex - 100);
            const snippetEnd = Math.min(content.length, keywordIndex + searchTerm.length + 100);
            const snippet = content.substring(snippetStart, snippetEnd);
            const prefix = snippetStart > 0 ? "..." : "";
            const suffix = snippetEnd < content.length ? "..." : "";

            return {
                postNumber: post.post_number,
                username: post.username,
                date,
                snippet: `${prefix}${snippet}${suffix}`,
                fullContent: content
            };
        });

        res.json({
            success: true,
            title,
            keyword,
            matchCount: matches.length,
            totalPosts,
            matches
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.post("/search", async (req, res) => {
    try {
        const { query, limit = 10 } = req.body;

        if (!query) {
            return res.status(400).json({ error: "Query is required" });
        }

        const results = await searchForum(query, limit);

        if (results.length === 0) {
            return res.json({
                success: true,
                query,
                count: 0,
                results: []
            });
        }

        const formattedResults = results.map((topic, index) => ({
            rank: index + 1,
            title: topic.title,
            url: `https://forum.valuepickr.com/t/${topic.slug}/${topic.id}`,
            date: new Date(topic.created_at).toISOString().split('T')[0],
            replies: topic.posts_count - 1,
            views: topic.views
        }));

        res.json({
            success: true,
            query,
            count: formattedResults.length,
            results: formattedResults
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`ValuePickr MCP Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/`);
    console.log(`Tools list: http://localhost:${PORT}/tools`);
});
