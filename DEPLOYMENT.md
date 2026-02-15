# ValuePickr MCP Server - Deployment Guide

## Files Overview

- **`src/index.js`**: Stdio-based server for local use with Codex CLI
- **`src/server-http.js`**: HTTP-based server for remote deployment (Render, Railway, etc.)

## Local Usage (Codex CLI)

Use the stdio version as you've been doing:

```bash
codex mcp add valuepickr -- node /Users/gaurangmathur/Gaurang/Code/Gemini Website/ValuePickr/valuepickr-mcp/src/index.js
```

## Remote Deployment (Render.com)

### Step 1: Test HTTP Server Locally

```bash
node src/server-http.js
```

Visit `http://localhost:3000` to verify it's running.

### Step 2: Create Render Configuration

Create a `render.yaml` file (already included in this repo).

### Step 3: Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) and sign up (free)
3. Click "New +" → "Web Service"
4. Connect your GitHub repo
5. Render will auto-detect the configuration

### Step 4: Use the Deployed Server

Once deployed, you'll get a URL like:
```
https://valuepickr-mcp.onrender.com
```

Anyone can then use it by adding to their Codex config:

```toml
[mcp_servers.valuepickr-remote]
url = "https://valuepickr-mcp.onrender.com"
```

## API Endpoints (HTTP Server)

The HTTP deployment exposes MCP-over-SSE endpoints (not custom REST endpoints):

### `GET /`
Health check and runtime info

### `GET /sse`
Open MCP SSE stream

### `POST /messages`
JSON-RPC transport endpoint used by MCP clients

Use MCP tools such as:
- `read_forum_thread`
- `search_forum`
- `search_within_thread`
- `start_read_forum_thread_job`
- `start_search_within_thread_job`
- `get_job_status`
- `get_job_result`
- `cancel_job`
