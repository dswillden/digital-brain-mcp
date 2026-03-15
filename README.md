# 🧠 Digital Brain MCP

A **Second Brain** powered by [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), [Google Gemini Embedding 2](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2-preview), and [Supabase pgvector](https://supabase.com/docs/guides/ai) — deployed on [Vercel](https://vercel.com).

Connect any MCP-compatible AI client (Claude, Cursor, OpenCode, Copilot, etc.) and give it persistent long-term memory. Store notes, code, research, decisions, and any knowledge — then recall it instantly with semantic search.

---

## Architecture

```
AI Client (Claude / Cursor / OpenCode / Copilot)
        │
        ▼  MCP Protocol (Streamable HTTP + SSE)
        │  Authorization: Bearer <api-key>
┌──────────────────────────────┐
│   Vercel (Next.js)           │
│   /api/mcp/[transport]       │
│                              │
│   ┌── Auth Middleware ──┐    │
│   │  Bearer token check │    │
│   └─────────────────────┘    │
│                              │
│   Tools:                     │
│    • store_memory            │
│    • search_memory           │
│    • list_memories           │
│    • update_memory           │
│    • delete_memory           │
│    • get_stats               │
└──────────┬───────────────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐  ┌──────────────┐
│ Gemini  │  │  Supabase    │
│ Embed 2 │  │  PostgreSQL  │
│  API    │  │  + pgvector  │
└─────────┘  │  vector(768) │
             └──────────────┘
```

## How It Works

1. **You say** (in Claude/Cursor/etc): "Remember that the EBR system uses Azure Functions for the API layer"
2. **MCP client** calls your Digital Brain's `store_memory` tool
3. **Gemini Embedding 2** converts the text into a 768-dimension vector
4. **Supabase** stores the text + vector in PostgreSQL with pgvector
5. **Later, you ask**: "What tech does the EBR system use?"
6. **`search_memory`** embeds your query, runs cosine similarity search, returns the matching memory

---

## Security Model

The server uses **Bearer token authentication** on every request:

- **Fail-closed**: If no API keys are configured, ALL requests are rejected
- **Multi-key support**: Set multiple comma-separated keys in `DIGITAL_BRAIN_API_KEYS` so each client gets its own key (and you can rotate independently)
- **Row Level Security (RLS)**: Enabled on the Supabase `memories` table — only `service_role` can access data. The anon key has zero access.
- **Service Role Key**: Only stored server-side in Vercel env vars, never exposed to clients

### Generating API Keys

```bash
# Generate a strong 256-bit key
openssl rand -hex 32
```

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Embeddings** | Gemini Embedding 2 (`gemini-embedding-2-preview`) | Multimodal embeddings — text, images, audio, video, PDF all in one vector space |
| **Vector DB** | Supabase + pgvector | PostgreSQL with vector similarity search (HNSW index, cosine distance) |
| **MCP Server** | Next.js + `mcp-handler` | Exposes tools via MCP protocol with SSE transport |
| **Hosting** | Vercel | Serverless deployment, auto-scaling, scale-to-zero |
| **Session Store** | Upstash Redis (via Vercel KV) | Redis-backed SSE session management |
| **Auth** | Bearer token middleware | API key validation on every request |

### Why 768 dimensions?

Gemini Embedding 2 outputs 3072 dimensions by default but supports [Matryoshka Representation Learning (MRL)](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-embedding-2/) — you can truncate to 768 with minimal quality loss. This saves ~75% storage and makes queries significantly faster, which matters a lot more for a personal knowledge base than that last fraction of accuracy.

---

## MCP Tools Reference

### `store_memory`
Save a new piece of knowledge to the Digital Brain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | ✅ | The text content to store |
| `source` | string | | Where it came from (e.g. `"conversation"`, `"web-research"`, a URL) |
| `tags` | string[] | | Tags for categorization (e.g. `["work", "azure", "ebr"]`) |
| `content_type` | enum | | `text`, `note`, `code`, `conversation`, `research`, `decision`, `reference` |
| `metadata` | object | | Arbitrary structured metadata |

### `search_memory`
Semantic search across everything stored. Your query is embedded and matched by cosine similarity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Natural language search query |
| `limit` | number | | Max results (default 10, max 50) |
| `threshold` | number | | Minimum similarity 0–1 (default 0.4) |
| `filter_tags` | string[] | | Only return memories with at least one matching tag |

### `list_memories`
Browse memories with optional filters (no embedding needed).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content_type` | string | | Filter by type |
| `tags` | string[] | | Filter by tags |
| `limit` | number | | Max results (default 20, max 100) |
| `offset` | number | | Pagination offset |

### `update_memory`
Modify an existing memory. If content changes, a new embedding is generated automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | ✅ | Memory ID (from search/list results) |
| `content` | string | | New content (re-embeds automatically) |
| `tags` | string[] | | Replace tags |
| `source` | string | | Update source |
| `metadata` | object | | Replace metadata |

### `delete_memory`
Permanently remove a memory by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | ✅ | Memory ID to delete |

### `get_stats`
Get brain statistics: total count, breakdown by type, and top tags.

*No parameters.*

---

## Setup Guide

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Supabase](https://supabase.com/) account (free tier works)
- A [Google AI Studio](https://aistudio.google.com/) API key (free tier)
- A [Vercel](https://vercel.com/) account (free Hobby plan works)

### Step 1: Clone the Repo

```bash
git clone https://github.com/YOUR_USERNAME/digital-brain-mcp.git
cd digital-brain-mcp
npm install
```

### Step 2: Set Up Supabase

1. Create a new Supabase project (or use an existing one)
2. Go to **SQL Editor** in the Supabase dashboard
3. Copy the contents of `supabase/migrations/001_create_memories.sql`
4. Paste and run the entire SQL script
5. This creates: the `memories` table, pgvector extension, HNSW index, search functions, RLS policies, and stat helpers

**Get your credentials** from Supabase → Settings → API:
- `SUPABASE_URL` — the Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` secret (NOT the anon key)

### Step 3: Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key
3. Save it as `GEMINI_API_KEY`

### Step 4: Generate Your MCP API Key

```bash
openssl rand -hex 32
```

Save the output as `DIGITAL_BRAIN_API_KEYS`.

### Step 5: Local Development

```bash
# Create .env.local with your keys
cp .env.example .env.local
# Edit .env.local with your actual values

# Start the dev server
npm run dev
```

The MCP endpoint will be at `http://localhost:3000/api/mcp/sse`.

### Step 6: Deploy to Vercel

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. Set environment variables in Vercel dashboard:
   - `DIGITAL_BRAIN_API_KEYS` — your generated key(s)
   - `GEMINI_API_KEY` — your Google AI key
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — your Supabase service role key
4. Create a **KV (Redis)** store: Vercel dashboard → Storage → Create KV Database
   - This auto-sets `REDIS_URL`
5. Set a **firewall bypass** for MCP: Settings → Security → Firewall → Add rule:
   - Condition: "Request path contains `/api/mcp`"
   - Action: "Bypass"
6. Deploy!

Your production MCP endpoint: `https://digital-brain-mcp.vercel.app/api/mcp/sse`

---

## Connecting AI Clients

### Claude Desktop / Claude Code

Add to your Claude MCP config (`~/.claude/claude_desktop_config.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "digital-brain": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://digital-brain-mcp.vercel.app/api/mcp/sse",
        "--header",
        "Authorization:Bearer YOUR_API_KEY_HERE"
      ]
    }
  }
}
```

### Cursor

Go to **Settings → Cursor Settings → Tools & MCP → Add Server**:
- Type: SSE
- URL: `https://digital-brain-mcp.vercel.app/api/mcp/sse`
- Headers: `Authorization: Bearer YOUR_API_KEY_HERE`

### OpenCode / Any MCP Client

Use the SSE endpoint `https://digital-brain-mcp.vercel.app/api/mcp/sse` with an `Authorization: Bearer <key>` header.

### Perplexity / Computer

Connect via the MCP config pattern above, or access the Supabase database directly through an existing connector.

---

## Project Structure

```
digital-brain-mcp/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── mcp/
│   │   │       └── [transport]/
│   │   │           └── route.ts    ← MCP endpoint (tools + auth)
│   │   ├── layout.tsx              ← Root layout
│   │   └── page.tsx                ← Landing page
│   └── lib/
│       ├── auth.ts                 ← Bearer token authentication
│       ├── embeddings.ts           ← Gemini Embedding 2 client
│       └── supabase.ts             ← Supabase client + data helpers
├── supabase/
│   └── migrations/
│       └── 001_create_memories.sql ← Full database schema
├── .env.example                    ← Template for environment variables
├── .mcp.json                       ← MCP client connection config
├── package.json
├── tsconfig.json
├── next.config.js
└── README.md                       ← This file
```

---

## Example Usage

Once connected, you can say things like:

- **"Remember that the Revvity Signals API uses OAuth 2.0 client credentials flow"**
  → Calls `store_memory` with appropriate tags

- **"What do I know about authentication patterns?"**
  → Calls `search_memory`, finds semantically related memories

- **"Show me all my code snippets"**
  → Calls `list_memories` with `content_type: "code"`

- **"How many memories do I have?"**
  → Calls `get_stats`

---

## Cost Estimate

| Service | Free Tier | Paid Threshold |
|---------|-----------|----------------|
| **Supabase** | 500 MB database, 1 GB storage | ~650K memories at 768d before hitting limit |
| **Vercel** | Hobby plan (100 GB bandwidth) | Heavy team usage |
| **Gemini API** | Generous free quota | Thousands of embeddings/day |
| **Upstash Redis** | 10K commands/day | Heavy concurrent sessions |

For personal second-brain use, everything stays well within free tiers.

---

## Future Enhancements

- [ ] **Multimodal storage**: Store images/PDFs directly (Gemini Embedding 2 supports them natively)
- [ ] **Auto-tagging**: Use an LLM to suggest tags for new memories
- [ ] **Bulk import**: CLI tool to import from Obsidian, Notion, or markdown files
- [ ] **Scheduled embedding refresh**: Re-embed old memories when the model improves
- [ ] **Multi-user support**: Add user_id column and JWT auth for shared deployments

---

## License

MIT
