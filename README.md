# ValuePickr MCP server

Search and read public [ValuePickr](https://forum.valuepickr.com) forum topics through MCP.

## Run locally

Requires Node.js 20 or newer.

```bash
npm ci
npm start
```

The Streamable HTTP endpoint is `http://127.0.0.1:3000/mcp`. `GET /` is a health check. To connect Codex to the local server, add this to `~/.codex/config.toml`:

```toml
[mcp_servers.valuepickr]
url = "http://127.0.0.1:3000/mcp"
```

For a local stdio connection, run `npm run start:stdio` or point the MCP client at `node /absolute/path/to/valuepickr-mcp/src/index.js`. Both entry points use the same tool definitions. The HTTP endpoint serves the 2026-07-28 protocol and a stateless fallback for 2025 clients. Legacy `/sse` and `/messages` endpoints are no longer provided.

## Tools

- `search_forum`: find matching topics.
- `read_forum_thread`: read a topic in page chunks or, when it fits the configured cap, in full.
- `search_within_thread`: find matching posts within a topic.
- `start_read_forum_thread_job`, `start_search_within_thread_job`, `get_job_status`, `get_job_result`, `cancel_job`: handle longer reads asynchronously.

Topic URLs must use HTTPS on `forum.valuepickr.com`. Chunked calls default to 25 pages and return `has_more` and `next_page` in `structuredContent.data`. A `full_thread` call exceeding the hard page cap returns an error; use chunked calls instead. Oversized output also returns an error so no posts are silently lost.

Jobs are stored in memory and their random IDs act as retrieval handles. They do not survive a process restart. The public endpoint does not currently require authentication; restrict network access or add MCP authorization before serving nonpublic data.

## Configuration

Key environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listening port |
| `HOST` | `127.0.0.1` locally, `0.0.0.0` in production | HTTP bind address |
| `VP_ALLOWED_HOSTS` | Local hosts, plus Render's external hostname on Render | Allowed Host header names, comma separated |
| `VP_ALLOWED_ORIGINS` | Same as allowed hosts | Allowed Origin hostnames, comma separated |
| `VP_DEFAULT_MAX_PAGES` | `25` | Default chunk size |
| `VP_HARD_MAX_PAGES` | `300` | Maximum pages per call |
| `VP_MAX_OUTPUT_CHARS` | `180000` | Output size limit |
| `VP_MAX_CONCURRENCY` | `2` | Concurrent forum requests |
| `VP_HOST_QUOTA_PER_MINUTE` | `120` | Forum requests per minute |
| `VP_JOB_MAX_CONCURRENT` | `4` | Concurrent background jobs |
| `VP_JOB_MAX_TOTAL` | `200` | Jobs retained in memory |

Other cache, retry, and job settings are defined in `src/core/config.js`. For a custom domain, configure `VP_ALLOWED_HOSTS` and browser origin hosts explicitly. The server accepts Render's `RENDER_EXTERNAL_HOSTNAME` for Host validation.

## Tests

Run `npm test` for service and protocol tests. The HTTP tests exercise modern and older client requests, concurrent clients, origin rejection, and job results. `DEPLOYMENT.md` documents the local Render configuration; deployment is a separate step.

## License

ISC.
