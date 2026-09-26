# Deployment notes

The live Render service is `valuepickr-mcp-1`, connected to this repository's `main` branch with auto-deploy enabled. `render.yaml` records its intended configuration; it applies to the existing service only if managed through a Render Blueprint.

The server exposes `/mcp` as its Streamable HTTP endpoint and `GET /` for health checks. On Render, it binds to `0.0.0.0:$PORT` and accepts Render's `RENDER_EXTERNAL_HOSTNAME`. Set `VP_ALLOWED_HOSTS` for custom domains and `VP_ALLOWED_ORIGINS` for browser clients if needed. The existing service starts with `node src/server-http.js`; use `npm ci` as its build command and `/` as its health check path.

After deployment, configure a client with the full MCP endpoint URL:

```toml
[mcp_servers.valuepickr]
url = "https://valuepickr-mcp-1.onrender.com/mcp"
```

The separate `https://valuepickr-mcp.onrender.com` service is suspended. The old `/sse` and `/messages` endpoints are not part of this version.

Run `npm test` before deploying, then verify tool listing, a forum search, a thread read, and a background job against the public endpoint.
