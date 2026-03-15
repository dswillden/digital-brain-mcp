import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { getTextEmbedding } from "@/lib/embeddings";
import {
  insertMemory,
  searchMemories,
  listMemories,
  deleteMemory,
  updateMemory,
} from "@/lib/supabase";

// ---------------------------------------------------------------------------
// MCP Handler — defines all tools that AI clients can call
// ---------------------------------------------------------------------------

const baseHandler = createMcpHandler(
  (server) => {
    // -----------------------------------------------------------------------
    // TOOL: store_memory
    // Stores a new piece of knowledge in the second brain
    // -----------------------------------------------------------------------
    server.tool(
      "store_memory",
      "Store a new memory in the Digital Brain. Generates a Gemini Embedding 2 vector and saves to Supabase. Use this to save notes, facts, ideas, decisions, conversation summaries, code snippets, or any knowledge you want to recall later.",
      {
        content: z
          .string()
          .describe(
            "The text content to store. Can be a note, fact, idea, code snippet, conversation summary, etc."
          ),
        source: z
          .string()
          .optional()
          .describe(
            "Where this memory came from (e.g. 'conversation', 'web-research', 'manual', 'meeting-notes', a URL, etc.)"
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe(
            "Tags for categorization and filtering (e.g. ['work', 'project-ebr', 'azure'])"
          ),
        content_type: z
          .enum(["text", "note", "code", "conversation", "research", "decision", "reference"])
          .optional()
          .describe("The type of content being stored. Defaults to 'text'."),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe(
            "Optional structured metadata (e.g. { project: 'digital-brain', priority: 'high' })"
          ),
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
    // TOOL: search_memory
    // Semantic search across the entire second brain
    // -----------------------------------------------------------------------
    server.tool(
      "search_memory",
      "Search the Digital Brain using semantic similarity. Your query is embedded with Gemini Embedding 2 and matched against all stored memories using cosine similarity in pgvector. Returns the most relevant results ranked by similarity score.",
      {
        query: z
          .string()
          .describe(
            "Natural language search query. Be descriptive — semantic search works best with full phrases, not single keywords."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum number of results to return (default 10, max 50)."),
        threshold: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe(
            "Minimum similarity score (0-1). Lower = more results but less relevant. Default 0.4."
          ),
        filter_tags: z
          .array(z.string())
          .optional()
          .describe(
            "Only return memories that have at least one of these tags."
          ),
      },
      async ({ query, limit, threshold, filter_tags }) => {
        try {
          const queryEmbedding = await getTextEmbedding(query);
          const results = await searchMemories({
            queryEmbedding,
            matchCount: limit ?? 10,
            matchThreshold: threshold ?? 0.4,
            filterTags: filter_tags,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    query,
                    result_count: results.length,
                    results: results.map((r) => ({
                      id: r.id,
                      similarity: Math.round(r.similarity * 1000) / 1000,
                      content: r.content,
                      content_type: r.content_type,
                      source: r.source,
                      tags: r.tags,
                      metadata: r.metadata,
                      created_at: r.created_at,
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
    // TOOL: list_memories
    // Browse memories with filters
    // -----------------------------------------------------------------------
    server.tool(
      "list_memories",
      "Browse stored memories with optional filters. Use this to see what's in the Digital Brain without a specific search query — for example, list all memories tagged 'work' or all 'code' type entries.",
      {
        content_type: z
          .string()
          .optional()
          .describe("Filter by content type (e.g. 'text', 'code', 'conversation', 'research')."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Filter to memories containing at least one of these tags."),
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
          .describe("Pagination offset (default 0)."),
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
    // Modify an existing memory
    // -----------------------------------------------------------------------
    server.tool(
      "update_memory",
      "Update an existing memory in the Digital Brain. If the content changes, a new embedding is generated automatically. Use the memory ID from search or list results.",
      {
        id: z.number().int().describe("The memory ID to update."),
        content: z
          .string()
          .optional()
          .describe("New content (will re-generate embedding automatically)."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replace tags with this new set."),
        source: z.string().optional().describe("Update the source field."),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe("Replace metadata with this new object."),
      },
      async ({ id, content, tags, source, metadata }) => {
        try {
          let embedding: number[] | undefined;
          if (content) {
            embedding = await getTextEmbedding(content);
          }

          const updated = await updateMemory({
            id,
            content,
            embedding,
            tags,
            source,
            metadata,
          });

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
    // Remove a memory by ID
    // -----------------------------------------------------------------------
    server.tool(
      "delete_memory",
      "Permanently delete a memory from the Digital Brain by its ID. This cannot be undone.",
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
                text: JSON.stringify({
                  success: true,
                  message: `Memory ${id} deleted successfully.`,
                }),
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
    // Quick overview of what's in the brain
    // -----------------------------------------------------------------------
    server.tool(
      "get_stats",
      "Get statistics about the Digital Brain — total memory count, breakdown by content type, most used tags, and storage info.",
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
// Authentication via withMcpAuth
// Uses Bearer token validation against DIGITAL_BRAIN_API_KEYS env var
// ---------------------------------------------------------------------------

const verifyToken = async (
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;

  const configuredKeys = process.env.DIGITAL_BRAIN_API_KEYS;
  if (!configuredKeys || configuredKeys.trim() === "") {
    return undefined; // No keys configured = reject all
  }

  const allowedKeys = configuredKeys
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!allowedKeys.includes(bearerToken)) {
    return undefined; // Invalid key
  }

  // Return AuthInfo on success
  return {
    token: bearerToken,
    clientId: "digital-brain-client",
    scopes: ["read", "write"],
  };
};

const handler = withMcpAuth(baseHandler, verifyToken, {
  required: true, // All requests must be authenticated
});

export { handler as GET, handler as POST, handler as DELETE };
