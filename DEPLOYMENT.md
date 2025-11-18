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

### GET /
Health check and server info

### GET /tools
List available tools

### POST /read-thread
Read a forum thread

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
  "metadata": { "views": 5991, "replyCount": 18, "likeCount": 31 },
  "postsCount": 25,
  "transcript": "# Thread: Ranjan's portfolio\n..."
}
```

### POST /search
Search the forum

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
