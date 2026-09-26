#!/usr/bin/env node
const { createServerFactory } = require("./mcp-server");

async function main() {
    const { serveStdio } = await import("@modelcontextprotocol/server/stdio");
    const factory = await createServerFactory();
    await serveStdio(factory);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
