-- ==========================================================================
-- Digital Brain MCP — Multimodal Upgrade Migration
-- ==========================================================================
-- Run this in your Supabase SQL Editor AFTER the initial 001 migration.
-- Adds file storage columns, updates search functions, and sets up the
-- Supabase Storage bucket for images, PDFs, audio, and video files.
-- ==========================================================================

-- 1. Add file metadata columns to the memories table
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS file_mime_type     text,
  ADD COLUMN IF NOT EXISTS file_name          text,
  ADD COLUMN IF NOT EXISTS file_size_bytes    bigint,
  ADD COLUMN IF NOT EXISTS file_storage_path  text;

-- 2. Add comments for the new columns
COMMENT ON COLUMN memories.file_mime_type IS 'MIME type of the stored file (e.g. image/png, application/pdf, audio/mpeg, video/mp4)';
COMMENT ON COLUMN memories.file_name IS 'Original filename of the stored file';
COMMENT ON COLUMN memories.file_size_bytes IS 'File size in bytes';
COMMENT ON COLUMN memories.file_storage_path IS 'Path in Supabase Storage bucket "brain-files"';

-- 3. Index on file_mime_type for filtering by modality
CREATE INDEX IF NOT EXISTS memories_file_mime_type_idx
  ON memories (file_mime_type)
  WHERE file_mime_type IS NOT NULL;

-- 4. Update the match_memories function to return file columns
--    This replaces the v1 function — same signature, more return columns
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

-- 5. Update content_type comment to include file types
COMMENT ON COLUMN memories.content_type IS 'Category: text, note, code, conversation, research, decision, reference, image, pdf, audio, video';

-- ==========================================================================
-- MANUAL STEP: Create the Supabase Storage Bucket
-- ==========================================================================
-- The Storage bucket CANNOT be created via SQL. You need to do this
-- manually in the Supabase dashboard:
--
-- 1. Go to Supabase Dashboard → Storage (left sidebar)
-- 2. Click "New bucket"
-- 3. Name: brain-files
-- 4. Public bucket: OFF (keep it private — files are accessed via signed URLs)
-- 5. File size limit: 50 MB (adjust as needed)
-- 6. Allowed MIME types (optional): image/png, image/jpeg, image/webp,
--    image/gif, application/pdf, audio/mpeg, audio/wav, audio/ogg,
--    audio/mp3, audio/aac, audio/flac, video/mp4, video/quicktime,
--    video/webm
-- 7. Click "Create bucket"
--
-- The MCP server uses the service_role key to upload/download files,
-- which bypasses RLS on storage. No additional storage policies needed.
-- ==========================================================================

-- Done! After running this SQL AND creating the storage bucket,
-- your Digital Brain is ready for multimodal content.
