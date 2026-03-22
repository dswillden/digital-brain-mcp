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
  file_mime_type: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  file_storage_path: string | null;
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
  file_mime_type?: string;
  file_name?: string;
  file_size_bytes?: number;
  file_storage_path?: string;
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
      file_mime_type: params.file_mime_type ?? null,
      file_name: params.file_name ?? null,
      file_size_bytes: params.file_size_bytes ?? null,
      file_storage_path: params.file_storage_path ?? null,
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
  filterContentType?: string;
}): Promise<MemoryMatch[]> {
  const { data, error } = await supabase.rpc("match_memories", {
    query_embedding: params.queryEmbedding,
    match_threshold: params.matchThreshold ?? 0.4,
    match_count: params.matchCount ?? 10,
    filter_tags: params.filterTags ?? null,
  });

  if (error) throw new Error(`Supabase search error: ${error.message}`);

  let results = (data ?? []) as MemoryMatch[];

  // Client-side content_type filter (simpler than modifying the RPC)
  if (params.filterContentType) {
    results = results.filter((r) => r.content_type === params.filterContentType);
  }

  return results;
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
    .select(
      "id, content, metadata, content_type, source, tags, file_mime_type, file_name, file_size_bytes, file_storage_path, created_at, updated_at"
    )
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

/** Delete a memory by ID. Also removes any stored file. */
export async function deleteMemory(id: number): Promise<void> {
  // First check if there's a file to clean up
  const { data: memory } = await supabase
    .from("memories")
    .select("file_storage_path")
    .eq("id", id)
    .single();

  if (memory?.file_storage_path) {
    await supabase.storage.from("brain-files").remove([memory.file_storage_path]);
  }

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

/** Upload a file to Supabase Storage and return the path. */
export async function uploadFile(
  fileName: string,
  fileData: Buffer,
  mimeType: string
): Promise<string> {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `uploads/${timestamp}_${safeName}`;

  const { error } = await supabase.storage
    .from("brain-files")
    .upload(storagePath, fileData, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) throw new Error(`Storage upload error: ${error.message}`);

  return storagePath;
}

/** Get a signed URL for a stored file (valid for 1 hour). */
export async function getFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("brain-files")
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error) throw new Error(`Storage URL error: ${error.message}`);
  return data.signedUrl;
}
