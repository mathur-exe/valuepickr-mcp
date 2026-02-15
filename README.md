# ValuePickr MCP Server

A Model Context Protocol (MCP) server for reading and searching ValuePickr forum threads. Works with Codex CLI and other MCP clients.

## Features

- 🔍 **Read forum threads in dual mode** (chunked by default, full-thread on demand)
- 🔎 **Search the forum** for topics
- 🎯 **Search within threads** with chunked or full-thread scan
- ⚡ **Config-driven rate limiting** - concurrency, global delay, and per-host quotas
- 🛡️ **Robust error handling** - retries, 429 backoff, URL validation, deleted post filtering
- 💾 **Raw page JSON cache** - TTL + stale-while-revalidate
- 🧵 **Async job mode** - start/poll/cancel long-running thread jobs

## Quick Start

### Option 1: Use the Deployed Server (Easiest)

The server is already deployed and ready to use:

**URL**: `https://valuepickr-mcp.onrender.com`

Test it:
```bash
curl https://valuepickr-mcp.onrender.com/
```

### Option 2: Run Locally with Codex

1. **Clone the repo**:
```bash
git clone https://github.com/YOUR_USERNAME/valuepickr-mcp.git
cd valuepickr-mcp
npm install
```

2. **Add to Codex**:
```bash
codex mcp add valuepickr -- node /path/to/valuepickr-mcp/src/index.js
```

3. **Use it**:
```bash
codex
# Then ask: "Read this thread: https://forum.valuepickr.com/t/ranjans-portfolio/45082"
```

## Dual Mode (Recommended)

`read_forum_thread` and `search_within_thread` now support both:

- **Chunked mode (default)**: fast and reliable for large threads
- **Full-thread mode**: set `full_thread=true` to fetch everything in one call

### Parameters

- `start_page` (number, default `1`)
- `max_pages` (number, default `25`, max `300`)
- `full_thread` (boolean, default `false`)
- `include_full_content` (boolean, default `true`)

### Continuation Metadata

Tool responses include:

- `has_more=true/false`
- `next_page=<n>` when more pages remain

### Example workflow (large thread)

1. Call `read_forum_thread` with `start_page=1`, `max_pages=25`
2. If `has_more=true`, call again with `start_page=next_page`
3. Repeat until `has_more=false`

## Async Job Tools

For long-running operations, use async job tools:

- `start_read_forum_thread_job`
- `start_search_within_thread_job`
- `get_job_status`
- `get_job_result`
- `cancel_job`

Typical flow:

1. Start a job (`start_*_job`) and capture `job_id`
2. Poll `get_job_status`
3. Fetch final output with `get_job_result`
4. Cancel anytime via `cancel_job`

## API Documentation (Standard MCP over SSE)

This server implements the **Model Context Protocol (MCP)** over HTTP using Server-Sent Events (SSE).

### Endpoints

#### `GET /sse`
Establishes the SSE connection. Use this URL when configuring your MCP client (e.g., ChatGPT, Claude Desktop).

#### `POST /messages`
Handles JSON-RPC messages (automatically handled by MCP clients).

#### `GET /`
Health check - returns server info.

### Connecting to ChatGPT / Claude Desktop

1. **URL**: `https://valuepickr-mcp.onrender.com/sse`
2. **Transport**: SSE (Server-Sent Events)


## Rate Limiting

The server uses a rate controller with:

- global concurrency limits
- global inter-request delay
- per-host quota-per-minute
- adaptive retry/backoff for 429 and transient failures

## Deployment

### Deploy to Render (Free)

1. **Fork/Clone this repo**
2. **Push to GitHub**
3. **Sign up on [Render.com](https://render.com)** (no credit card needed)
4. **Create a new Web Service**:
   - Connect your GitHub repo
   - Render auto-detects `render.yaml`
   - Click "Create Web Service"
5. **Done!** Your server will be live at `https://your-service-name.onrender.com`

### Environment Variables

Key environment variables:

- `VP_MAX_CONCURRENCY` (default: `2`)
- `VP_GLOBAL_DELAY_MS` (default: `400`)
- `VP_HOST_QUOTA_PER_MINUTE` (default: `120`)
- `VP_RETRY_ATTEMPTS` (default: `3`)
- `VP_RETRY_BASE_MS` (default: `1000`)
- `VP_RETRY_MAX_MS` (default: `10000`)
- `VP_RETRY_JITTER_MS` (default: `250`)
- `VP_CACHE_ENABLED` (default: `true`)
- `VP_CACHE_TTL_MS` (default: `300000`)
- `VP_CACHE_SWR_MS` (default: `1200000`)
- `VP_CACHE_MAX_ENTRIES` (default: `500`)
- `VP_JOB_MAX_CONCURRENT` (default: `4`)
- `VP_JOB_RETENTION_MS` (default: `1800000`)
- `VP_JOB_MAX_TOTAL` (default: `200`)
- `VP_JOB_CLEANUP_INTERVAL_MS` (default: `60000`)

Platform/runtime variables:

- `PORT` (Auto-set by Render, defaults to `3000` locally)
- `NODE_ENV` (`production` in `render.yaml`)

## Development

### Run the HTTP server locally:
```bash
npm run start:http
# or
node src/server-http.js
```

### Run the stdio server (for Codex):
```bash
npm run start:stdio
# or
node src/index.js
```

### Run tests:
```bash
npm test
# or
node test-all-features.js
node test-tiered-latency.js
node test-search-within-thread.js
```

## License

MIT

## Contributing

Pull requests welcome! Please ensure all tests pass before submitting.
