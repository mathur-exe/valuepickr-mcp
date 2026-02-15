function getToolDefinitions(config) {
    const defaultMaxPages = config.pagination.defaultMaxPages;
    const hardMaxPages = config.pagination.hardMaxPages;

    return [
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
                        description: `Maximum pages to fetch in this call (default: ${defaultMaxPages}, max: ${hardMaxPages}). Ignored when full_thread=true.`,
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
                        description: "The keyword or phrase to search for",
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
                        description: `Maximum pages to scan in this call (default: ${defaultMaxPages}, max: ${hardMaxPages}). Ignored when full_thread=true.`,
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
        {
            name: "start_read_forum_thread_job",
            description: "Starts an asynchronous read_forum_thread job and returns a job ID.",
            inputSchema: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "The full URL of the forum topic",
                    },
                    start_page: {
                        type: "number",
                    },
                    max_pages: {
                        type: "number",
                    },
                    full_thread: {
                        type: "boolean",
                    },
                    include_full_content: {
                        type: "boolean",
                    },
                },
                required: ["url"],
            },
        },
        {
            name: "start_search_within_thread_job",
            description: "Starts an asynchronous search_within_thread job and returns a job ID.",
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
                    },
                    start_page: {
                        type: "number",
                    },
                    max_pages: {
                        type: "number",
                    },
                    full_thread: {
                        type: "boolean",
                    },
                    include_full_content: {
                        type: "boolean",
                    },
                },
                required: ["url", "keyword"],
            },
        },
        {
            name: "get_job_status",
            description: "Gets current status and progress for an async job.",
            inputSchema: {
                type: "object",
                properties: {
                    job_id: {
                        type: "string",
                        description: "Job ID returned by start_*_job tool",
                    },
                },
                required: ["job_id"],
            },
        },
        {
            name: "get_job_result",
            description: "Gets final result for an async job, if completed.",
            inputSchema: {
                type: "object",
                properties: {
                    job_id: {
                        type: "string",
                        description: "Job ID returned by start_*_job tool",
                    },
                },
                required: ["job_id"],
            },
        },
        {
            name: "cancel_job",
            description: "Requests cancellation of an async job.",
            inputSchema: {
                type: "object",
                properties: {
                    job_id: {
                        type: "string",
                        description: "Job ID returned by start_*_job tool",
                    },
                },
                required: ["job_id"],
            },
        },
    ];
}

module.exports = {
    getToolDefinitions,
};
