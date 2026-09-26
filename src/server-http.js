const { createServerFactory } = require("./mcp-server");
const { createCore } = require("./core/createCore");

async function createHttpApp(env = process.env, core = createCore({ env })) {
    const [{ createMcpHandler }, { toNodeHandler }, { createMcpExpressApp }] = await Promise.all([
        import("@modelcontextprotocol/server"),
        import("@modelcontextprotocol/node"),
        import("@modelcontextprotocol/express"),
    ]);
    const factory = await createServerFactory(core);
    const host = env.HOST || (env.NODE_ENV === "production" || env.RENDER_EXTERNAL_HOSTNAME ? "0.0.0.0" : "127.0.0.1");
    const allowedHosts = (env.VP_ALLOWED_HOSTS || "localhost,127.0.0.1,[::1]")
        .split(",").map((value) => value.trim()).filter(Boolean);
    if (env.RENDER_EXTERNAL_HOSTNAME) allowedHosts.push(env.RENDER_EXTERNAL_HOSTNAME);
    const allowedOrigins = (env.VP_ALLOWED_ORIGINS || allowedHosts.join(","))
        .split(",").map((value) => value.trim()).filter(Boolean);
    const app = createMcpExpressApp({ host, allowedHosts, allowedOrigins, jsonLimit: "64kb" });
    const handler = createMcpHandler(factory);
    const nodeHandler = toNodeHandler(handler);

    app.all("/mcp", (req, res) => nodeHandler(req, res, req.body));
    app.get("/", (_req, res) => res.json({ status: "running", protocol: "mcp-streamable-http", endpoint: "/mcp" }));
    return { app, handler, core, host };
}

async function main() {
    const { app, host } = await createHttpApp();
    const port = Number(process.env.PORT || 3000);
    app.listen(port, host, () => console.log(`ValuePickr MCP listening at http://${host}:${port}/mcp`));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { createHttpApp };
