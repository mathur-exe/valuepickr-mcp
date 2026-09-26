const test = require("node:test");
const assert = require("node:assert/strict");
const { createCore } = require("../src/core/createCore");
const { createHttpApp } = require("../src/server-http");

async function withServer(run, prepareCore) {
    const core = createCore({ env: {} });
    core.services.searchService.searchForum = async () => ({
        text: "fixture results",
        meta: { tool: "search_forum", count: 1 },
    });
    prepareCore?.(core);
    const { app } = await createHttpApp({}, core);
    const listener = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => listener.once("listening", resolve));
    const url = `http://127.0.0.1:${listener.address().port}/mcp`;
    try {
        await run(url);
    } finally {
        await new Promise((resolve) => listener.close(resolve));
    }
}

async function connect(url) {
    const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
    const client = new Client({
        name: "valuepickr-test",
        version: "1.0.0",
    }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    return client;
}

test("modern clients list and call tools independently", async () => {
    await withServer(async (url) => {
        const clients = await Promise.all([connect(url), connect(url)]);
        try {
            assert.equal(clients[0].getNegotiatedProtocolVersion(), "2026-07-28");
            const [listed, first, second] = await Promise.all([
                clients[0].listTools(),
                clients[0].callTool({ name: "search_forum", arguments: { query: "test" } }),
                clients[1].callTool({ name: "search_forum", arguments: { query: "test" } }),
            ]);
            assert.equal(listed.tools.length, 8);
            assert.equal(first.structuredContent.data.count, 1);
            assert.equal(second.content[0].text, "fixture results");
        } finally {
            await Promise.all(clients.map((client) => client.close()));
        }
    });
});

test("HTTP endpoint rejects untrusted origins and topic hosts", async () => {
    await withServer(async (url) => {
        const response = await fetch(url, {
            method: "POST",
            headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        });
        assert.equal(response.status, 403);

        const client = await connect(url);
        try {
            const result = await client.callTool({
                name: "read_forum_thread",
                arguments: { url: "http://127.0.0.1/t/private/1" },
            });
            assert.equal(result.isError, true);
            assert.match(result.content[0].text, /ValuePickr forum topic URL/);
        } finally {
            await client.close();
        }
    });
});

test("long-running jobs return an opaque handle and a result", async () => {
    await withServer(async (url) => {
        const client = await connect(url);
        try {
            const started = await client.callTool({
                name: "start_read_forum_thread_job",
                arguments: { url: "https://forum.valuepickr.com/t/tata-elxsi/236" },
            });
            const jobId = started.structuredContent.data.job_id;
            assert.match(jobId, /^[0-9a-f-]{36}$/);
            const result = await client.callTool({ name: "get_job_result", arguments: { job_id: jobId } });
            assert.equal(result.content[0].text, "fixture thread");
            assert.equal(result.structuredContent.data.has_more, false);
        } finally {
            await client.close();
        }
    }, (core) => {
        core.services.threadService.readForumThread = async () => ({
            text: "fixture thread",
            meta: { has_more: false, next_page: null },
        });
    });
});

test("stdio entry point serves the same tools", async () => {
    const { Client } = await import("@modelcontextprotocol/client");
    const { StdioClientTransport } = await import("@modelcontextprotocol/client/stdio");
    const client = new Client({ name: "stdio-test", version: "1.0.0" }, {
        versionNegotiation: { mode: { pin: "2026-07-28" } },
    });
    try {
        await client.connect(new StdioClientTransport({
            command: process.execPath,
            args: [require.resolve("../src/index.js")],
        }));
        assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");
        assert.equal((await client.listTools()).tools.length, 8);
    } finally {
        await client.close();
    }
});

test("2025 clients can initialize on the new endpoint", async () => {
    await withServer(async (url) => {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: 1, method: "initialize",
                params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy-test", version: "1.0.0" } },
            }),
        });
        assert.equal(response.status, 200);
        assert.match(await response.text(), /"protocolVersion":"2025-11-25"/);
    });
});
