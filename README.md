# ValuePickr MCP Server

A Model Context Protocol (MCP) server for reading and searching ValuePickr forum threads. Works with Codex CLI and other MCP clients.

## Features

- 🔍 **Read forum threads in dual mode** (chunked by default, full-thread on demand)
- 🔎 **Search the forum** for topics
- 🎯 **Search within threads** with chunked or full-thread scan
- ⚡ **Smart rate limiting** - tiered delays based on thread size
- 🛡️ **Robust error handling** - retries, URL validation, deleted post filtering

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

The server uses intelligent, tiered rate limiting:

- **1-50 pages** (1-1000 posts): 0ms delay ⚡ Instant
- **51-99 pages** (1001-1980 posts): 100ms delay 🚀 Fast
- **100+ pages** (2000+ posts): 200ms delay 🛡️ Safe

This keeps you under Discourse's rate limits while maximizing speed.

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

No environment variables are required. The server uses:
- `PORT`: Auto-set by Render (defaults to 3000 locally)
- `NODE_ENV`: Set to `production` in `render.yaml`

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
node test-all-features.js
node test-tiered-latency.js
node test-search-within-thread.js
```

## License

MIT

## Contributing

Pull requests welcome! Please ensure all tests pass before submitting.
