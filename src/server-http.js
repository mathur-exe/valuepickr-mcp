// HTTP-based MCP server for remote deployment (Render, Railway, etc.)
// Implements standard MCP Protocol via Server-Sent Events (SSE)
const express = require("express");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const { createCore } = require("./core/createCore");

const app = express();
const core = createCore({ logger: console, env: process.env });

const server = new Server(
    {
        name: "valuepickr-mcp",
        version: "1.2.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return core.handlers.listTools();
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return core.handlers.callTool(request);
});

let transport;

app.get("/sse", async (req, res) => {
    console.log("New SSE connection established");
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);

    req.on("close", () => {
        console.log("SSE connection closed");
    });
});

app.post("/messages", async (req, res) => {
    if (!transport) {
        res.status(400).send("No active SSE connection");
        return;
    }

    await transport.handlePostMessage(req, res);
});

app.get("/", (req, res) => {
    res.json({
        status: "running",
        protocol: "mcp-sse",
        endpoints: {
            sse: "/sse",
            messages: "/messages",
        },
        cache: core.services.pageCache.getStats(),
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`ValuePickr MCP Server (SSE) running on port ${PORT}`);
    console.log(`SSE Endpoint: http://localhost:${PORT}/sse`);
});
