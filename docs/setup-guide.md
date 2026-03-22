# Digital Brain MCP — Setup Guide

> **Project:** [digital-brain-mcp](https://github.com/dswillden/digital-brain-mcp)
> A personal "second brain" MCP server that stores text, images, PDFs, audio, and video using Gemini Embedding 2 for multimodal embeddings and Supabase pgvector for vector search. Deployed on Vercel as a Next.js app.

---

## Overview & Time Estimates

| Step | Task | Est. Time |
|------|------|-----------|
| 1 | Supabase database setup (SQL migrations) | 5 min |
| 1b | Create Supabase Storage bucket | 2 min |
| 2 | Deploy to Vercel + add Redis | 10 min |
| 3 | Connect AI client(s) | 5 min |
| ✓ | Test it | 2 min |

**Total: ~25 minutes**

---

## Prerequisites Checklist

Before you start, make sure you have:

- [ ] A [Supabase](https://supabase.com) account and project created
- [ ] A [Vercel](https://vercel.com) account
- [ ] A [Google AI Studio](https://aistudio.google.com/apikey) Gemini API key
- [ ] Your API key (already generated — see below)

### Your API Key

```
d4cd26491ad32691fa8562aed753873b3eb304ee3fe1ae539292186c0cd7e3f3
```

Keep this safe. You'll use it in every client config.

---

## Step 1 — Supabase Database Setup

**Estimated time: 5 minutes**

You need to run **two SQL migrations** in sequence. Both go into the Supabase SQL Editor:

1. Log in to [Supabase](https://supabase.com)
2. Open your project
3. Click **SQL Editor** in the left sidebar
4. Click **New query**

### Migration 1 of 2: Base Schema

Copy and paste the entire block below, then click **Run**:

```sql
-- Enable pgvector
create extension if not exists vector;

-- Create the memories table
create table if not exists memories (
  id            bigserial primary key,
  content       text not null,
  metadata      jsonb default '{}',
  content_type  text default 'text',
  source        text,
  tags          text[] default '{}',
  embedding     vector(768),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on table memories is 'Second brain memory store with vector embeddings';
comment on column memories.content is 'The actual text content of the memory';
comment on column memories.metadata is 'Arbitrary structured metadata (JSON)';
comment on column memories.content_type is 'Category: text, note, code, conversation, research, decision, reference';
comment on column memories.source is 'Origin of the memory (e.g. mcp-client, web-research, manual)';
comment on column memories.tags is 'Array of tags for filtering';
comment on column memories.embedding is '768-dimension Gemini Embedding 2 vector';

-- HNSW index for fast cosine similarity search
create index if not exists memories_embedding_idx
  on memories using hnsw (embedding vector_cosine_ops);

-- Index on tags for fast filtering
create index if not exists memories_tags_idx
  on memories using gin (tags);

-- Index on content_type for filtered queries
create index if not exists memories_content_type_idx
  on memories (content_type);

-- Similarity search function (called via supabase.rpc)
create or replace function match_memories (
  query_embedding  vector(768),
  match_threshold  float default 0.4,
  match_count      int default 10,
  filter_tags      text[] default null
)
returns table (
  id            bigint,
  content       text,
  metadata      jsonb,
  content_type  text,
  source        text,
  tags          text[],
  similarity    float,
  created_at    timestamptz
)
language sql stable
as $$
  select
    memories.id,
    memories.content,
    memories.metadata,
    memories.content_type,
    memories.source,
    memories.tags,
    1 - (memories.embedding <=> query_embedding) as similarity,
    memories.created_at
  from memories
  where memories.embedding <=> query_embedding < 1 - match_threshold
    and (filter_tags is null or memories.tags && filter_tags)
  order by memories.embedding <=> query_embedding
  limit match_count;
$$;

-- Stats: count by content_type
create or replace function memory_stats_by_type()
returns table (content_type text, count bigint)
language sql stable
as $$
  select content_type, count(*) from memories group by content_type order by count(*) desc;
$$;

-- Stats: top tags
create or replace function memory_stats_by_tag()
returns table (tag text, count bigint)
language sql stable
as $$
  select unnest(tags) as tag, count(*) from memories group by tag order by count(*) desc limit 20;
$$;

-- Row Level Security
alter table memories enable row level security;

create policy "Service role full access"
  on memories for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
```

You should see a green **"Success. No rows returned"** message.

---

### Migration 2 of 2: Multimodal Upgrade

Click **New query** again, paste the block below, then click **Run**:

```sql
-- Add file metadata columns
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS file_mime_type     text,
  ADD COLUMN IF NOT EXISTS file_name          text,
  ADD COLUMN IF NOT EXISTS file_size_bytes    bigint,
  ADD COLUMN IF NOT EXISTS file_storage_path  text;

COMMENT ON COLUMN memories.file_mime_type IS 'MIME type of the stored file';
COMMENT ON COLUMN memories.file_name IS 'Original filename of the stored file';
COMMENT ON COLUMN memories.file_size_bytes IS 'File size in bytes';
COMMENT ON COLUMN memories.file_storage_path IS 'Path in Supabase Storage bucket brain-files';

-- Index on file_mime_type for filtering by modality
CREATE INDEX IF NOT EXISTS memories_file_mime_type_idx
  ON memories (file_mime_type)
  WHERE file_mime_type IS NOT NULL;

-- Update match_memories to return file columns
CREATE OR REPLACE FUNCTION match_memories (
  query_embedding  vector(768),
  match_threshold  float DEFAULT 0.4,
  match_count      int DEFAULT 10,
  filter_tags      text[] DEFAULT NULL
)
RETURNS TABLE (
  id                bigint,
  content           text,
  metadata          jsonb,
  content_type      text,
  source            text,
  tags              text[],
  file_mime_type    text,
  file_name         text,
  file_size_bytes   bigint,
  file_storage_path text,
  similarity        float,
  created_at        timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    memories.id,
    memories.content,
    memories.metadata,
    memories.content_type,
    memories.source,
    memories.tags,
    memories.file_mime_type,
    memories.file_name,
    memories.file_size_bytes,
    memories.file_storage_path,
    1 - (memories.embedding <=> query_embedding) AS similarity,
    memories.created_at
  FROM memories
  WHERE memories.embedding <=> query_embedding < 1 - match_threshold
    AND (filter_tags IS NULL OR memories.tags && filter_tags)
  ORDER BY memories.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON COLUMN memories.content_type IS 'Category: text, note, code, conversation, research, decision, reference, image, pdf, audio, video';
```

You should see a green **"Success. No rows returned"** message again.

**Migration checklist:**
- [ ] Migration 001 ran successfully
- [ ] Migration 002 ran successfully

---

## Step 1b — Create Supabase Storage Bucket

**Estimated time: 2 minutes**

The multimodal upgrade stores actual files (images, PDFs, audio, video) in Supabase Storage. You need to create the bucket manually:

1. In your Supabase project sidebar, click **Storage**
2. Click **New bucket**
3. Fill in the form:
   - **Name:** `brain-files` _(must be exactly this)_
   - **Public:** OFF (leave unchecked — keep files private)
   - **File size limit:** `50` MB
4. Click **Create bucket**

**Bucket checklist:**
- [ ] `brain-files` bucket created
- [ ] Public access is OFF

---

## Step 2 — Gather Your Environment Variables

**Estimated time: 3 minutes**

You need 4 values before deploying. Collect them now:

### DIGITAL_BRAIN_API_KEYS

This is your pre-generated key:

```
d4cd26491ad32691fa8562aed753873b3eb304ee3fe1ae539292186c0cd7e3f3
```

### GEMINI_API_KEY

1. Go to [Google AI Studio → API Keys](https://aistudio.google.com/apikey)
2. Click **Create API key** (or copy an existing one)

### SUPABASE_URL

1. In your Supabase project, go to **Settings → API**
2. Copy the **Project URL** (looks like `https://xyzxyzxyz.supabase.co`)

### SUPABASE_SERVICE_ROLE_KEY

1. On the same **Settings → API** page
2. Under **Project API Keys**, copy the **service_role** key
3. ⚠️ Use the `service_role` key, NOT the `anon` key — the anon key won't have permission to write memories

**Environment variable checklist:**
- [ ] `DIGITAL_BRAIN_API_KEYS` — ready
- [ ] `GEMINI_API_KEY` — copied from AI Studio
- [ ] `SUPABASE_URL` — copied from Supabase Settings
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — copied (service_role, not anon)

---

## Step 3 — Deploy to Vercel

**Estimated time: 7 minutes**

### 3a. Import the Repo

1. Go to [vercel.com/new](https://vercel.com/new)
2. Under **Import Git Repository**, click **Continue with GitHub**
3. Find and select `digital-brain-mcp`
4. Vercel will auto-detect Next.js — leave all framework settings as-is

### 3b. Add Environment Variables

Before clicking Deploy, scroll down to **Environment Variables** and add all 4:

| Name | Value |
|------|-------|
| `DIGITAL_BRAIN_API_KEYS` | `d4cd26491ad32691fa8562aed753873b3eb304ee3fe1ae539292186c0cd7e3f3` |
| `GEMINI_API_KEY` | _(your key from AI Studio)_ |
| `SUPABASE_URL` | _(your project URL)_ |
| `SUPABASE_SERVICE_ROLE_KEY` | _(your service_role key)_ |

### 3c. Deploy

Click **Deploy**. The build takes about 1–2 minutes. Once it's done, you'll see a URL like:

```
https://digital-brain-mcp.vercel.app
```

Note this URL — you'll need it for client configs.

### 3d. Add Redis (Vercel KV / Upstash)

Redis is used for rate limiting and caching. After the initial deploy:

1. In your Vercel project, go to **Storage** in the top nav
2. Click **Create Database**
3. Select **KV** (powered by Upstash — free tier available)
4. Follow the prompts to create and **connect** it to your project
5. This automatically sets the `REDIS_URL` environment variable
6. Go to **Deployments → Redeploy** (redeploy the latest deployment so it picks up `REDIS_URL`)

**Deploy checklist:**
- [ ] Repo imported to Vercel
- [ ] All 4 environment variables added
- [ ] Initial deploy successful
- [ ] KV/Upstash Redis created and connected
- [ ] Redeployed after adding Redis

### 3e. Firewall Note (if you get 403 errors)

Vercel's firewall can sometimes block MCP traffic to `/api/mcp`. If you get 403 errors when connecting clients:

1. Go to your Vercel project → **Settings → Security → Firewall**
2. Click **Add Rule**
3. Set condition: **Path contains** `/api/mcp`
4. Set action: **Bypass**
5. Save the rule and redeploy

---

## Step 4 — Connect Your AI Client

**Estimated time: 5 minutes**

Replace `YOUR_VERCEL_URL` with your actual deployed URL in all configs below.

Your API key for all configs:
```
d4cd26491ad32691fa8562aed753873b3eb304ee3fe1ae539292186c0cd7e3f3
```

---

### Claude Desktop / Claude Code

Edit your Claude config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "digital-brain": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://YOUR_VERCEL_URL/api/mcp",
        "--header",
        "Authorization: Bearer d4cd26491ad32691fa8562aed753873b3eb304ee3fe1ae539292186c0cd7e3f3"
      ]
    }
  }
}
```

Restart Claude after saving.

---

### Cursor

In Cursor settings, add an MCP server with type **SSE**:

```json
{
  "mcpServers": {
    "digital-brain": {
      "type": "sse",
      "url": "https://YOUR_VERCEL_URL/api/mcp",
      "headers": {
        "Authorization": "Bearer d4cd26491ad32691fa8562aed753873b3eb304ee3fe1ae539292186c0cd7e3f3"
      }
    }
  }
}
```

---

### OpenCode

Add to your OpenCode config:

```json
{
  "mcp": {
    "servers": {
      "digital-brain": {
        "type": "sse",
        "url": "https://YOUR_VERCEL_URL/api/mcp",
        "headers": {
          "Authorization": "Bearer d4cd26491ad32691fa8562aed753873b3eb304ee3fe1ae539292186c0cd7e3f3"
        }
      }
    }
  }
}
```

---

## Available Tools (9 total)

Once connected, your AI client has access to these tools:

| Tool | Description |
|------|-------------|
| `store_memory` | Store text knowledge, notes, decisions, research, etc. |
| `store_file` | Store an image, PDF, audio, or video file (base64 encoded) |
| `store_file_from_url` | Fetch a file from a URL and store it automatically |
| `search_memory` | Semantic search across ALL modalities (text + files) |
| `get_file_url` | Get a signed download URL for a stored file |
| `list_memories` | Browse memories with optional filters (type, tags, etc.) |
| `update_memory` | Modify the content or metadata of an existing memory |
| `delete_memory` | Remove a memory and its associated file (if any) |
| `get_stats` | Show brain statistics (counts by type, top tags, etc.) |

---

## Quick Tests

Once your client is connected, try these to verify everything is working:

### Test 1: Store and Retrieve Text

Ask your AI:

> "Store a memory: My Digital Brain MCP is fully set up and working. Tag it with 'milestone' and 'setup'."

Then ask:

> "Search my brain for memories about setup."

You should get back the memory you just stored.

### Test 2: Store a File from URL

Ask your AI:

> "Store this image in my brain from URL: https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png — tag it as 'test' and 'image'."

### Test 3: Check Stats

Ask your AI:

> "Show me my brain statistics."

You should see counts by content type.

---

## Troubleshooting

### 403 Forbidden when connecting

The Vercel firewall is blocking MCP requests. Follow Step 3e above to add a firewall bypass rule for `/api/mcp`.

### "Invalid API key" or 401 Unauthorized

- Double-check that `DIGITAL_BRAIN_API_KEYS` is set correctly in Vercel environment variables
- Make sure the Bearer token in your client config matches exactly (no extra spaces or newlines)
- After changing env vars in Vercel, always redeploy

### Memories not persisting / Supabase errors

- Verify `SUPABASE_URL` is the **Project URL** (not the API URL or dashboard URL)
- Verify `SUPABASE_SERVICE_ROLE_KEY` is the **service_role** key, not the `anon` key
- Run a quick test in Supabase SQL Editor: `SELECT count(*) FROM memories;` — if this errors, the migration didn't run

### File uploads failing

- Make sure the `brain-files` Storage bucket exists in Supabase (Step 1b)
- Bucket name must be exactly `brain-files`
- Check that the bucket is **not** public (private is correct)

### Redis / rate-limit errors

- Verify the KV database is connected to your Vercel project (Step 3d)
- Make sure you redeployed after connecting the KV database
- Check that `REDIS_URL` appears in **Settings → Environment Variables** in Vercel

### Tools not showing up in Claude

- Restart Claude Desktop completely after editing the config file
- Validate your JSON is well-formed (no trailing commas, mismatched brackets)
- Check that `npx` is accessible from your terminal (`npx --version`)
- Try running the mcp-remote command manually to see errors:
  ```bash
  npx mcp-remote https://YOUR_VERCEL_URL/api/mcp \
    --header "Authorization: Bearer d4cd26491ad32691fa8562aed753873b3eb304ee3fe1ae539292186c0cd7e3f3"
  ```

---

## Environment Variables Reference

| Variable | Where to Get It | Notes |
|----------|----------------|-------|
| `DIGITAL_BRAIN_API_KEYS` | Pre-generated | `d4cd26491ad32691fa8562aed753873b3eb304ee3fe1ae539292186c0cd7e3f3` |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Used for Gemini Embedding 2 |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | Looks like `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key | NOT the anon key |
| `REDIS_URL` | Auto-set by Vercel KV/Upstash | Set automatically after Step 3d |

---

## Full Setup Checklist

- [ ] **Step 1:** Migration 001 (base schema) ran in Supabase SQL Editor
- [ ] **Step 1:** Migration 002 (multimodal upgrade) ran in Supabase SQL Editor
- [ ] **Step 1b:** `brain-files` storage bucket created (private, 50MB limit)
- [ ] **Step 2:** `DIGITAL_BRAIN_API_KEYS` collected
- [ ] **Step 2:** `GEMINI_API_KEY` collected
- [ ] **Step 2:** `SUPABASE_URL` collected
- [ ] **Step 2:** `SUPABASE_SERVICE_ROLE_KEY` collected (service_role, not anon)
- [ ] **Step 3:** Repo imported to Vercel
- [ ] **Step 3:** All 4 env vars added before deploy
- [ ] **Step 3:** Initial deploy successful
- [ ] **Step 3:** Vercel KV (Upstash Redis) created and connected
- [ ] **Step 3:** Redeployed after adding Redis
- [ ] **Step 4:** AI client configured with correct URL and API key
- [ ] **Done:** Test memories store and retrieve correctly

---

*Guide written for Digital Brain MCP — [github.com/dswillden/digital-brain-mcp](https://github.com/dswillden/digital-brain-mcp)*
