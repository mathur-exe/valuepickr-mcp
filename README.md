# ValuePickr MCP Server

A Model Context Protocol (MCP) server for reading and searching ValuePickr forum threads. Works with Codex CLI and other MCP clients.

## Features

- 🔍 **Read full forum threads** with automatic pagination
- 🔎 **Search the forum** for topics
- 🎯 **Search within threads** for specific keywords
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

## API Documentation

### Endpoints

#### `GET /`
Health check - returns server info and available endpoints.

#### `GET /tools`
Lists all available tools.

#### `POST /read-thread`
Reads a complete forum thread.

**Request:**
```json
{
  "url": "https://forum.valuepickr.com/t/ranjans-portfolio/45082"
}
```

**Response:**
```json
{
  "success": true,
  "title": "Ranjan's portfolio",
  "metadata": {
    "views": 5991,
    "replyCount": 18,
    "likeCount": 31,
    "category": 5
  },
  "postsCount": 25,
  "transcript": "# Thread: Ranjan's portfolio\n..."
}
```

#### `POST /search`
Searches the forum for topics.

**Request:**
```json
{
  "query": "Asian Paints",
  "limit": 5
}
```

**Response:**
```json
{
  "success": true,
  "query": "Asian Paints",
  "count": 5,
  "results": [
    {
      "rank": 1,
      "title": "Asian paints - color it green",
      "url": "https://forum.valuepickr.com/t/...",
      "date": "2024-01-15",
      "replies": 3,
      "views": 1234
    }
  ]
}
```

#### `POST /search-within-thread`
Searches for keywords within a specific thread.

**Request:**
```json
{
  "url": "https://forum.valuepickr.com/t/ranvirs-portfolio/1237",
  "keyword": "Lenskart",
  "case_sensitive": false
}
```

**Response:**
```json
{
  "success": true,
  "title": "Ranvir's portfolio",
  "keyword": "Lenskart",
  "matchCount": 5,
  "totalPosts": 1700,
  "matches": [
    {
      "postNumber": 234,
      "username": "ranvir",
      "date": "2023-05-12",
      "snippet": "...I've been tracking Lenskart for a while...",
      "fullContent": "..."
    }
  ]
}
```

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
npm start
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
