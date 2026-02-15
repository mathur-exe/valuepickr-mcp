#!/usr/bin/env node
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const { createCore } = require("./core/createCore");

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

const transport = new StdioServerTransport();
server.connect(transport);
