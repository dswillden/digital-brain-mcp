import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL environment variable");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Memory {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  content_type: string;
  source: string | null;
  tags: string[];
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface MemoryMatch extends Omit<Memory, "embedding" | "updated_at"> {
  similarity: number;
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

/** Store a new memory with its embedding vector. */
export async function insertMemory(params: {
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  content_type?: string;
  source?: string;
  tags?: string[];
}): Promise<Memory> {
  const { data, error } = await supabase
    .from("memories")
    .insert({
      content: params.content,
      embedding: params.embedding,
      metadata: params.metadata ?? {},
      content_type: params.content_type ?? "text",
      source: params.source ?? null,
      tags: params.tags ?? [],
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return data as Memory;
}

/** Semantic search via the match_memories RPC function. */
export async function searchMemories(params: {
  queryEmbedding: number[];
  matchThreshold?: number;
  matchCount?: number;
  filterTags?: string[];
}): Promise<MemoryMatch[]> {
  const { data, error } = await supabase.rpc("match_memories", {
    query_embedding: params.queryEmbedding,
    match_threshold: params.matchThreshold ?? 0.4,
    match_count: params.matchCount ?? 10,
    filter_tags: params.filterTags ?? null,
  });

  if (error) throw new Error(`Supabase search error: ${error.message}`);
  return (data ?? []) as MemoryMatch[];
}

/** List memories with optional filtering. */
export async function listMemories(params?: {
  contentType?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}): Promise<Memory[]> {
  let query = supabase
    .from("memories")
    .select("id, content, metadata, content_type, source, tags, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(params?.limit ?? 20);

  if (params?.offset) {
    query = query.range(params.offset, params.offset + (params.limit ?? 20) - 1);
  }

  if (params?.contentType) {
    query = query.eq("content_type", params.contentType);
  }

  if (params?.tags && params.tags.length > 0) {
    query = query.overlaps("tags", params.tags);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Supabase list error: ${error.message}`);
  return (data ?? []) as Memory[];
}

/** Delete a memory by ID. */
export async function deleteMemory(id: number): Promise<void> {
  const { error } = await supabase.from("memories").delete().eq("id", id);
  if (error) throw new Error(`Supabase delete error: ${error.message}`);
}

/** Update a memory's content and re-embed. */
export async function updateMemory(params: {
  id: number;
  content?: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  tags?: string[];
  source?: string;
}): Promise<Memory> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.content !== undefined) updates.content = params.content;
  if (params.embedding !== undefined) updates.embedding = params.embedding;
  if (params.metadata !== undefined) updates.metadata = params.metadata;
  if (params.tags !== undefined) updates.tags = params.tags;
  if (params.source !== undefined) updates.source = params.source;

  const { data, error } = await supabase
    .from("memories")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) throw new Error(`Supabase update error: ${error.message}`);
  return data as Memory;
}
