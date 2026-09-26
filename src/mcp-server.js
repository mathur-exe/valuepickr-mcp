const { createCore } = require("./core/createCore");

async function createServerFactory(core = createCore()) {
    const [{ McpServer }, z] = await Promise.all([
        import("@modelcontextprotocol/server"),
        import("zod/v4"),
    ]);

    const pageOptions = {
        start_page: z.int().positive().optional().describe("First 1-based page, default 1"),
        max_pages: z.int().positive().max(core.config.pagination.hardMaxPages).optional()
            .describe(`Pages to fetch, default ${core.config.pagination.defaultMaxPages}, maximum ${core.config.pagination.hardMaxPages}`),
        full_thread: z.boolean().optional().describe("Read all pages when the topic fits the page cap"),
        include_full_content: z.boolean().optional().describe("Return full posts; false returns short excerpts"),
    };
    const threadOptions = { url: z.url().describe("HTTPS ValuePickr forum topic URL"), ...pageOptions };
    const searchWithinSchema = z.object({
        ...threadOptions,
        keyword: z.string().trim().min(1).max(200).describe("Keyword or phrase to find"),
        case_sensitive: z.boolean().optional(),
    });
    const jobIdSchema = z.object({ job_id: z.string().uuid() });
    const tools = [
        { name: "read_forum_thread", description: "Read a ValuePickr topic in page chunks or in full when it fits the page cap.", schema: z.object(threadOptions) },
        { name: "search_forum", description: "Search ValuePickr forum topics.", schema: z.object({ query: z.string().trim().min(1).max(200), limit: z.int().min(1).max(50).optional() }) },
        { name: "search_within_thread", description: "Find posts containing a keyword in a topic.", schema: searchWithinSchema },
        { name: "start_read_forum_thread_job", description: "Start a background topic read and return its job ID.", schema: z.object(threadOptions) },
        { name: "start_search_within_thread_job", description: "Start a background search within a topic.", schema: searchWithinSchema },
        { name: "get_job_status", description: "Get the status of a background job.", schema: jobIdSchema },
        { name: "get_job_result", description: "Get the result of a completed background job.", schema: jobIdSchema },
        { name: "cancel_job", description: "Cancel a background job.", schema: jobIdSchema },
    ];
    const outputSchema = z.object({ text: z.string(), data: z.record(z.string(), z.unknown()) });

    return function buildServer() {
        const server = new McpServer({ name: "valuepickr-mcp", version: "2.0.0" });
        for (const tool of tools) {
            server.registerTool(tool.name, {
                description: tool.description,
                inputSchema: tool.schema,
                outputSchema,
                annotations: { readOnlyHint: !tool.name.startsWith("start_") && tool.name !== "cancel_job" },
            }, async (args) => core.handlers.callTool({ params: { name: tool.name, arguments: args } }));
        }
        return server;
    };
}

module.exports = { createServerFactory };
