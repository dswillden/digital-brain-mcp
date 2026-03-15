-- ==========================================================================
-- Digital Brain MCP — Supabase Database Setup
-- ==========================================================================
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This creates everything needed for the vector-based second brain.
-- ==========================================================================

-- 1. Enable the pgvector extension
create extension if not exists vector;

-- 2. Create the memories table
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

-- 3. Add comments for documentation
comment on table memories is 'Second brain memory store with vector embeddings';
comment on column memories.content is 'The actual text content of the memory';
comment on column memories.metadata is 'Arbitrary structured metadata (JSON)';
comment on column memories.content_type is 'Category: text, note, code, conversation, research, decision, reference';
comment on column memories.source is 'Origin of the memory (e.g. mcp-client, web-research, manual)';
comment on column memories.tags is 'Array of tags for filtering';
comment on column memories.embedding is '768-dimension Gemini Embedding 2 vector';

-- 4. Create the HNSW index for fast cosine similarity search
create index if not exists memories_embedding_idx
  on memories using hnsw (embedding vector_cosine_ops);

-- 5. Create an index on tags for fast filtering
create index if not exists memories_tags_idx
  on memories using gin (tags);

-- 6. Create an index on content_type for filtered queries
create index if not exists memories_content_type_idx
  on memories (content_type);

-- 7. Similarity search function (called via supabase.rpc)
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

-- 8. Stats helper: count by content_type
create or replace function memory_stats_by_type()
returns table (
  content_type text,
  count        bigint
)
language sql stable
as $$
  select content_type, count(*)
  from memories
  group by content_type
  order by count(*) desc;
$$;

-- 9. Stats helper: top tags
create or replace function memory_stats_by_tag()
returns table (
  tag   text,
  count bigint
)
language sql stable
as $$
  select unnest(tags) as tag, count(*)
  from memories
  group by tag
  order by count(*) desc
  limit 20;
$$;

-- 10. Row Level Security (RLS)
-- Since this is accessed via service_role key from the MCP server,
-- RLS is bypassed. But we enable it as a safety net in case
-- the anon key is ever exposed.
alter table memories enable row level security;

-- Allow the service role full access (it bypasses RLS anyway, but explicit)
-- Block anon/public access completely
create policy "Service role full access"
  on memories
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ==========================================================================
-- Done! Your Digital Brain database is ready.
-- ==========================================================================
