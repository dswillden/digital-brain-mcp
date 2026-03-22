import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import {
  getTextEmbedding,
  getMultimodalEmbedding,
  getInterleavedEmbedding,
  ALL_SUPPORTED_MIME_TYPES,
  getModalityFromMime,
} from "@/lib/embeddings";
import {
  insertMemory,
  searchMemories,
  listMemories,
  deleteMemory,
  updateMemory,
  uploadFile,
  getFileUrl,
} from "@/lib/supabase";

// ---------------------------------------------------------------------------
// MCP Handler — Full Multimodal Digital Brain
// ---------------------------------------------------------------------------

const baseHandler = createMcpHandler(
  (server) => {
    // -----------------------------------------------------------------------
    // TOOL: store_memory
    // Stores text-based knowledge in the second brain
    // -----------------------------------------------------------------------
    server.tool(
      "store_memory",
      "Store a text memory in the Digital Brain. Generates a Gemini Embedding 2 vector and saves to Supabase. Use for notes, facts, ideas, decisions, conversation summaries, code snippets, or any text knowledge.",
      {
        content: z
          .string()
          .describe("The text content to store."),
        source: z
          .string()
          .optional()
          .describe("Where this came from (e.g. 'conversation', 'web-research', 'manual', a URL)."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags for categorization (e.g. ['work', 'project-ebr', 'azure'])."),
        content_type: z
          .enum(["text", "note", "code", "conversation", "research", "decision", "reference"])
          .optional()
          .describe("The type of content. Defaults to 'text'."),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe("Optional structured metadata."),
      },
      async ({ content, source, tags, content_type, metadata }) => {
        try {
          const embedding = await getTextEmbedding(content);
          const memory = await insertMemory({
            content,
            embedding,
            source: source ?? "mcp-client",
            tags: tags ?? [],
            content_type: content_type ?? "text",
            metadata: metadata ?? {},
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: "Memory stored successfully.",
                    memory: {
                      id: memory.id,
                      content_type: memory.content_type,
                      tags: memory.tags,
                      source: memory.source,
                      created_at: memory.created_at,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // -----------------------------------------------------------------------
    // TOOL: store_file
    // Stores an image, PDF, audio, or video file with multimodal embedding
    // -----------------------------------------------------------------------
    server.tool(
      "store_file",
      `Store a file (image, PDF, audio, or video) in the Digital Brain with a multimodal Gemini Embedding 2 vector. The file is embedded in the SAME vector space as text, so you can search across all modalities. Provide the file as base64-encoded data. Supported types: ${ALL_SUPPORTED_MIME_TYPES.join(", ")}. Limits: images up to 6 per request, PDFs up to 6 pages, video up to 120 seconds.`,
      {
        file_data: z
          .string()
          .describe("Base64-encoded file content (the raw file bytes encoded as base64)."),
        file_name: z
          .string()
          .describe("Original filename with extension (e.g. 'architecture-diagram.png', 'sop-document.pdf')."),
        mime_type: z
          .string()
          .describe(`MIME type of the file. Supported: ${ALL_SUPPORTED_MIME_TYPES.join(", ")}`),
        description: z
          .string()
          .optional()
          .describe(
            "A text description of the file content. If provided, creates a richer interleaved embedding that captures both the visual/audio content AND your description. Highly recommended."
          ),
        source: z
          .string()
          .optional()
          .describe("Where this file came from."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags for categorization."),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe("Optional structured metadata."),
      },
      async ({ file_data, file_name, mime_type, description, source, tags, metadata }) => {
        try {
          const modality = getModalityFromMime(mime_type);
          if (modality === "unknown") {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: `Unsupported MIME type: ${mime_type}. Supported: ${ALL_SUPPORTED_MIME_TYPES.join(", ")}`,
                  }),
                },
              ],
              isError: true,
            };
          }

          // Generate embedding — interleaved if description provided, file-only otherwise
          let embedding: number[];
          if (description) {
            embedding = await getInterleavedEmbedding(description, file_data, mime_type);
          } else {
            embedding = await getMultimodalEmbedding(file_data, mime_type);
          }

          // Upload file to Supabase Storage
          const fileBuffer = Buffer.from(file_data, "base64");
          const storagePath = await uploadFile(file_name, fileBuffer, mime_type);

          // Build the content field — description or auto-generated label
          const contentText =
            description ??
            `[${modality.toUpperCase()}] ${file_name} (${mime_type}, ${formatBytes(fileBuffer.length)})`;

          // Store the memory with file metadata
          const memory = await insertMemory({
            content: contentText,
            embedding,
            source: source ?? "mcp-client",
            tags: tags ?? [],
            content_type: modality,
            metadata: {
              ...(metadata ?? {}),
              modality,
              original_filename: file_name,
            },
            file_mime_type: mime_type,
            file_name,
            file_size_bytes: fileBuffer.length,
            file_storage_path: storagePath,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: `${modality.charAt(0).toUpperCase() + modality.slice(1)} stored and embedded successfully.`,
                    memory: {
                      id: memory.id,
                      content_type: memory.content_type,
                      file_name: memory.file_name,
                      file_mime_type: memory.file_mime_type,
                      file_size: formatBytes(fileBuffer.length),
                      tags: memory.tags,
                      source: memory.source,
                      has_description: !!description,
                      created_at: memory.created_at,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // -----------------------------------------------------------------------
    // TOOL: store_file_from_url
    // Fetches a file from a URL and stores it with multimodal embedding
    // -----------------------------------------------------------------------
    server.tool(
      "store_file_from_url",
      "Fetch a file from a URL (image, PDF, audio, video) and store it in the Digital Brain with a multimodal embedding. The file is downloaded, embedded with Gemini Embedding 2, and stored in Supabase.",
      {
        url: z
          .string()
          .url()
          .describe("The URL of the file to download and store."),
        description: z
          .string()
          .optional()
          .describe(
            "A text description. Creates a richer interleaved embedding combining the description with the file content."
          ),
        file_name: z
          .string()
          .optional()
          .describe("Override filename. If not provided, derived from the URL."),
        source: z
          .string()
          .optional()
          .describe("Source attribution. Defaults to the URL."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags for categorization."),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe("Optional structured metadata."),
      },
      async ({ url, description, file_name, source, tags, metadata }) => {
        try {
          // Fetch the file
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
          }

          const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
          const modality = getModalityFromMime(contentType);
          if (modality === "unknown") {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: `URL returned unsupported content type: ${contentType}. Supported: ${ALL_SUPPORTED_MIME_TYPES.join(", ")}`,
                  }),
                },
              ],
              isError: true,
            };
          }

          const arrayBuffer = await response.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);
          const base64Data = fileBuffer.toString("base64");

          // Derive filename from URL if not provided
          const derivedName =
            file_name ?? url.split("/").pop()?.split("?")[0] ?? `file_${Date.now()}`;

          // Generate embedding
          let embedding: number[];
          if (description) {
            embedding = await getInterleavedEmbedding(description, base64Data, contentType);
          } else {
            embedding = await getMultimodalEmbedding(base64Data, contentType);
          }

          // Upload to storage
          const storagePath = await uploadFile(derivedName, fileBuffer, contentType);

          const contentText =
            description ??
            `[${modality.toUpperCase()}] ${derivedName} (from ${new URL(url).hostname})`;

          const memory = await insertMemory({
            content: contentText,
            embedding,
            source: source ?? url,
            tags: tags ?? [],
            content_type: modality,
            metadata: {
              ...(metadata ?? {}),
              modality,
              original_url: url,
              original_filename: derivedName,
            },
            file_mime_type: contentType,
            file_name: derivedName,
            file_size_bytes: fileBuffer.length,
            file_storage_path: storagePath,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: `${modality.charAt(0).toUpperCase() + modality.slice(1)} fetched from URL, embedded, and stored.`,
                    memory: {
                      id: memory.id,
                      content_type: memory.content_type,
                      file_name: memory.file_name,
                      file_size: formatBytes(fileBuffer.length),
                      tags: memory.tags,
                      source: memory.source,
                      created_at: memory.created_at,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // -----------------------------------------------------------------------
    // TOOL: search_memory
    // Semantic search across ALL modalities — text, images, PDFs, audio, video
    // -----------------------------------------------------------------------
    server.tool(
      "search_memory",
      "Search the Digital Brain using semantic similarity across ALL modalities. Your text query is embedded in the same vector space as stored images, PDFs, audio, and video — so searching for 'architecture diagram' can return an image, or 'meeting notes from Monday' can return an audio recording.",
      {
        query: z
          .string()
          .describe(
            "Natural language search query. Works across all modalities — a text query can find matching images, PDFs, audio, video."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results (default 10, max 50)."),
        threshold: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Minimum similarity 0-1 (default 0.4)."),
        filter_tags: z
          .array(z.string())
          .optional()
          .describe("Only return memories with at least one matching tag."),
        filter_type: z
          .enum(["text", "note", "code", "conversation", "research", "decision", "reference", "image", "pdf", "audio", "video"])
          .optional()
          .describe("Only return memories of this content type."),
      },
      async ({ query, limit, threshold, filter_tags, filter_type }) => {
        try {
          const queryEmbedding = await getTextEmbedding(query);
          const results = await searchMemories({
            queryEmbedding,
            matchCount: limit ?? 10,
            matchThreshold: threshold ?? 0.4,
            filterTags: filter_tags,
            filterContentType: filter_type,
          });

          // For file results, generate signed URLs
          const enrichedResults = await Promise.all(
            results.map(async (r) => {
              const result: Record<string, unknown> = {
                id: r.id,
                similarity: Math.round(r.similarity * 1000) / 1000,
                content: r.content,
                content_type: r.content_type,
                source: r.source,
                tags: r.tags,
                metadata: r.metadata,
                created_at: r.created_at,
              };

              // Add file info if this is a file-based memory
              if (r.file_name) {
                result.file_name = r.file_name;
                result.file_mime_type = r.file_mime_type;
                result.file_size_bytes = r.file_size_bytes;
                if (r.file_storage_path) {
                  try {
                    result.file_url = await getFileUrl(r.file_storage_path);
                  } catch {
                    result.file_url = null;
                    result.file_url_error = "Could not generate signed URL";
                  }
                }
              }

              return result;
            })
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    query,
                    result_count: enrichedResults.length,
                    results: enrichedResults,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // -----------------------------------------------------------------------
    // TOOL: get_file_url
    // Get a download link for a stored file
    // -----------------------------------------------------------------------
    server.tool(
      "get_file_url",
      "Get a temporary signed download URL for a file stored in the Digital Brain. The URL is valid for 1 hour.",
      {
        id: z.number().int().describe("The memory ID that has a file attached."),
      },
      async ({ id }) => {
        try {
          const { supabase } = await import("@/lib/supabase");
          const { data: memory, error } = await supabase
            .from("memories")
            .select("file_storage_path, file_name, file_mime_type")
            .eq("id", id)
            .single();

          if (error || !memory) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: false, error: "Memory not found." }),
                },
              ],
              isError: true,
            };
          }

          if (!memory.file_storage_path) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: "This memory has no file attached. It is text-only.",
                  }),
                },
              ],
              isError: true,
            };
          }

          const url = await getFileUrl(memory.file_storage_path);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    id,
                    file_name: memory.file_name,
                    file_mime_type: memory.file_mime_type,
                    download_url: url,
                    expires_in: "1 hour",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // -----------------------------------------------------------------------
    // TOOL: list_memories
    // -----------------------------------------------------------------------
    server.tool(
      "list_memories",
      "Browse stored memories with optional filters. Now includes file-based memories (images, PDFs, audio, video) alongside text.",
      {
        content_type: z
          .enum(["text", "note", "code", "conversation", "research", "decision", "reference", "image", "pdf", "audio", "video"])
          .optional()
          .describe("Filter by content type."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Filter by tags."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max results (default 20, max 100)."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Pagination offset."),
      },
      async ({ content_type, tags, limit, offset }) => {
        try {
          const memories = await listMemories({
            contentType: content_type,
            tags,
            limit: limit ?? 20,
            offset: offset ?? 0,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    count: memories.length,
                    memories: memories.map((m) => ({
                      id: m.id,
                      content:
                        m.content.length > 200
                          ? m.content.substring(0, 200) + "..."
                          : m.content,
                      content_type: m.content_type,
                      source: m.source,
                      tags: m.tags,
                      file_name: m.file_name,
                      file_mime_type: m.file_mime_type,
                      file_size: m.file_size_bytes ? formatBytes(m.file_size_bytes) : null,
                      created_at: m.created_at,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // -----------------------------------------------------------------------
    // TOOL: update_memory
    // -----------------------------------------------------------------------
    server.tool(
      "update_memory",
      "Update an existing memory. If text content changes, a new embedding is generated automatically.",
      {
        id: z.number().int().describe("The memory ID to update."),
        content: z.string().optional().describe("New text content (re-embeds automatically)."),
        tags: z.array(z.string()).optional().describe("Replace tags."),
        source: z.string().optional().describe("Update source."),
        metadata: z.record(z.unknown()).optional().describe("Replace metadata."),
      },
      async ({ id, content, tags, source, metadata }) => {
        try {
          let embedding: number[] | undefined;
          if (content) {
            embedding = await getTextEmbedding(content);
          }
          const updated = await updateMemory({ id, content, embedding, tags, source, metadata });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: "Memory updated successfully.",
                    memory: {
                      id: updated.id,
                      content_type: updated.content_type,
                      tags: updated.tags,
                      source: updated.source,
                      updated_at: updated.updated_at,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // -----------------------------------------------------------------------
    // TOOL: delete_memory
    // -----------------------------------------------------------------------
    server.tool(
      "delete_memory",
      "Permanently delete a memory by ID. If it has a file, the file is also deleted from storage.",
      {
        id: z.number().int().describe("The memory ID to delete."),
      },
      async ({ id }) => {
        try {
          await deleteMemory(id);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true, message: `Memory ${id} deleted.` }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // -----------------------------------------------------------------------
    // TOOL: get_stats
    // -----------------------------------------------------------------------
    server.tool(
      "get_stats",
      "Get Digital Brain statistics — total count, breakdown by content type (including file types), top tags, and storage usage.",
      {},
      async () => {
        try {
          const { supabase } = await import("@/lib/supabase");

          const { count: totalCount } = await supabase
            .from("memories")
            .select("*", { count: "exact", head: true });

          const { data: typeBreakdown } = await supabase.rpc("memory_stats_by_type");
          const { data: tagBreakdown } = await supabase.rpc("memory_stats_by_tag");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    total_memories: totalCount ?? 0,
                    by_content_type: typeBreakdown ?? [],
                    top_tags: tagBreakdown ?? [],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );
  },
  {},
  {
    basePath: "/api/mcp",
    verboseLogs: true,
    redisUrl: process.env.REDIS_URL,
    disableSse: false,
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
const verifyToken = async (
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;

  const configuredKeys = process.env.DIGITAL_BRAIN_API_KEYS;
  if (!configuredKeys || configuredKeys.trim() === "") return undefined;

  const allowedKeys = configuredKeys.split(",").map((k) => k.trim()).filter(Boolean);
  if (!allowedKeys.includes(bearerToken)) return undefined;

  return {
    token: bearerToken,
    clientId: "digital-brain-client",
    scopes: ["read", "write"],
  };
};

const handler = withMcpAuth(baseHandler, verifyToken, { required: true });

export { handler as GET, handler as POST, handler as DELETE };
