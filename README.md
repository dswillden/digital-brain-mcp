# 🧠 Digital Brain MCP

A **Second Brain** powered by [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), [Google Gemini Embedding 2](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2-preview), and [Supabase pgvector](https://supabase.com/docs/guides/ai) — deployed on [Vercel](https://vercel.com).

Connect any MCP-compatible AI client (Claude, Cursor, OpenCode, Copilot, etc.) and give it persistent long-term memory. Store text, images, PDFs, audio, and video — all embedded in a **unified vector space** for cross-modal semantic search.

---

## Architecture

```
AI Client (Claude / Cursor / OpenCode / Copilot)
        │
        ▼  MCP Protocol (Streamable HTTP + SSE)
        │  Authorization: Bearer <api-key>
┌──────────────────────────────────────────┐
│   Vercel (Next.js)                       │
│   /api/mcp/[transport]                   │
│                                          │
│   ┌── Auth Middleware ──┐                │
│   │  Bearer token check │                │
│   └─────────────────────┘                │
│                                          │
│   Tools:                                 │
│    • store_memory      (text)            │
│    • store_file        (base64 upload)   │
│    • store_file_from_url (URL fetch)     │
│    • search_memory     (cross-modal)     │
│    • get_file_url      (signed download) │
│    • list_memories                       │
│    • update_memory                       │
│    • delete_memory                       │
│    • get_stats                           │
└──────────┬─────────────┬─────────────────┘
           │             │
     ┌─────┴─────┐  ┌───┴──────────────┐
     ▼           ▼  ▼                  ▼
┌─────────┐  ┌──────────────┐  ┌───────────┐
│ Gemini  │  │  Supabase    │  │ Supabase  │
│ Embed 2 │  │  PostgreSQL  │  │ Storage   │
│  API    │  │  + pgvector  │  │ (files)   │
│         │  │  vector(768) │  │           │
└─────────┘  └──────────────┘  └───────────┘
```

## Multimodal Embedding

Gemini Embedding 2 maps **all modalities into the same 768-dimension vector space**. This means:

- A text query like "architecture diagram" can find a stored PNG image
- Searching for "meeting notes" can return an audio recording of a meeting
- A PDF of a research paper and a text summary live side by side in the same search space

### Supported File Types

| Modality | MIME Types | Limits |
|----------|-----------|--------|
| **Image** | `image/png`, `image/jpeg`, `image/webp`, `image/gif` | Up to 6 per request |
| **PDF** | `application/pdf` | Up to 6 pages |
| **Audio** | `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/mp3`, `audio/aac`, `audio/flac` | — |
| **Video** | `video/mp4`, `video/quicktime`, `video/webm` | Up to 120 seconds |

### Interleaved Embedding

When you provide a **description** alongside a file, the system creates an _interleaved embedding_ — a single vector that captures both the visual/audio content AND your text description. This produces significantly richer search results compared to embedding the file alone.

---

## How It Works

1. **You say** (in Claude/Cursor/etc): "Remember that the EBR system uses Azure Functions for the API layer"
2. **MCP client** calls your Digital Brain's `store_memory` tool
3. **Gemini Embedding 2** converts the text into a 768-dimension vector
4. **Supabase** stores the text + vector in PostgreSQL with pgvector
5. **Later, you ask**: "What tech does the EBR system use?"
6. **`search_memory`** embeds your query, runs cosine similarity search, returns the matching memory

For files, the flow is the same — except the file bytes are sent to Gemini for multimodal embedding, and the raw file is stored in Supabase Storage with a signed download URL generated on retrieval.

---

## Security Model

The server uses **Bearer token authentication** on every request:

- **Fail-closed**: If no API keys are configured, ALL requests are rejected
- **Multi-key support**: Set multiple comma-separated keys in `DIGITAL_BRAIN_API_KEYS` so each client gets its own key (and you can rotate independently)
- **Row Level Security (RLS)**: Enabled on the Supabase `memories` table — only `service_role` can access data. The anon key has zero access.
- **Service Role Key**: Only stored server-side in Vercel env vars, never exposed to clients
- **Private Storage**: The `brain-files` bucket is private — files are only accessible via time-limited signed URLs (1 hour expiry)

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
| **File Storage** | Supabase Storage | Private bucket for images, PDFs, audio, video with signed URL access |
| **MCP Server** | Next.js + `mcp-handler` | Exposes tools via MCP protocol with SSE transport |
| **Hosting** | Vercel | Serverless deployment, auto-scaling, scale-to-zero |
| **Session Store** | Upstash Redis (via Vercel KV) | Redis-backed SSE session management |
| **Auth** | Bearer token middleware | API key validation on every request |

### Why 768 dimensions?

Gemini Embedding 2 outputs 3072 dimensions by default but supports [Matryoshka Representation Learning (MRL)](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-embedding-2/) — you can truncate to 768 with minimal quality loss. This saves ~75% storage and makes queries significantly faster, which matters a lot more for a personal knowledge base than that last fraction of accuracy.

---

## MCP Tools Reference

### `store_memory`
Save text-based knowledge to the Digital Brain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | ✅ | The text content to store |
| `source` | string | | Where it came from (e.g. `"conversation"`, `"web-research"`, a URL) |
| `tags` | string[] | | Tags for categorization (e.g. `["work", "azure", "ebr"]`) |
| `content_type` | enum | | `text`, `note`, `code`, `conversation`, `research`, `decision`, `reference` |
| `metadata` | object | | Arbitrary structured metadata |

### `store_file`
Store an image, PDF, audio, or video file via base64-encoded data. The file is embedded with Gemini Embedding 2 in the same vector space as text memories.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_data` | string | ✅ | Base64-encoded file content |
| `file_name` | string | ✅ | Original filename with extension (e.g. `"diagram.png"`) |
| `mime_type` | string | ✅ | MIME type (see Supported File Types above) |
| `description` | string | | Text description — creates a richer interleaved embedding. Highly recommended. |
| `source` | string | | Source attribution |
| `tags` | string[] | | Tags for categorization |
| `metadata` | object | | Arbitrary structured metadata |

### `store_file_from_url`
Fetch a file from a URL and store it with a multimodal embedding. Downloads the file, embeds it, and saves to Supabase Storage.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | ✅ | URL of the file to download |
| `description` | string | | Text description for interleaved embedding |
| `file_name` | string | | Override filename (derived from URL if omitted) |
| `source` | string | | Source attribution (defaults to the URL) |
| `tags` | string[] | | Tags for categorization |
| `metadata` | object | | Arbitrary structured metadata |

### `search_memory`
Semantic search across ALL modalities — text, images, PDFs, audio, video. Your text query is embedded and matched against everything in the brain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Natural language search query |
| `limit` | number | | Max results (default 10, max 50) |
| `threshold` | number | | Minimum similarity 0–1 (default 0.4) |
| `filter_tags` | string[] | | Only return memories with at least one matching tag |
| `filter_type` | enum | | Filter by type: `text`, `note`, `code`, `conversation`, `research`, `decision`, `reference`, `image`, `pdf`, `audio`, `video` |

File-based results include `file_name`, `file_mime_type`, `file_size_bytes`, and a signed `file_url` for download.

### `get_file_url`
Get a temporary signed download URL for a stored file (valid 1 hour).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | ✅ | The memory ID that has a file attached |

### `list_memories`
Browse memories with optional filters. Includes both text and file-based memories.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content_type` | enum | | Filter by type (includes `image`, `pdf`, `audio`, `video`) |
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
Permanently remove a memory by ID. If it has a file, the file is also deleted from Supabase Storage.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | ✅ | Memory ID to delete |

### `get_stats`
Get brain statistics: total count, breakdown by content type (including file types), and top tags.

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
git clone https://github.com/dswillden/digital-brain-mcp.git
cd digital-brain-mcp
npm install
```

### Step 2: Set Up Supabase

1. Create a new Supabase project (or use an existing one)
2. Go to **SQL Editor** in the Supabase dashboard
3. Run `supabase/migrations/001_create_memories.sql` — creates the base schema
4. Run `supabase/migrations/002_multimodal_upgrade.sql` — adds file columns and updates search functions

**Create the Storage Bucket:**
1. Go to **Storage** in the Supabase dashboard
2. Click **New bucket**
3. Name: `brain-files`
4. Public bucket: **OFF** (keep it private)
5. File size limit: **50 MB** (adjust as needed)
6. Click **Create bucket**

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
5. Deploy!

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

---

## Project Structure

```
digital-brain-mcp/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── mcp/
│   │   │       └── [transport]/
│   │   │           └── route.ts    ← MCP endpoint (9 tools + auth)
│   │   ├── layout.tsx              ← Root layout
│   │   └── page.tsx                ← Landing page
│   └── lib/
│       ├── embeddings.ts           ← Gemini Embedding 2 multimodal client
│       └── supabase.ts             ← Supabase client + data helpers + file storage
├── supabase/
│   └── migrations/
│       ├── 001_create_memories.sql   ← Base schema (text only)
│       └── 002_multimodal_upgrade.sql ← File columns + updated functions
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

- **"Remember that the EBR system uses Azure Functions for the API layer"**
  → Calls `store_memory` with appropriate tags

- **"Store this screenshot of the dashboard"** (with image attached)
  → Calls `store_file` with the image, creates a multimodal embedding

- **"Save this PDF from https://example.com/report.pdf"**
  → Calls `store_file_from_url`, downloads and embeds the PDF

- **"What do I know about authentication patterns?"**
  → Calls `search_memory`, finds text AND image/PDF results across modalities

- **"Show me all my stored images"**
  → Calls `list_memories` with `content_type: "image"`

- **"Get the download link for memory #42"**
  → Calls `get_file_url`, returns a signed URL valid for 1 hour

- **"How many memories do I have?"**
  → Calls `get_stats`, shows breakdown by type including file counts

---

## Cost Estimate

| Service | Free Tier | Paid Threshold |
|---------|-----------|----------------|
| **Supabase** | 500 MB database, 1 GB storage | ~650K text memories or ~1K large files before hitting limit |
| **Vercel** | Hobby plan (100 GB bandwidth) | Heavy team usage |
| **Gemini API** | Generous free quota | Thousands of embeddings/day |
| **Upstash Redis** | 10K commands/day | Heavy concurrent sessions |

For personal second-brain use, everything stays well within free tiers.

---

## Future Enhancements

- [ ] **Auto-tagging**: Use an LLM to suggest tags for new memories
- [ ] **Bulk import**: CLI tool to import from Obsidian, Notion, or markdown files
- [ ] **Scheduled embedding refresh**: Re-embed old memories when the model improves
- [ ] **Multi-user support**: Add user_id column and JWT auth for shared deployments
- [ ] **OCR fallback**: Extract text from images/PDFs for enhanced text search

---

## License

MIT
