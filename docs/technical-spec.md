# Digital Brain MCP — Exhaustive Technical Specification

**Document version:** 1.0  
**Repository:** https://github.com/dswillden/digital-brain-mcp  
**Owner:** dswillden  
**Last updated:** 2026-03-21  
**Primary audience:** AI agents (Claude, GPT, etc.) tasked with understanding, maintaining, debugging, extending, or recreating this system from scratch.  

> **How to read this document:** Every section is self-contained. Cross-references use `§ Section Name` notation. All SQL, TypeScript, and shell snippets are production-exact unless explicitly labeled `[PLANNED]`. When current source code diverges from the task-level specification, both are documented with clear labels.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [File-by-File Specification](#2-file-by-file-specification)
3. [Database Schema](#3-database-schema)
4. [Supabase Storage](#4-supabase-storage)
5. [Authentication & Security](#5-authentication--security)
6. [Environment Variables](#6-environment-variables)
7. [Deployment](#7-deployment)
8. [MCP Protocol Details](#8-mcp-protocol-details)
9. [Embedding Model Details](#9-embedding-model-details)
10. [Data Flow Diagrams](#10-data-flow-diagrams)
11. [Extension Points](#11-extension-points)
12. [Known Limitations](#12-known-limitations)

---

## 1. System Overview

### 1.1 Purpose and Goals

Digital Brain MCP is a **persistent "second brain" for AI assistants**, implemented as a Next.js application exposing a Model Context Protocol (MCP) server. It enables any MCP-compatible AI client (Claude, Cursor, OpenCode, GitHub Copilot, etc.) to:

- **Store** text memories, notes, code snippets, conversation summaries, and binary files (images, PDFs, audio, video) with semantic vector embeddings.
- **Recall** stored knowledge through natural-language semantic search (cosine similarity over pgvector HNSW index).
- **Browse** stored memories with pagination and filtering by type, tags, or content type.
- **Manage** memories (update content, tags, metadata; delete entries; get statistics).

**Design goals, in priority order:**

1. **Zero-friction recall** — any natural-language query retrieves semantically relevant memories.
2. **Multimodal storage** — text and binary files (image/PDF/audio/video) all map to the same 768-dimensional vector space via Gemini Embedding 2.
3. **Serverless/scale-to-zero** — no always-on infrastructure; runs entirely on Vercel's serverless functions.
4. **Single-user, personal-scale** — designed for one person's "second brain", not multi-tenant SaaS.
5. **Security by default** — fail-closed auth, service-role-only DB access, private storage bucket.

### 1.2 Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI CLIENT LAYER                               │
│  Claude / Cursor / OpenCode / GitHub Copilot / any MCP client  │
└────────────────────────┬────────────────────────────────────────┘
                         │  MCP Protocol (Streamable HTTP + SSE)
                         │  Authorization: Bearer <api-key>
                         │  POST/GET/DELETE /api/mcp/[transport]
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL (Next.js 15)                           │
│  Serverless Function: src/app/api/mcp/[transport]/route.ts      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               withMcpAuth middleware                     │   │
│  │  Reads: DIGITAL_BRAIN_API_KEYS env var                  │   │
│  │  Validates Bearer token (comma-separated multi-key)     │   │
│  │  Fail-closed: no keys configured → all requests 401     │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                        │ AuthInfo { clientId, scopes, token }   │
│                        ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            createMcpHandler (mcp-handler)                │   │
│  │  basePath: "/api/mcp"                                   │   │
│  │  verboseLogs: true                                      │   │
│  │  redisUrl: REDIS_URL (Upstash/Vercel KV)               │   │
│  │  disableSse: false                                      │   │
│  │                                                          │   │
│  │  Tools registered:                                       │   │
│  │    store_memory    search_memory    list_memories        │   │
│  │    update_memory   delete_memory   get_stats            │   │
│  │  [PLANNED]:                                             │   │
│  │    store_file      store_file_from_url  get_file_url   │   │
│  └──────┬────────────────────────┬───────────────────────-┘   │
│          │                        │                              │
│          ▼                        ▼                              │
│  ┌──────────────┐      ┌──────────────────────────────────┐    │
│  │  src/lib/    │      │       src/lib/supabase.ts        │    │
│  │  embeddings.ts│      │  supabase client (service_role)  │    │
│  │              │      │  insertMemory / searchMemories   │    │
│  │  Gemini SDK  │      │  listMemories / deleteMemory     │    │
│  │  embedContent│      │  updateMemory                    │    │
│  └──────┬───────┘      └───────────┬──────────────────────┘   │
└─────────┼────────────────────────--┼──────────────────────────--┘
          │                          │
          ▼                          ▼
┌─────────────────┐      ┌─────────────────────────────────┐
│   GOOGLE CLOUD  │      │          SUPABASE               │
│                 │      │                                  │
│  Gemini Embed 2 │      │  PostgreSQL + pgvector           │
│  Model ID:      │      │  Table: memories                 │
│  gemini-embed-  │      │  HNSW index on embedding col    │
│  ing-2-preview  │      │  GIN index on tags col          │
│                 │      │  RLS: service_role only         │
│  Input:  text   │      │                                  │
│  Output: 768-d  │      │  Storage bucket: brain-files    │
│  vector (MRL    │      │  (private, service_role only)   │
│  truncated from │      │                                  │
│  3072)          │      │  RPC functions:                 │
│                 │      │    match_memories               │
└─────────────────┘      │    memory_stats_by_type         │
                         │    memory_stats_by_tag          │
                         └─────────────────────────────────┘

        ┌────────────────────────────────┐
        │     UPSTASH REDIS (Vercel KV)  │
        │  SSE session state management  │
        │  Required for SSE transport    │
        │  resumability                  │
        └────────────────────────────────┘
```

### 1.3 Data Flow Summaries

**Text Memory Storage:**
1. MCP client calls `store_memory` tool with `content`, `tags`, `content_type`, etc.
2. `route.ts` handler calls `getTextEmbedding(content)` → Gemini API → 768-dim vector → L2-normalized.
3. `insertMemory({ content, embedding, ... })` → Supabase `.insert()` on `memories` table.
4. Returns `{ success: true, memory: { id, content_type, tags, source, created_at } }`.

**Semantic Search:**
1. MCP client calls `search_memory` with `query`, optional `limit`, `threshold`, `filter_tags`.
2. `getTextEmbedding(query)` → 768-dim query vector.
3. `searchMemories({ queryEmbedding, matchCount, matchThreshold, filterTags })` → `supabase.rpc("match_memories", ...)`.
4. PostgreSQL executes: `1 - (embedding <=> query_embedding)` for cosine similarity, filters by threshold and optional tag overlap, orders by distance, limits results.
5. Returns ranked `MemoryMatch[]` array with similarity scores.

**File Storage (PLANNED — not in current codebase):**
1. MCP client calls `store_file` with base64-encoded file data, mimeType, optional text description.
2. If both text and file provided: `getInterleavedEmbedding(text, base64Data, mimeType)`.
3. If file only: `getMultimodalEmbedding(base64Data, mimeType)`.
4. `uploadFile(fileName, fileData, mimeType)` → Supabase Storage `brain-files` bucket → returns storage path.
5. `insertMemory({ ..., file_mime_type, file_name, file_size_bytes, file_storage_path })` → row in `memories`.
6. Returns memory row with file metadata.

### 1.4 Technology Stack

| Component | Package / Service | Version | Rationale |
|---|---|---|---|
| **Runtime framework** | Next.js | ^15.3.0 | App Router, serverless-native, Vercel-optimized; dynamic `[transport]` route handles both SSE and Streamable HTTP with a single file |
| **MCP adapter** | mcp-handler | ^1.0.0 | Vercel-specific adapter wrapping `@modelcontextprotocol/sdk`; handles SSE session resumability via Redis, route parameter extraction, auth middleware integration |
| **MCP SDK** | @modelcontextprotocol/sdk | ^1.0.0 | Official TypeScript SDK; provides `Server`, `AuthInfo` types, tool registration API |
| **Embedding model** | Gemini Embedding 2 (`gemini-embedding-2-preview`) | via @google/genai ^1.0.0 | Only natively multimodal embedding model (text + image + audio + video + PDF → same vector space); MRL allows 768-dim truncation with minimal quality loss |
| **Vector database** | Supabase (PostgreSQL + pgvector) | @supabase/supabase-js ^2.49.0 | Managed PostgreSQL with pgvector extension; HNSW index for sub-linear ANN search; built-in storage for binary files; RLS for security |
| **Schema validation** | Zod | ^3.24.0 | Type-safe MCP tool input validation; integrates with mcp-handler's `server.tool()` schema parameter |
| **Session store** | Upstash Redis (Vercel KV) | via REDIS_URL env | Required for SSE transport resumability; mcp-handler manages session state here |
| **Language** | TypeScript | ^5.7.0 | Strict mode enabled; ES2017 target |
| **React** | react + react-dom | ^19.0.0 | Required by Next.js; minimal usage (landing page only) |
| **Node types** | @types/node | ^22.0.0 | Type definitions for Buffer, process.env, etc. |
| **Deployment** | Vercel | N/A | Serverless functions, auto-scaling, Vercel KV (Upstash Redis) integration |

---

## 2. File-by-File Specification

### 2.1 Repository Structure

```
digital-brain-mcp/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── mcp/
│   │   │       └── [transport]/
│   │   │           └── route.ts        ← MCP endpoint (all tools + auth)
│   │   ├── layout.tsx                  ← Next.js root layout
│   │   └── page.tsx                    ← Landing page (HTML only)
│   └── lib/
│       ├── embeddings.ts               ← Gemini Embedding 2 client
│       └── supabase.ts                 ← Supabase client + data helpers
├── supabase/
│   └── migrations/
│       └── 001_create_memories.sql     ← Full DB schema DDL
├── .env.example                        ← Environment variable template
├── .gitignore
├── .mcp.json                           ← MCP client connection config
├── README.md
├── next.config.js
├── package.json
└── tsconfig.json
```

---

### 2.2 `package.json`

**Path:** `/package.json`  
**Purpose:** Node.js project manifest. Defines dependencies, scripts, and package metadata.

**Full content:**
```json
{
  "name": "digital-brain-mcp",
  "version": "1.0.0",
  "description": "A Second Brain MCP server using Gemini Embedding 2 and Supabase pgvector, deployed on Vercel",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@google/genai": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@supabase/supabase-js": "^2.49.0",
    "mcp-handler": "^1.0.0",
    "next": "^15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

**Scripts:**
- `dev` — Starts Next.js dev server with hot reload on `http://localhost:3000`
- `build` — Compiles TypeScript, bundles for production (runs during Vercel deploy)
- `start` — Starts production server (used locally; Vercel manages this)
- `lint` — Runs Next.js ESLint rules

**Key dependency notes:**
- `private: true` — prevents accidental npm publish
- No `eslint` or `eslint-config-next` in devDeps — linting uses Next.js built-in config
- `@types/react` present but `@types/react-dom` absent — acceptable because `@types/react` covers shared types
- No `tailwindcss` or CSS framework — landing page uses inline styles only

---

### 2.3 `tsconfig.json`

**Path:** `/tsconfig.json`  
**Purpose:** TypeScript compiler configuration.

**Full content:**
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

**Critical settings:**
- `"strict": true` — enables all strict checks (strictNullChecks, noImplicitAny, strictFunctionTypes, etc.)
- `"moduleResolution": "bundler"` — Next.js 15 App Router requirement; allows bare specifier resolution
- `"paths": { "@/*": ["./src/*"] }` — path alias enabling `import { ... } from "@/lib/supabase"` instead of relative paths
- `"noEmit": true` — TypeScript only type-checks; Next.js/SWC handles actual compilation
- `"incremental": true` — caches type-check results in `.tsbuildinfo` for faster rebuilds
- `"isolatedModules": true` — each file must be independently compilable (required by SWC)

---

### 2.4 `next.config.js`

**Path:** `/next.config.js`  
**Purpose:** Next.js framework configuration. Currently empty (all defaults).

**Full content:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
```

**Implications of empty config:**
- No custom webpack config
- No `experimental` flags
- No `rewrites` or `redirects`
- No `headers` customization (important: no CORS headers set — MCP clients connect directly)
- Default `output: "standalone"` is NOT set — Vercel handles this automatically
- No `serverExternalPackages` — all dependencies bundled normally

**Note for extension:** If adding large binary processing dependencies, you may need to add them to `serverExternalPackages` to avoid bundle size issues.

---

### 2.5 `.env.example`

**Path:** `/.env.example`  
**Purpose:** Documents all required environment variables. Committed to git. Never put real values here.

**Full content:**
```bash
# AUTHENTICATION — comma-separated API keys for MCP client access
# Generate a strong key: openssl rand -hex 32
# Multiple keys (one per client) can be comma-separated
DIGITAL_BRAIN_API_KEYS=your-secret-key-here

# GEMINI API — get from https://aistudio.google.com/apikey
GEMINI_API_KEY=your-gemini-api-key

# SUPABASE — get from your Supabase project Settings > API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# REDIS — auto-set when you create Upstash KV in the Vercel dashboard
REDIS_URL=your-upstash-redis-url
```

---

### 2.6 `.mcp.json`

**Path:** `/.mcp.json`  
**Purpose:** MCP client connection configuration. Used by Claude Code/Desktop and other clients that support project-level MCP config. This file configures both a local dev connection and a production connection.

**Full content:**
```json
{
  "mcpServers": {
    "digital-brain-local": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:3000/api/mcp/sse",
        "--header",
        "Authorization:Bearer ${DIGITAL_BRAIN_API_KEY}"
      ],
      "env": {
        "DIGITAL_BRAIN_API_KEY": "your-local-api-key"
      }
    },
    "digital-brain": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://digital-brain-mcp.vercel.app/api/mcp/sse",
        "--header",
        "Authorization:Bearer ${DIGITAL_BRAIN_API_KEY}"
      ],
      "env": {
        "DIGITAL_BRAIN_API_KEY": "your-production-api-key"
      }
    }
  }
}
```

**Important notes:**
- `type: "stdio"` with `npx mcp-remote` — the client connects via stdio to a local proxy process (`mcp-remote`) which then bridges to the remote HTTP/SSE endpoint. This is the standard pattern for connecting MCP clients that only support stdio to remote HTTP MCP servers.
- `mcp-remote` package is used ad-hoc via `npx -y` (no explicit install needed).
- The `--header` arg injects the Bearer token into every request to the remote server.
- `${DIGITAL_BRAIN_API_KEY}` — environment variable substitution; the actual key is in the `env` field of the config, not hardcoded.
- Replace `digital-brain-mcp.vercel.app` with your actual Vercel deployment URL.

---

### 2.7 `src/lib/embeddings.ts`

**Path:** `/src/lib/embeddings.ts`  
**Purpose:** All Gemini Embedding 2 API interactions. Provides functions to generate L2-normalized 768-dimensional vectors from text and/or binary file data (multimodal).

**Dependencies:**
- `@google/genai` — Google Generative AI SDK
- `process.env.GEMINI_API_KEY` — throws at module load if missing

**Module-level initialization:**
```typescript
import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY environment variable");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_ID = "gemini-embedding-2-preview"; // private constant
```

The `throw` at module load means the entire Next.js route will fail to initialize if `GEMINI_API_KEY` is absent. This is intentional fail-fast behavior.

---

#### 2.7.1 `EMBEDDING_DIMENSION` (exported constant)

```typescript
export const EMBEDDING_DIMENSION = 768;
```

Used as the authoritative single source of truth for the vector dimension across the entire codebase. The SQL schema (`vector(768)`) must stay in sync with this value manually — there is no code-level link.

---

#### 2.7.2 `normalizeVector(vector)` (private function)

```typescript
function normalizeVector(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const val of vector) {
    sumOfSquares += val * val;
  }
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return vector; // guard against zero vector
  return vector.map((val) => val / magnitude);
}
```

**Signature:** `(vector: number[]) => number[]`  
**Purpose:** L2-normalizes a vector to unit length (magnitude = 1.0).  
**Why needed:** pgvector's `<=>` operator computes cosine distance. Cosine distance on unit vectors equals Euclidean distance divided by 2, making it equivalent to dot product distance. Pre-normalizing ensures consistent similarity semantics regardless of the Gemini API's output normalization. The Gemini API may already return normalized vectors, but this is defensive.  
**Edge case:** Zero vector (all zeros) is returned unchanged rather than causing a divide-by-zero.

---

#### 2.7.3 `getTextEmbedding(text)` (exported function)

```typescript
export async function getTextEmbedding(text: string): Promise<number[]>
```

**Parameters:**
- `text: string` — Any UTF-8 text. No length enforcement in code (Gemini API has implicit limits).

**Returns:** `Promise<number[]>` — Array of 768 floats, L2-normalized.

**Implementation:**
```typescript
const response = await ai.models.embedContent({
  model: MODEL_ID,
  contents: [{ parts: [{ text }] }],
  config: {
    outputDimensionality: EMBEDDING_DIMENSION, // = 768
  },
});

const values = response.embeddings?.[0]?.values;
if (!values) {
  throw new Error("No embeddings returned from Gemini API");
}

return normalizeVector(values);
```

**SDK call details:**
- `ai.models.embedContent()` — method on the `GoogleGenAI` instance's `models` namespace
- `contents` — array with a single content object containing a single text part
- `config.outputDimensionality: 768` — instructs Gemini to return MRL-truncated 768-dim vector instead of full 3072-dim
- `response.embeddings[0].values` — the float array

**Error behavior:** Throws `Error` if API returns no embeddings (network error, invalid key, quota exceeded, etc.). Caller is responsible for try/catch.

**Usage:** Called by `store_memory` and `search_memory` tools, and by `update_memory` when content changes.

---

#### 2.7.4 `getMultimodalEmbedding(data, mimeType)` (exported function — PLANNED feature)

```typescript
export async function getMultimodalEmbedding(
  data: Buffer | Uint8Array,
  mimeType: string
): Promise<number[]>
```

**Parameters:**
- `data: Buffer | Uint8Array` — Raw binary file data
- `mimeType: string` — MIME type string (e.g., `"image/jpeg"`, `"application/pdf"`, `"audio/mp3"`, `"video/mp4"`)

**Returns:** `Promise<number[]>` — 768-dim L2-normalized embedding of the file content only (no text).

**Implementation:**
```typescript
const base64Data =
  data instanceof Buffer
    ? data.toString("base64")
    : Buffer.from(data).toString("base64");

const response = await ai.models.embedContent({
  model: MODEL_ID,
  contents: [
    {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType,
          },
        },
      ],
    },
  ],
  config: {
    outputDimensionality: EMBEDDING_DIMENSION,
  },
});

const values = response.embeddings?.[0]?.values;
if (!values) {
  throw new Error("No embeddings returned from Gemini API for multimodal content");
}

return normalizeVector(values);
```

**Key difference from `getTextEmbedding`:** Uses `inlineData` part instead of `text` part. The `inlineData.data` field must be base64-encoded. The `inlineData.mimeType` field tells Gemini how to interpret the bytes.

**Note on current codebase:** This function is present in `embeddings.ts` but not called by any current route handler. It is intended for the planned `store_file` and `store_file_from_url` tools.

---

#### 2.7.5 `getInterleavedEmbedding(text, base64Data, mimeType)` (PLANNED)

**Signature (planned):**
```typescript
export async function getInterleavedEmbedding(
  text: string,
  base64Data: string,
  mimeType: string
): Promise<number[]>
```

**Purpose:** Creates an embedding that captures both a textual description/caption and the binary file content in a single vector. Used when the user provides both `content` (description) and a file in `store_file`.

**Implementation pattern (planned):**
```typescript
const response = await ai.models.embedContent({
  model: MODEL_ID,
  contents: [
    {
      parts: [
        { text },
        { inlineData: { data: base64Data, mimeType } },
      ],
    },
  ],
  config: { outputDimensionality: EMBEDDING_DIMENSION },
});
```

Gemini Embedding 2 supports interleaved text+file parts in a single content object, producing one unified embedding representing both modalities.

---

#### 2.7.6 `SUPPORTED_MIME_TYPES` (PLANNED export)

```typescript
export const SUPPORTED_MIME_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  pdf:   ["application/pdf"],
  audio: ["audio/mp3", "audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/flac"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
};

export const ALL_SUPPORTED_MIME_TYPES: string[] = Object.values(SUPPORTED_MIME_TYPES).flat();
```

---

#### 2.7.7 `getModalityFromMime(mimeType)` (PLANNED export)

```typescript
export function getModalityFromMime(
  mimeType: string
): "image" | "pdf" | "audio" | "video" | "unknown" {
  for (const [modality, types] of Object.entries(SUPPORTED_MIME_TYPES)) {
    if (types.includes(mimeType)) {
      return modality as "image" | "pdf" | "audio" | "video";
    }
  }
  return "unknown";
}
```

---

### 2.8 `src/lib/supabase.ts`

**Path:** `/src/lib/supabase.ts`  
**Purpose:** Supabase client initialization, TypeScript type definitions for the data model, and all database interaction helper functions.

**Dependencies:**
- `@supabase/supabase-js` — Supabase JavaScript SDK
- `process.env.SUPABASE_URL` — throws at module load if missing
- `process.env.SUPABASE_SERVICE_ROLE_KEY` — throws at module load if missing

**Module-level initialization:**
```typescript
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
```

The client is initialized with the **service role key**, not the anon key. This is critical:
- Service role key bypasses Supabase Row Level Security (RLS) entirely
- Enables full read/write/delete on the `memories` table regardless of RLS policies
- Must never be exposed to client-side code or browser
- On Vercel, this key lives in server-side environment variables only

---

#### 2.8.1 `Memory` Interface (exported type)

```typescript
export interface Memory {
  id: number;                          // BIGSERIAL primary key (auto-incrementing)
  content: string;                     // The text content of the memory
  metadata: Record<string, unknown>;   // Arbitrary JSON metadata
  content_type: string;                // "text"|"note"|"code"|"conversation"|"research"|"decision"|"reference"
  source: string | null;               // Origin (e.g., "mcp-client", URL, "conversation")
  tags: string[];                      // Array of categorization tags
  embedding?: number[];                // 768-dim vector (excluded from most queries)
  created_at: string;                  // ISO 8601 timestamp string
  updated_at: string;                  // ISO 8601 timestamp string
  // PLANNED file fields:
  file_mime_type?: string;             // e.g., "image/jpeg"
  file_name?: string;                  // Original filename
  file_size_bytes?: number;            // File size
  file_storage_path?: string;          // Path in Supabase Storage bucket
}
```

**Notes:**
- `embedding` is `?` (optional) because it is excluded from `SELECT` statements in most queries to avoid transferring 768×4=3072 bytes per row unnecessarily. The embedding column exists in the DB but is only returned when explicitly selected.
- `id` type is `number` (JavaScript) mapping to `bigserial`/`bigint` in PostgreSQL. JavaScript's `number` can safely represent integers up to 2^53-1; for typical personal-scale usage this is fine.
- Current database schema does NOT include the `file_*` columns — those are planned extensions (see § 11).

---

#### 2.8.2 `MemoryMatch` Interface (exported type)

```typescript
export interface MemoryMatch extends Omit<Memory, "embedding" | "updated_at"> {
  similarity: number;  // Cosine similarity score, range [0, 1]
}
```

Returned by `searchMemories`. Similarity is computed as `1 - cosine_distance` in the SQL function. A value of `1.0` = identical vectors; `0.0` = orthogonal (completely unrelated).

---

#### 2.8.3 `insertMemory(params)` (exported function)

```typescript
export async function insertMemory(params: {
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;   // default: {}
  content_type?: string;                // default: "text"
  source?: string;                      // default: null
  tags?: string[];                      // default: []
}): Promise<Memory>
```

**Implementation:**
```typescript
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
```

**Key behavior:** `.select().single()` returns the full inserted row (including auto-generated `id`, `created_at`, `updated_at`). This makes the ID immediately available to the caller without a subsequent query. Throws on any Supabase error.

---

#### 2.8.4 `searchMemories(params)` (exported function)

```typescript
export async function searchMemories(params: {
  queryEmbedding: number[];
  matchThreshold?: number;   // default: 0.4 (minimum cosine similarity)
  matchCount?: number;       // default: 10 (max results)
  filterTags?: string[];     // default: null (no tag filter)
}): Promise<MemoryMatch[]>
```

**Implementation:**
```typescript
const { data, error } = await supabase.rpc("match_memories", {
  query_embedding: params.queryEmbedding,
  match_threshold: params.matchThreshold ?? 0.4,
  match_count: params.matchCount ?? 10,
  filter_tags: params.filterTags ?? null,
});

if (error) throw new Error(`Supabase search error: ${error.message}`);
return (data ?? []) as MemoryMatch[];
```

**Important:** This calls the PostgreSQL `match_memories` RPC function (defined in the SQL migration). All filtering by threshold and tags happens in PostgreSQL — not in application code. The function uses the pgvector HNSW index for ANN search.

**Tag filtering semantics:** `filter_tags` uses PostgreSQL array overlap (`&&` operator). A memory matches if it has AT LEAST ONE of the specified tags. This is OR semantics, not AND.

---

#### 2.8.5 `listMemories(params?)` (exported function)

```typescript
export async function listMemories(params?: {
  contentType?: string;   // exact match on content_type column
  tags?: string[];        // array overlap (OR semantics)
  limit?: number;         // default: 20, max enforced by caller (100)
  offset?: number;        // pagination offset
}): Promise<Memory[]>
```

**Implementation:**
```typescript
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
```

**Notes:**
- `embedding` column is explicitly excluded from the SELECT to avoid unnecessary data transfer (each 768-dim vector = 3072 bytes as float32).
- `.overlaps("tags", params.tags)` generates `tags && $1` SQL (PostgreSQL array overlap).
- When `offset` is provided, `.range()` overrides `.limit()` behavior — `.range(start, end)` is inclusive on both ends.
- Results are ordered by `created_at DESC` (newest first).

---

#### 2.8.6 `deleteMemory(id)` (exported function)

```typescript
export async function deleteMemory(id: number): Promise<void>
```

**Current implementation:**
```typescript
const { error } = await supabase.from("memories").delete().eq("id", id);
if (error) throw new Error(`Supabase delete error: ${error.message}`);
```

**PLANNED extension:** When file storage columns are added, `deleteMemory` must first fetch the `file_storage_path` from the row, delete the file from Supabase Storage (`supabase.storage.from("brain-files").remove([storagePath])`), then delete the row. Current implementation does not handle storage cleanup because file columns don't exist yet.

---

#### 2.8.7 `updateMemory(params)` (exported function)

```typescript
export async function updateMemory(params: {
  id: number;
  content?: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  tags?: string[];
  source?: string;
}): Promise<Memory>
```

**Implementation:**
```typescript
const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
if (params.content !== undefined)   updates.content   = params.content;
if (params.embedding !== undefined) updates.embedding = params.embedding;
if (params.metadata !== undefined)  updates.metadata  = params.metadata;
if (params.tags !== undefined)      updates.tags      = params.tags;
if (params.source !== undefined)    updates.source    = params.source;

const { data, error } = await supabase
  .from("memories")
  .update(updates)
  .eq("id", params.id)
  .select()
  .single();

if (error) throw new Error(`Supabase update error: ${error.message}`);
return data as Memory;
```

**Key behavior:** `updated_at` is always set to `new Date().toISOString()` in application code (not via a DB trigger). This is a deliberate choice — no PostgreSQL trigger required. Only fields where the parameter is explicitly provided (`!== undefined`) are updated; omitted fields retain their existing values.

---

#### 2.8.8 `uploadFile(fileName, fileData, mimeType)` (PLANNED export)

```typescript
export async function uploadFile(
  fileName: string,
  fileData: Buffer,
  mimeType: string
): Promise<string>  // returns storage path, e.g., "uploads/1711234567890_document.pdf"
```

**Planned implementation:**
```typescript
const timestamp = Date.now();
const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
const storagePath = `uploads/${timestamp}_${sanitizedName}`;

const { error } = await supabase.storage
  .from("brain-files")
  .upload(storagePath, fileData, {
    contentType: mimeType,
    upsert: false,
  });

if (error) throw new Error(`Storage upload error: ${error.message}`);
return storagePath;
```

---

#### 2.8.9 `getFileUrl(storagePath)` (PLANNED export)

```typescript
export async function getFileUrl(storagePath: string): Promise<string>
```

**Planned implementation:**
```typescript
const { data, error } = await supabase.storage
  .from("brain-files")
  .createSignedUrl(storagePath, 3600);  // 1-hour expiry

if (error) throw new Error(`Failed to generate signed URL: ${error.message}`);
return data.signedUrl;
```

---

### 2.9 `src/app/api/mcp/[transport]/route.ts`

**Path:** `/src/app/api/mcp/[transport]/route.ts`  
**Purpose:** The single MCP endpoint for the entire server. Handles all MCP client communication (tool calls, capability negotiation, session management). This is a Next.js App Router Route Handler.

**URL pattern:** `/api/mcp/[transport]` where `[transport]` is a dynamic segment.
- `/api/mcp/sse` — SSE transport (Server-Sent Events, legacy + widely supported)
- `/api/mcp/mcp` — Streamable HTTP transport (new MCP 2025-03-26 spec)

The `mcp-handler` library reads the `transport` path parameter and routes accordingly.

**Exports:**
```typescript
export { handler as GET, handler as POST, handler as DELETE };
```
All three HTTP methods are exported because:
- `GET` — Used for SSE stream establishment (client opens persistent connection)
- `POST` — Used for sending tool call requests (Streamable HTTP and SSE message posting)
- `DELETE` — Used for session cleanup

**Dependencies:**
```typescript
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
```

Note the `.js` extension on the SDK import — required for ESM compatibility in the TypeScript `moduleResolution: "bundler"` mode.

---

#### 2.9.1 Handler Construction

```typescript
const baseHandler = createMcpHandler(
  (server) => {
    // Tool registrations here (see §2.9.2 – §2.9.7)
  },
  {},  // server options (empty = defaults)
  {    // handler options
    basePath: "/api/mcp",
    verboseLogs: true,
    redisUrl: process.env.REDIS_URL,
    disableSse: false,
  }
);
```

**`createMcpHandler` parameters:**
1. `setupFn: (server: McpServer) => void` — called once to register all tools, resources, prompts
2. `serverOptions: {}` — MCP server capabilities (empty = auto-negotiated)
3. `handlerOptions`:
   - `basePath: "/api/mcp"` — must match the route path prefix; used to construct transport-specific URLs internally
   - `verboseLogs: true` — logs every MCP request/response to console (visible in Vercel function logs)
   - `redisUrl: process.env.REDIS_URL` — Upstash Redis connection for SSE session state
   - `disableSse: false` — SSE transport is enabled (setting to `true` would make only Streamable HTTP available)

---

#### 2.9.2 Tool: `store_memory`

**Registration:**
```typescript
server.tool(
  "store_memory",
  "Store a new memory in the Digital Brain...",
  {
    content:      z.string().describe("The text content to store..."),
    source:       z.string().optional().describe("Where this memory came from..."),
    tags:         z.array(z.string()).optional().describe("Tags for categorization..."),
    content_type: z.enum(["text","note","code","conversation","research","decision","reference"])
                   .optional().describe("The type of content..."),
    metadata:     z.record(z.unknown()).optional().describe("Optional structured metadata..."),
  },
  async ({ content, source, tags, content_type, metadata }) => { ... }
);
```

**Input schema (Zod):**
| Parameter | Type | Required | Default | Validation |
|---|---|---|---|---|
| `content` | `string` | ✅ | — | Any string |
| `source` | `string` | ❌ | `"mcp-client"` | Any string |
| `tags` | `string[]` | ❌ | `[]` | Array of strings |
| `content_type` | enum | ❌ | `"text"` | One of 7 values |
| `metadata` | `Record<string, unknown>` | ❌ | `{}` | Any JSON object |

**Handler logic:**
1. `getTextEmbedding(content)` — generates 768-dim vector
2. `insertMemory({ content, embedding, source: source ?? "mcp-client", tags: tags ?? [], content_type: content_type ?? "text", metadata: metadata ?? {} })`
3. Returns success response with `{ id, content_type, tags, source, created_at }`

**Success response format:**
```json
{
  "success": true,
  "message": "Memory stored successfully.",
  "memory": {
    "id": 42,
    "content_type": "code",
    "tags": ["work", "typescript"],
    "source": "conversation",
    "created_at": "2026-03-21T23:38:00.000Z"
  }
}
```

**Error response format:**
```json
{ "success": false, "error": "Supabase insert error: ..." }
```
With `isError: true` in the MCP content response.

---

#### 2.9.3 Tool: `search_memory`

**Input schema (Zod):**
| Parameter | Type | Required | Default | Validation |
|---|---|---|---|---|
| `query` | `string` | ✅ | — | Any string |
| `limit` | `number` (int) | ❌ | `10` | min 1, max 50 |
| `threshold` | `number` | ❌ | `0.4` | min 0, max 1 |
| `filter_tags` | `string[]` | ❌ | `null` | Array of strings |

**Handler logic:**
1. `getTextEmbedding(query)` — embeds the search query
2. `searchMemories({ queryEmbedding, matchCount: limit ?? 10, matchThreshold: threshold ?? 0.4, filterTags: filter_tags })`
3. Maps results to include similarity rounded to 3 decimal places: `Math.round(r.similarity * 1000) / 1000`
4. Returns array of results sorted by similarity descending (done in PostgreSQL)

**Result shape per memory:**
```json
{
  "id": 42,
  "similarity": 0.847,
  "content": "...",
  "content_type": "text",
  "source": "conversation",
  "tags": ["work"],
  "metadata": {},
  "created_at": "2026-03-21T23:38:00.000Z"
}
```

**Threshold guidance:**
- `0.4` (default) — balanced; returns semantically related content
- `0.6+` — strict; only near-exact semantic matches
- `0.2–0.3` — loose; returns broadly topically related content
- `0.0` — returns all content (effectively no threshold)

---

#### 2.9.4 Tool: `list_memories`

**Input schema (Zod):**
| Parameter | Type | Required | Default | Validation |
|---|---|---|---|---|
| `content_type` | `string` | ❌ | none | Any string |
| `tags` | `string[]` | ❌ | none | Array |
| `limit` | `number` (int) | ❌ | `20` | min 1, max 100 |
| `offset` | `number` (int) | ❌ | `0` | min 0 |

**Handler logic:**
1. `listMemories({ contentType: content_type, tags, limit: limit ?? 20, offset: offset ?? 0 })`
2. Truncates `content` to 200 chars with `...` suffix for display (avoids massive response payloads)

**Truncation behavior:**
```typescript
content: m.content.length > 200
  ? m.content.substring(0, 200) + "..."
  : m.content
```

This truncation happens in the route handler, not in the database query. The full content is returned by Supabase but truncated before being sent to the MCP client.

---

#### 2.9.5 Tool: `update_memory`

**Input schema (Zod):**
| Parameter | Type | Required | Default |
|---|---|---|---|
| `id` | `number` (int) | ✅ | — |
| `content` | `string` | ❌ | unchanged |
| `tags` | `string[]` | ❌ | unchanged |
| `source` | `string` | ❌ | unchanged |
| `metadata` | `Record<string, unknown>` | ❌ | unchanged |

**Handler logic:**
1. If `content` is provided: `getTextEmbedding(content)` → generates new embedding
2. `updateMemory({ id, content, embedding, tags, source, metadata })`
3. Returns `{ id, content_type, tags, source, updated_at }`

**Partial update semantics:** Only provided fields are updated. Omitting `tags` preserves existing tags. Omitting `metadata` preserves existing metadata. There is NO way to explicitly set a field to `null` via this tool (the Zod schema doesn't allow null values).

---

#### 2.9.6 Tool: `delete_memory`

**Input schema (Zod):**
| Parameter | Type | Required |
|---|---|---|
| `id` | `number` (int) | ✅ |

**Handler logic:**
1. `deleteMemory(id)` — calls Supabase `.delete().eq("id", id)`
2. Returns `{ success: true, message: "Memory {id} deleted successfully." }`

**Note:** No confirmation or "soft delete" — this is immediate and permanent. The tool description explicitly states "This cannot be undone."

---

#### 2.9.7 Tool: `get_stats`

**Input schema:** `{}` (no parameters)

**Handler logic:**
1. Dynamic import of `supabase` client: `const { supabase } = await import("@/lib/supabase")`
   - This is unusual — uses `await import()` instead of a top-level import. This is functionally equivalent since modules are cached after first import.
2. `supabase.from("memories").select("*", { count: "exact", head: true })` — gets total count without fetching rows
3. `supabase.rpc("memory_stats_by_type")` — gets count per content_type
4. `supabase.rpc("memory_stats_by_tag")` — gets top 20 tags by frequency

**Response shape:**
```json
{
  "success": true,
  "total_memories": 247,
  "by_content_type": [
    { "content_type": "text", "count": 120 },
    { "content_type": "code", "count": 89 }
  ],
  "top_tags": [
    { "tag": "work", "count": 145 },
    { "tag": "typescript", "count": 67 }
  ]
}
```

---

#### 2.9.8 Authentication Setup

```typescript
const verifyToken = async (
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;

  const configuredKeys = process.env.DIGITAL_BRAIN_API_KEYS;
  if (!configuredKeys || configuredKeys.trim() === "") {
    return undefined; // Fail-closed: no keys configured = reject all
  }

  const allowedKeys = configuredKeys
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!allowedKeys.includes(bearerToken)) {
    return undefined; // Invalid key
  }

  return {
    token: bearerToken,
    clientId: "digital-brain-client",
    scopes: ["read", "write"],
  };
};

const handler = withMcpAuth(baseHandler, verifyToken, {
  required: true,
});
```

**`verifyToken` behavior:**
- Returns `undefined` → request is unauthenticated (rejected by `withMcpAuth` with `required: true`)
- Returns `AuthInfo` object → request is authenticated and proceeds

**`withMcpAuth` with `required: true`:**
- Any request where `verifyToken` returns `undefined` receives an automatic HTTP 401 response
- The `AuthInfo` is injected into tool handler context (accessible but not currently used in tool logic — all tools are stateless with respect to auth identity)

**Multi-key format example:**
```
DIGITAL_BRAIN_API_KEYS=abc123def456,xyz789ghi012,another-key-here
```
Each key is trimmed of whitespace and empty entries are filtered. Key comparison is exact string match (not timing-safe — see § 12).

---

#### 2.9.9 Planned Tools (not yet in codebase)

These tools are specified in the project design but not present in the current `route.ts`:

**`store_file`:**
- Input: `content` (optional text description), `file_data` (base64 string), `mime_type`, `file_name`, `source`, `tags`, `content_type`, `metadata`
- Logic: Decode base64 → Buffer → `uploadFile()` → `getInterleavedEmbedding()` or `getMultimodalEmbedding()` → `insertMemory()` with file columns

**`store_file_from_url`:**
- Input: `url` (file URL), optional `content` description, `source`, `tags`, `content_type`, `metadata`
- Logic: `fetch(url)` → Buffer → detect MIME type from `Content-Type` header → same as `store_file`

**`get_file_url`:**
- Input: `id` (memory ID)
- Logic: `supabase.from("memories").select("file_storage_path").eq("id", id)` → `getFileUrl(storagePath)` → return signed URL

---

### 2.10 `src/app/layout.tsx`

**Path:** `/src/app/layout.tsx`  
**Purpose:** Next.js App Router root layout. Wraps all pages with HTML document structure. Required by Next.js App Router.

**Full content:**
```typescript
export const metadata = {
  title: "Digital Brain MCP",
  description: "Second Brain MCP Server — Gemini Embedding 2 + Supabase pgvector",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

**No imports** — Next.js 15 App Router implicitly provides React. No CSS framework, no global styles, no fonts.

---

### 2.11 `src/app/page.tsx`

**Path:** `/src/app/page.tsx`  
**Purpose:** Landing page served at `/`. Provides human-readable documentation about the server. Has no functional interaction with the MCP system — it is purely informational.

**Content summary:** Renders a simple HTML page listing available tools and tech stack using inline styles. No routing, forms, or API calls.

---

### 2.12 `supabase/migrations/001_create_memories.sql`

**Path:** `/supabase/migrations/001_create_memories.sql`  
**Purpose:** Complete database DDL. Run once in Supabase SQL Editor to set up the entire schema. Not run automatically — manual execution required.

See § 3 (Database Schema) for full documentation of this file's contents.

---

## 3. Database Schema

### 3.1 Prerequisites

```sql
-- Enable pgvector extension (must be done first)
CREATE EXTENSION IF NOT EXISTS vector;
```

The `vector` extension must exist before the `vector(768)` column type can be used. Supabase projects have pgvector available by default — it just needs to be enabled per-project.

### 3.2 `memories` Table — Full DDL

```sql
CREATE TABLE IF NOT EXISTS memories (
  id            BIGSERIAL PRIMARY KEY,
  content       TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  content_type  TEXT DEFAULT 'text',
  source        TEXT,
  tags          TEXT[] DEFAULT '{}',
  embedding     VECTOR(768),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Column definitions:**

| Column | PostgreSQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `BIGSERIAL` / `BIGINT` | NOT NULL | auto-increment | Primary key. Maps to JS `number` type. BIGSERIAL auto-creates a sequence. |
| `content` | `TEXT` | NOT NULL | — | Full text of the memory. Unlimited length (PostgreSQL TEXT). |
| `metadata` | `JSONB` | NULL allowed | `'{}'` | Binary JSON. Indexed differently than JSON. Supports GIN indexing (not currently added). |
| `content_type` | `TEXT` | NULL allowed | `'text'` | Categorical; enforced by application (not a CHECK constraint in DB). Allowed values: `text`, `note`, `code`, `conversation`, `research`, `decision`, `reference`. |
| `source` | `TEXT` | NULL allowed | `NULL` | Origin string; no format enforced. |
| `tags` | `TEXT[]` | NULL allowed | `'{}'` | PostgreSQL text array. Supports `&&` (overlap) and `@>` (contains) operators. |
| `embedding` | `VECTOR(768)` | NULL allowed | `NULL` | 768-dim float32 vector from pgvector. Stored as binary. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Set at insert time. Never updated. |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Set at insert time; updated in application code (not via trigger). |

**PLANNED additional columns for file support:**
```sql
ALTER TABLE memories ADD COLUMN file_mime_type   TEXT;
ALTER TABLE memories ADD COLUMN file_name        TEXT;
ALTER TABLE memories ADD COLUMN file_size_bytes  BIGINT;
ALTER TABLE memories ADD COLUMN file_storage_path TEXT;
```

### 3.3 Column Comments (Documentation in DB)

```sql
COMMENT ON TABLE memories IS 'Second brain memory store with vector embeddings';
COMMENT ON COLUMN memories.content IS 'The actual text content of the memory';
COMMENT ON COLUMN memories.metadata IS 'Arbitrary structured metadata (JSON)';
COMMENT ON COLUMN memories.content_type IS 'Category: text, note, code, conversation, research, decision, reference';
COMMENT ON COLUMN memories.source IS 'Origin of the memory (e.g. mcp-client, web-research, manual)';
COMMENT ON COLUMN memories.tags IS 'Array of tags for filtering';
COMMENT ON COLUMN memories.embedding IS '768-dimension Gemini Embedding 2 vector';
```

### 3.4 Indexes

#### HNSW Index on `embedding` (Vector Similarity Search)

```sql
CREATE INDEX IF NOT EXISTS memories_embedding_idx
  ON memories USING hnsw (embedding vector_cosine_ops);
```

- **Type:** HNSW (Hierarchical Navigable Small World graph)
- **Operator class:** `vector_cosine_ops` — optimized for cosine distance (`<=>` operator)
- **Purpose:** Enables approximate nearest neighbor (ANN) search in sub-linear time (O(log n) approximately)
- **Trade-offs:** HNSW builds a graph structure at index creation time; insertions are slower than flat indexes but queries are much faster for large datasets. For this personal-scale system, the slower insert is acceptable.
- **Alternative not used:** `ivfflat` — requires knowing the dataset size upfront to choose `lists` parameter; HNSW is generally preferred for variable-size datasets.

#### GIN Index on `tags` (Array Filtering)

```sql
CREATE INDEX IF NOT EXISTS memories_tags_idx
  ON memories USING gin (tags);
```

- **Type:** GIN (Generalized Inverted Index)
- **Purpose:** Accelerates `tags && $1` (overlap) and `tags @> $1` (contains) operations on the `TEXT[]` column
- **Used by:** `listMemories()` (`.overlaps()` filter) and `match_memories()` (`filter_tags && tags`)

#### B-tree Index on `content_type` (Categorical Filtering)

```sql
CREATE INDEX IF NOT EXISTS memories_content_type_idx
  ON memories (content_type);
```

- **Type:** Standard B-tree
- **Purpose:** Accelerates `WHERE content_type = $1` queries
- **Used by:** `listMemories()` (`.eq("content_type", ...)` filter)

#### Partial Index on `file_mime_type` (PLANNED)

```sql
CREATE INDEX IF NOT EXISTS memories_file_mime_type_idx
  ON memories (file_mime_type)
  WHERE file_mime_type IS NOT NULL;
```

- **Type:** Partial B-tree index (only indexes rows with files)
- **Purpose:** Allows efficient filtering for file-based memories only
- **Benefit of partial:** Doesn't index the majority of rows (text-only memories with NULL `file_mime_type`), saving index size

### 3.5 `match_memories` Function — Full DDL

```sql
CREATE OR REPLACE FUNCTION match_memories (
  query_embedding  VECTOR(768),
  match_threshold  FLOAT DEFAULT 0.4,
  match_count      INT DEFAULT 10,
  filter_tags      TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id            BIGINT,
  content       TEXT,
  metadata      JSONB,
  content_type  TEXT,
  source        TEXT,
  tags          TEXT[],
  similarity    FLOAT,
  created_at    TIMESTAMPTZ
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    memories.id,
    memories.content,
    memories.metadata,
    memories.content_type,
    memories.source,
    memories.tags,
    1 - (memories.embedding <=> query_embedding) AS similarity,
    memories.created_at
  FROM memories
  WHERE memories.embedding <=> query_embedding < 1 - match_threshold
    AND (filter_tags IS NULL OR memories.tags && filter_tags)
  ORDER BY memories.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

**Parameter semantics:**
- `query_embedding VECTOR(768)` — the embedded search query vector
- `match_threshold FLOAT` — minimum cosine similarity (0–1). The WHERE clause converts this: `distance < 1 - threshold`. Example: threshold=0.4 → distance < 0.6. Rows with distance ≥ 0.6 (similarity ≤ 0.4) are excluded.
- `match_count INT` — maximum rows to return (applied after filtering)
- `filter_tags TEXT[]` — optional tag filter; `NULL` means no tag filtering. When provided, uses `&&` operator (array overlap — OR semantics).

**Return columns:**
| Column | Type | Note |
|---|---|---|
| `id` | BIGINT | Memory primary key |
| `content` | TEXT | Full content (not truncated in SQL) |
| `metadata` | JSONB | Raw metadata object |
| `content_type` | TEXT | Category string |
| `source` | TEXT | Origin |
| `tags` | TEXT[] | Full tags array |
| `similarity` | FLOAT | `1 - cosine_distance` (range 0–1, higher = more similar) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Performance notes:**
- The HNSW index with `vector_cosine_ops` is used for the `<=>` operator evaluation
- `ORDER BY memories.embedding <=> query_embedding` lets the index direct the scan
- `LANGUAGE SQL STABLE` — tells PostgreSQL this function doesn't modify data and returns the same results for the same inputs within a transaction, enabling optimization
- `NOT NULL` filter on `embedding` is implicit — rows with `NULL` embedding are excluded by pgvector's `<=>` operator behavior

### 3.6 `memory_stats_by_type` Function — Full DDL

```sql
CREATE OR REPLACE FUNCTION memory_stats_by_type()
RETURNS TABLE (
  content_type TEXT,
  count        BIGINT
)
LANGUAGE SQL STABLE
AS $$
  SELECT content_type, COUNT(*)
  FROM memories
  GROUP BY content_type
  ORDER BY COUNT(*) DESC;
$$;
```

**Returns:** One row per distinct `content_type` value, ordered by count descending. No parameters.

### 3.7 `memory_stats_by_tag` Function — Full DDL

```sql
CREATE OR REPLACE FUNCTION memory_stats_by_tag()
RETURNS TABLE (
  tag   TEXT,
  count BIGINT
)
LANGUAGE SQL STABLE
AS $$
  SELECT UNNEST(tags) AS tag, COUNT(*)
  FROM memories
  GROUP BY tag
  ORDER BY COUNT(*) DESC
  LIMIT 20;
$$;
```

**Returns:** Top 20 tags across all memories, ordered by usage frequency. `UNNEST(tags)` expands each row's `TEXT[]` array into individual rows for grouping.

### 3.8 Row Level Security (RLS) Policy

```sql
-- Enable RLS on the table
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Policy: only service_role can access any data
CREATE POLICY "Service role full access"
  ON memories
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

**RLS mechanics:**
- RLS is enabled, meaning all access is denied by default to any role not covered by a policy
- The only policy allows `service_role` to perform any operation (`FOR ALL`)
- The application uses the service role key → RLS is actually bypassed (service role always bypasses RLS in Supabase)
- The RLS policy serves as a **defense-in-depth** measure: if the anon key is ever accidentally used or exposed, it has zero access to the `memories` table
- `USING` clause — row-level filter for SELECT/UPDATE/DELETE
- `WITH CHECK` clause — row-level filter for INSERT/UPDATE

---

## 4. Supabase Storage

### 4.1 Bucket Configuration

- **Bucket name:** `brain-files`
- **Access:** Private (not public). No public URL access. All file access requires a signed URL or service role key.
- **Location:** Supabase project's object storage (S3-compatible)
- **Status:** PLANNED — bucket creation is a manual step, not in the migration SQL

**Create the bucket (Supabase Dashboard or SQL):**
```sql
-- Via Supabase storage API (run in application code or dashboard)
INSERT INTO storage.buckets (id, name, public)
VALUES ('brain-files', 'brain-files', false);
```

### 4.2 File Naming Convention

```
uploads/{timestamp}_{sanitized_filename}
```

- `timestamp` = `Date.now()` in milliseconds (Unix milliseconds since epoch)
- `sanitized_filename` = original filename with all characters except `[a-zA-Z0-9._-]` replaced by `_`
- Example: `uploads/1711234567890_my_document.pdf`
- Example: `uploads/1711234567890_photo_with_spaces.jpg`

**Rationale:**
- Timestamp prefix ensures uniqueness (no overwrites of existing files)
- Sanitization prevents path traversal and special character issues in object storage keys
- `upsert: false` in the upload call means duplicate paths will error (impossible with timestamps)

### 4.3 Access Pattern

```
Write: service_role → supabase.storage.from("brain-files").upload(path, data)
Read:  service_role → supabase.storage.from("brain-files").createSignedUrl(path, 3600)
Delete: service_role → supabase.storage.from("brain-files").remove([path])
```

All storage operations use the service role client — no public access is ever granted. Signed URLs expire after **3600 seconds (1 hour)**. After expiry, the MCP client must call `get_file_url` again to get a fresh signed URL.

### 4.4 Storage Policy (PLANNED)

```sql
-- Allow service_role full access to brain-files bucket
CREATE POLICY "Service role storage access"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'brain-files' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'brain-files' AND auth.role() = 'service_role');
```

### 4.5 File Size Considerations

- Gemini Embedding 2 API accepts files via `inlineData` (base64 in request body)
- Maximum Vercel serverless function payload: **4.5 MB** for request body
- Base64 encoding adds ~33% overhead: 4.5 MB request → ~3.3 MB raw file maximum
- PDF support: up to 6 pages per Gemini embedding call
- Video support: up to 120 seconds per call
- Large files will cause Vercel timeout (10s hobby, 60s pro) before the API call completes

---

## 5. Authentication & Security

### 5.1 Bearer Token Authentication

**Flow:**
```
MCP Client → HTTP Request
            Header: Authorization: Bearer <token>
            ↓
withMcpAuth middleware
            ↓
verifyToken(request, bearerToken)
            ↓
  ┌─────────────────────────────────┐
  │  bearerToken present?           │
  │  DIGITAL_BRAIN_API_KEYS set?    │
  │  bearerToken in allowed list?   │
  └─────────────────────────────────┘
  ↓ YES (all three)         ↓ NO (any)
AuthInfo returned       undefined returned
  ↓                          ↓
Handler proceeds         withMcpAuth returns 401
```

### 5.2 Multi-Key Support

```
DIGITAL_BRAIN_API_KEYS=key1,key2,key3
```

Parsing logic:
```typescript
configuredKeys.split(",").map(k => k.trim()).filter(Boolean)
```

- Spaces around commas are stripped
- Empty segments (e.g., `key1,,key3`) are filtered out
- Comparison is case-sensitive exact string match
- No rate limiting per-key — all keys have identical permissions (`["read", "write"]`)

### 5.3 Fail-Closed Behavior

If `DIGITAL_BRAIN_API_KEYS` is:
- Unset (`undefined`) → `configuredKeys` is falsy → `verifyToken` returns `undefined` → ALL requests rejected
- Empty string (`""`) → `configuredKeys.trim() === ""` → same rejection
- Only whitespace → same rejection

This means: **misconfiguration rejects all traffic** rather than allowing all traffic. This is fail-closed (safe default).

### 5.4 Security Layers

| Layer | Mechanism | Protects Against |
|---|---|---|
| **L1: Bearer token auth** | `withMcpAuth` with `required: true` | Unauthorized MCP tool calls |
| **L2: Service role key** | Only in Vercel server-side env vars | Key exposure to clients |
| **L3: Supabase RLS** | Policy: `auth.role() = 'service_role'` | Anon key accidentally used |
| **L4: Private storage bucket** | `public: false` on bucket | Direct file URL access |
| **L5: Signed URLs** | 1-hour expiry on file access | Persistent link sharing |

### 5.5 What Is NOT Protected

- **No timing-safe comparison:** Token comparison uses `allowedKeys.includes(bearerToken)` which is NOT constant-time. This is vulnerable to timing attacks. For a personal tool, this is acceptable risk.
- **No rate limiting:** No limit on request frequency per token.
- **No token rotation mechanism:** Token rotation requires updating `DIGITAL_BRAIN_API_KEYS` and redeploying (Vercel env var update triggers redeployment).
- **No audit log:** No logging of which token was used for which operation.
- **Vercel firewall note:** The README notes that a Vercel firewall bypass rule should be added for `/api/mcp` path if using Vercel's WAF, otherwise the WAF may block MCP requests.

### 5.6 Generating API Keys

```bash
openssl rand -hex 32
# Output: 64-character hex string = 256-bit key
```

---

## 6. Environment Variables

All environment variables are runtime (not build-time). They must be set in Vercel project settings for production. For local development, they go in `.env.local` (gitignored).

| Variable | Required | Description | How to Obtain |
|---|---|---|---|
| `DIGITAL_BRAIN_API_KEYS` | ✅ | Comma-separated Bearer tokens for MCP client auth. | `openssl rand -hex 32` for each key |
| `GEMINI_API_KEY` | ✅ | Google AI Gemini API key for embedding generation. | [Google AI Studio](https://aistudio.google.com/apikey) |
| `SUPABASE_URL` | ✅ | Supabase project URL (format: `https://<project-ref>.supabase.co`) | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role JWT. Bypasses RLS. **Never expose to clients.** | Supabase Dashboard → Settings → API → `service_role` secret |
| `REDIS_URL` | ✅ | Upstash Redis connection URL. Required for SSE session state. | Vercel Dashboard → Storage → Create KV Database (auto-sets this) |

**Validation at startup:** `embeddings.ts` and `supabase.ts` both throw `Error` at module initialization if their required variables are missing. This causes the Vercel function to fail immediately with a 500 error rather than failing silently on first use.

**`REDIS_URL` format:**
```
redis://:password@hostname:port
# or
rediss://:password@hostname:port  (TLS)
```

Vercel KV (Upstash) automatically sets this when you link a KV store to your project.

**`.env.local` setup (local development):**
```bash
cp .env.example .env.local
# Then edit .env.local with real values
```

`.env.local` is gitignored by Next.js by default.

---

## 7. Deployment

### 7.1 Vercel Deployment Architecture

```
GitHub Repo
     │
     │ Push to main branch
     ▼
Vercel Build Pipeline
  ├── npm install
  ├── next build (TypeScript compilation, route analysis)
  └── Deploy as Serverless Functions
           │
           ├── /api/mcp/[transport] → Node.js Serverless Function
           ├── / (landing page) → Static Edge Function
           └── Static assets → CDN
```

**Function runtime:** Node.js (not Edge). The MCP route requires Node.js because:
- It uses `Buffer` (Node.js built-in, not available in Edge runtime)
- Supabase client uses Node.js-specific features
- `mcp-handler` is not Edge-compatible

### 7.2 Serverless Function Limits

| Plan | Max Duration | Max Payload | Max Memory |
|---|---|---|---|
| Hobby | 10 seconds | 4.5 MB | 1024 MB |
| Pro | 60 seconds | 4.5 MB | 3008 MB |
| Enterprise | 900 seconds | 4.5 MB | 3008 MB |

**Critical:** Text memory operations (store + search) typically complete in 1–3 seconds (Gemini API call + Supabase query). File operations (especially audio/video embedding) can take significantly longer and may timeout on Hobby plan.

### 7.3 Vercel KV (Upstash Redis) for SSE Sessions

SSE (Server-Sent Events) transport requires session persistence across serverless function invocations. Without Redis, each function invocation is stateless and SSE sessions would be lost.

`mcp-handler` stores session state in Redis using the `redisUrl` configuration. Session entries include:
- Active SSE connection metadata
- Message queues for resumable streams
- Session expiry (managed by mcp-handler)

**Required setup:**
1. Vercel Dashboard → Storage → Create → KV Database
2. Link the KV store to your project
3. Vercel automatically sets `REDIS_URL` (and `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`) as environment variables

### 7.4 Vercel Firewall Configuration

Vercel's security WAF may block MCP protocol traffic. Add a bypass rule:
- **Condition:** Request path contains `/api/mcp`
- **Action:** Bypass WAF

Without this, Vercel may return 403 on MCP requests.

### 7.5 Step-by-Step Deployment

```bash
# 1. Clone and install
git clone https://github.com/dswillden/digital-brain-mcp.git
cd digital-brain-mcp
npm install

# 2. Set up Supabase DB (one-time)
# → Open Supabase Dashboard → SQL Editor
# → Run contents of supabase/migrations/001_create_memories.sql

# 3. Create brain-files storage bucket (one-time, PLANNED feature)
# → Supabase Dashboard → Storage → New Bucket → "brain-files" (private)

# 4. Generate API key
openssl rand -hex 32

# 5. Local development
cp .env.example .env.local
# Edit .env.local with actual values
npm run dev
# Test at http://localhost:3000/api/mcp/sse

# 6. Deploy to Vercel
# → Push to GitHub
# → Import project at vercel.com
# → Set all environment variables in Vercel Dashboard
# → Create KV store and link to project
# → Add firewall bypass for /api/mcp
# → Deploy
```

### 7.6 Production MCP Endpoint

```
https://<your-vercel-domain>/api/mcp/sse    ← SSE transport
https://<your-vercel-domain>/api/mcp/mcp    ← Streamable HTTP transport
```

---

## 8. MCP Protocol Details

### 8.1 Protocol Overview

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open standard for AI assistant tool integration. Version used: compatible with spec 2025-03-26 (Streamable HTTP transport).

**Core concepts:**
- **Tools** — callable functions that AI assistants can invoke (analogous to REST API endpoints)
- **Resources** — readable data sources (not used in this project)
- **Prompts** — reusable prompt templates (not used in this project)
- **Transport** — the communication channel between client and server

### 8.2 Transport Layers

#### SSE Transport (legacy, widely supported)

```
Client → GET /api/mcp/sse
         Accept: text/event-stream
         Authorization: Bearer <token>
Server ← HTTP 200 (keeps connection open)
         Content-Type: text/event-stream
         
[stream of SSE events]

Client → POST /api/mcp/sse (for sending messages)
         OR
Client → POST /api/mcp/mcp (Streamable HTTP)
```

The SSE transport establishes a persistent connection where the server can push events to the client. The MCP client (or `mcp-remote` proxy) sends requests as POST and receives responses as SSE events.

#### Streamable HTTP Transport (new, 2025-03-26 spec)

```
Client → POST /api/mcp/mcp
         Content-Type: application/json
         Accept: application/json, text/event-stream
         Authorization: Bearer <token>
         Body: { "jsonrpc": "2.0", "id": 1, "method": "tools/call", ... }

Server ← HTTP 200
         Content-Type: application/json  (for simple responses)
              OR
         Content-Type: text/event-stream  (for streaming responses)
```

### 8.3 JSON-RPC Message Format

MCP uses JSON-RPC 2.0. Tool calls look like:

```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "tools/call",
  "params": {
    "name": "search_memory",
    "arguments": {
      "query": "authentication patterns",
      "limit": 5,
      "threshold": 0.5
    }
  }
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{ \"success\": true, \"results\": [...] }"
      }
    ]
  }
}
```

### 8.4 Tool Response Format

All tools return content in this structure:
```typescript
{
  content: [
    {
      type: "text",            // always "text" in this implementation
      text: string             // JSON-stringified response object
    }
  ],
  isError?: boolean            // present and true only on errors
}
```

The `text` field contains a JSON string (pretty-printed with 2-space indentation for non-error cases). The AI client is expected to parse this JSON to extract structured data. Error cases set `isError: true` and include an `error` field in the JSON.

### 8.5 mcp-handler Library

`mcp-handler` (npm package) is a Vercel adapter for the MCP TypeScript SDK that:
- Handles the dynamic `[transport]` route parameter to dispatch SSE vs. Streamable HTTP
- Manages Redis-backed SSE session state for resumable streams
- Provides `createMcpHandler()` and `withMcpAuth()` functions
- Wraps `@modelcontextprotocol/sdk`'s `Server` class

**`createMcpHandler(setupFn, serverOptions, handlerOptions)`:**
- Returns a Next.js-compatible request handler function (can be used as `GET`, `POST`, `DELETE` export)
- Calls `setupFn` with an MCP `Server` instance to register tools
- Handles protocol negotiation, capability exchange, and message routing

**`withMcpAuth(handler, verifyTokenFn, options)`:**
- Wraps any mcp-handler with authentication middleware
- Extracts Bearer token from `Authorization` header
- Calls `verifyTokenFn` to validate; if it returns `undefined`, responds with 401
- `options.required: true` makes authentication mandatory

### 8.6 Client Connection Configuration

**Claude Desktop/Code (via mcp-remote):**
```json
{
  "mcpServers": {
    "digital-brain": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://your-deployment.vercel.app/api/mcp/sse", "--header", "Authorization:Bearer YOUR_KEY"]
    }
  }
}
```

**Cursor (native SSE support):**
- Type: SSE
- URL: `https://your-deployment.vercel.app/api/mcp/sse`
- Headers: `Authorization: Bearer YOUR_KEY`

**OpenCode / other clients:** Use SSE endpoint with Bearer auth header.

---

## 9. Embedding Model Details

### 9.1 Model Identification

| Property | Value |
|---|---|
| **Model name** | `gemini-embedding-2-preview` |
| **Provider** | Google (via Google AI / Vertex AI) |
| **SDK** | `@google/genai` (`GoogleGenAI` class, `ai.models.embedContent()`) |
| **API endpoint** | `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent` |
| **Native output dimensions** | 3072 |
| **Used output dimensions** | 768 (via MRL truncation) |
| **Dimension truncation mechanism** | Matryoshka Representation Learning (MRL) |

### 9.2 MRL (Matryoshka Representation Learning)

MRL trains the model to produce embeddings where the first `n` dimensions of any prefix are semantically coherent and meaningful. This means you can truncate the full 3072-dim vector to 768 dims and still get useful embeddings.

The `outputDimensionality: 768` parameter in the API call instructs Gemini to:
1. Generate the full 3072-dim internal representation
2. Return only the first 768 dimensions
3. The returned 768 dims are already optimized for use as a complete embedding

**Quality trade-off at 768 dims:**
- Storage reduction: 75% (3072 → 768 floats × 4 bytes = 3072 bytes → 768 bytes per vector saved)
- Quality degradation: typically <10% recall loss on standard retrieval benchmarks (MTEB)
- Recommended by Google for "highest quality" alongside 1536 and 3072

### 9.3 Multimodal Capabilities

All modalities map to the same 768-dimensional vector space. This means a text query can semantically match an image, audio clip, or PDF — all through cosine similarity.

| Modality | Supported MIME Types | Notes |
|---|---|---|
| **Text** | N/A (inline text part) | Unlimited length (practical limit: Gemini context window) |
| **Image** | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | Via `inlineData` part |
| **PDF** | `application/pdf` | Up to 6 pages per embedding call |
| **Audio** | `audio/mp3`, `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/aac`, `audio/flac` | Up to unspecified duration |
| **Video** | `video/mp4`, `video/quicktime`, `video/webm` | Up to 120 seconds |

### 9.4 API Call Structure

**Text-only embedding:**
```typescript
{
  model: "gemini-embedding-2-preview",
  contents: [
    { parts: [{ text: "your text here" }] }
  ],
  config: { outputDimensionality: 768 }
}
```

**File-only embedding:**
```typescript
{
  model: "gemini-embedding-2-preview",
  contents: [
    { parts: [{ inlineData: { data: "<base64>", mimeType: "image/jpeg" } }] }
  ],
  config: { outputDimensionality: 768 }
}
```

**Interleaved text+file embedding:**
```typescript
{
  model: "gemini-embedding-2-preview",
  contents: [
    {
      parts: [
        { text: "description of the image" },
        { inlineData: { data: "<base64>", mimeType: "image/jpeg" } }
      ]
    }
  ],
  config: { outputDimensionality: 768 }
}
```

### 9.5 Vector Storage and Similarity

- **Storage format:** `VECTOR(768)` column in PostgreSQL via pgvector
- **Vector type:** 32-bit floating point (4 bytes per dimension = 3072 bytes per vector)
- **Pre-storage normalization:** L2 normalization applied in `normalizeVector()` before storing
- **Distance metric:** Cosine distance via `<=>` operator
- **Similarity formula:** `similarity = 1 - cosine_distance(a, b)`
- **Index type:** HNSW with `vector_cosine_ops` operator class

**Why L2 normalize before storage:**
- Cosine similarity = dot product ÷ (|a| × |b|)
- For unit vectors: |a| = |b| = 1, so cosine similarity = dot product
- Pre-normalizing makes cosine similarity equivalent to dot product, which pgvector computes for both `<=>` (cosine) and inner product operators
- Consistent semantics regardless of any future index changes

---

## 10. Data Flow Diagrams

### 10.1 Text Memory Storage Flow

```
AI Client                  Vercel Function              Gemini API            Supabase
    │                           │                           │                     │
    │  MCP: tools/call          │                           │                     │
    │  store_memory({           │                           │                     │
    │    content: "...",        │                           │                     │
    │    tags: ["work"],        │                           │                     │
    │    content_type: "note"   │                           │                     │
    │  })                       │                           │                     │
    │──────────────────────────►│                           │                     │
    │                           │  validateBearerToken()    │                     │
    │                           │  (check DIGITAL_BRAIN_API_KEYS)                │
    │                           │                           │                     │
    │                           │  getTextEmbedding(content)│                     │
    │                           │──────────────────────────►│                     │
    │                           │  POST /embedContent       │                     │
    │                           │  model: gemini-embedding-2-preview              │
    │                           │  outputDimensionality: 768│                     │
    │                           │◄──────────────────────────│                     │
    │                           │  embeddings[0].values     │                     │
    │                           │  (3072→768 via MRL)       │                     │
    │                           │                           │                     │
    │                           │  normalizeVector(values)  │                     │
    │                           │  (L2 normalization)       │                     │
    │                           │                           │                     │
    │                           │  insertMemory(params)     │                     │
    │                           │─────────────────────────────────────────────►  │
    │                           │  INSERT INTO memories     │                     │
    │                           │  (content, embedding,     │                     │
    │                           │   content_type, tags, ...) │                    │
    │                           │◄─────────────────────────────────────────────  │
    │                           │  { id: 42, created_at: ...}│                    │
    │                           │                           │                     │
    │  MCP response             │                           │                     │
    │  { success: true,         │                           │                     │
    │    memory: { id: 42 } }   │                           │                     │
    │◄──────────────────────────│                           │                     │
```

### 10.2 File Storage Flow (base64 path — PLANNED)

```
AI Client                  Vercel Function              Gemini API     Supabase DB   Supabase Storage
    │                           │                           │               │               │
    │  MCP: tools/call          │                           │               │               │
    │  store_file({             │                           │               │               │
    │    content: "description",│                           │               │               │
    │    file_data: "<base64>", │                           │               │               │
    │    mime_type: "image/jpeg"│                           │               │               │
    │    file_name: "photo.jpg" │                           │               │               │
    │  })                       │                           │               │               │
    │──────────────────────────►│                           │               │               │
    │                           │  Decode base64 → Buffer   │               │               │
    │                           │                           │               │               │
    │                           │  uploadFile(              │               │               │
    │                           │    "photo.jpg", buffer,   │               │               │
    │                           │    "image/jpeg"           │               │               │
    │                           │  )                        │               │               │
    │                           │─────────────────────────────────────────────────────────►│
    │                           │  storage.upload(          │               │               │
    │                           │    "uploads/1711_photo.jpg│               │               │
    │                           │  )                        │               │               │
    │                           │◄─────────────────────────────────────────────────────────│
    │                           │  storagePath              │               │               │
    │                           │                           │               │               │
    │                           │  getInterleavedEmbedding( │               │               │
    │                           │    "description", base64, │               │               │
    │                           │    "image/jpeg"           │               │               │
    │                           │  )                        │               │               │
    │                           │──────────────────────────►│               │               │
    │                           │  POST /embedContent       │               │               │
    │                           │  parts: [text, inlineData]│               │               │
    │                           │◄──────────────────────────│               │               │
    │                           │  768-dim vector           │               │               │
    │                           │                           │               │               │
    │                           │  insertMemory({           │               │               │
    │                           │    content: "description",│               │               │
    │                           │    embedding: [...],      │               │               │
    │                           │    file_mime_type,        │               │               │
    │                           │    file_name,             │               │               │
    │                           │    file_storage_path      │               │               │
    │                           │  })                       │               │               │
    │                           │──────────────────────────────────────────►│               │
    │                           │◄──────────────────────────────────────────│               │
    │                           │  { id: 43 }               │               │               │
    │                           │                           │               │               │
    │  { success: true,         │                           │               │               │
    │    memory: { id: 43 } }   │                           │               │               │
    │◄──────────────────────────│                           │               │               │
```

### 10.3 URL File Storage Flow (PLANNED)

```
AI Client          Vercel Function         External URL    Gemini API   Supabase
    │                    │                      │               │            │
    │  store_file_from_url                      │               │            │
    │  ({ url: "https://example.com/doc.pdf" }) │               │            │
    │───────────────────►│                      │               │            │
    │                    │  fetch(url)           │               │            │
    │                    │──────────────────────►│               │            │
    │                    │◄──────────────────────│               │            │
    │                    │  response body (binary)               │            │
    │                    │  Content-Type: application/pdf        │            │
    │                    │                                       │            │
    │                    │  [same as file storage flow from here]             │
    │                    │  uploadFile() → getMultimodalEmbedding() →         │
    │                    │  insertMemory()                       │            │
    │◄───────────────────│                       │               │            │
```

### 10.4 Search Flow

```
AI Client                  Vercel Function              Gemini API          Supabase
    │                           │                           │                    │
    │  MCP: tools/call          │                           │                    │
    │  search_memory({          │                           │                    │
    │    query: "auth patterns",│                           │                    │
    │    limit: 5,              │                           │                    │
    │    threshold: 0.5,        │                           │                    │
    │    filter_tags: ["work"]  │                           │                    │
    │  })                       │                           │                    │
    │──────────────────────────►│                           │                    │
    │                           │  getTextEmbedding(query)  │                    │
    │                           │──────────────────────────►│                    │
    │                           │◄──────────────────────────│                    │
    │                           │  queryVector [768 floats] │                    │
    │                           │                           │                    │
    │                           │  searchMemories({         │                    │
    │                           │    queryEmbedding,        │                    │
    │                           │    matchCount: 5,         │                    │
    │                           │    matchThreshold: 0.5,   │                    │
    │                           │    filterTags: ["work"]   │                    │
    │                           │  })                       │                    │
    │                           │─────────────────────────────────────────────► │
    │                           │  supabase.rpc(            │                    │
    │                           │    "match_memories",      │                    │
    │                           │    { query_embedding,     │                    │
    │                           │      match_threshold: 0.5 │                    │
    │                           │      match_count: 5,      │                    │
    │                           │      filter_tags: ["work"]│                    │
    │                           │    }                      │                    │
    │                           │  )                        │                    │
    │                           │                           │                    │
    │                           │  PostgreSQL executes:     │                    │
    │                           │  SELECT ... FROM memories │                    │
    │                           │  WHERE embedding <=> $1   │                    │
    │                           │    < 1 - 0.5              │                    │
    │                           │    AND tags && ["work"]   │                    │
    │                           │  ORDER BY embedding <=> $1│                    │
    │                           │  LIMIT 5                  │                    │
    │                           │  (HNSW index used)        │                    │
    │                           │◄─────────────────────────────────────────────  │
    │                           │  [MemoryMatch[], sorted   │                    │
    │                           │   by similarity desc]     │                    │
    │                           │                           │                    │
    │  { success: true,         │                           │                    │
    │    results: [             │                           │                    │
    │      { id, similarity,    │                           │                    │
    │        content, tags... } │                           │                    │
    │    ] }                    │                           │                    │
    │◄──────────────────────────│                           │                    │
```

### 10.5 File Retrieval Flow (PLANNED)

```
AI Client              Vercel Function                Supabase
    │                        │                             │
    │  get_file_url({ id:43})│                             │
    │───────────────────────►│                             │
    │                        │  SELECT file_storage_path   │
    │                        │  FROM memories WHERE id=43  │
    │                        │────────────────────────────►│
    │                        │◄────────────────────────────│
    │                        │  "uploads/1711_photo.jpg"   │
    │                        │                             │
    │                        │  storage.createSignedUrl(   │
    │                        │    "brain-files",           │
    │                        │    "uploads/1711_photo.jpg",│
    │                        │    3600                     │
    │                        │  )                          │
    │                        │────────────────────────────►│
    │                        │◄────────────────────────────│
    │                        │  signedUrl (expires 1hr)    │
    │                        │                             │
    │  { url: "https://..." }│                             │
    │◄───────────────────────│                             │
    │                        │                             │
    │  [Client uses URL to   │                             │
    │   download file directly                             │
    │   from Supabase CDN]   │                             │
    │──────────────────────────────────────────────────►  │
    │◄─────────────────────────────────────────────────────│
    │  file bytes            │                             │
```

---

## 11. Extension Points

### 11.1 Adding New Content Types

Content types are enforced only at the application layer (Zod enum in `store_memory`). The database column `content_type TEXT` accepts any string.

**Steps to add a new content type (e.g., `"meeting-notes"`):**

1. **Update Zod enum** in `route.ts`:
```typescript
content_type: z.enum([
  "text", "note", "code", "conversation",
  "research", "decision", "reference",
  "meeting-notes"   // ← add here
])
```

2. **Update landing page** (`page.tsx`) to document the new type.

3. **No database migration needed** — `content_type TEXT` accepts the new value.

4. **Update README** with the new type in the tools reference table.

### 11.2 Adding New File Types

Gemini Embedding 2 supports the MIME types listed in § 9.3. If Google adds new supported types:

1. **Update `SUPPORTED_MIME_TYPES`** in `embeddings.ts`:
```typescript
export const SUPPORTED_MIME_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],  // add here
  // ...
};
```

2. **Update Zod validation** in `store_file` tool (when implemented) to allow the new MIME type.

3. **No database changes** — `file_mime_type TEXT` accepts any string.

### 11.3 Adding Multi-User Support

The current schema has no user isolation. To add multi-user:

**Step 1: Database migration**
```sql
ALTER TABLE memories ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';
CREATE INDEX memories_user_id_idx ON memories (user_id);

-- Update match_memories to filter by user_id:
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.4,
  match_count INT DEFAULT 10,
  filter_tags TEXT[] DEFAULT NULL,
  p_user_id TEXT DEFAULT 'default'   -- new parameter
)
RETURNS TABLE (...)
AS $$
  SELECT ... FROM memories
  WHERE embedding <=> query_embedding < 1 - match_threshold
    AND (filter_tags IS NULL OR tags && filter_tags)
    AND user_id = p_user_id   -- new filter
  ...
$$;
```

**Step 2: Auth changes**
Replace the current Bearer-token auth with JWT auth (e.g., Supabase Auth JWTs). Extract `user_id` from the verified JWT in `verifyToken`.

```typescript
const verifyToken = async (req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  // Verify JWT, extract sub (user ID)
  const payload = await verifyJWT(bearerToken);
  return {
    token: bearerToken,
    clientId: payload.sub,          // user ID
    scopes: ["read", "write"],
    extra: { userId: payload.sub }, // pass to tools
  };
};
```

**Step 3: Pass user_id through all operations**
Each tool handler receives `AuthInfo` (the second argument in `server.tool` callbacks). Extract `authInfo.extra.userId` and pass to all `insertMemory`, `searchMemories`, `listMemories`, etc. calls.

**Step 4: Update RLS**
Replace service-role-only RLS with user-scoped RLS:
```sql
CREATE POLICY "Users access own memories"
  ON memories FOR ALL
  USING (user_id = auth.uid()::TEXT);
```

### 11.4 Adding Custom RPC Functions

Example: Add a `search_memories_by_date_range` function:

```sql
CREATE OR REPLACE FUNCTION search_memories_by_date_range(
  query_embedding VECTOR(768),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  match_threshold FLOAT DEFAULT 0.4,
  match_count INT DEFAULT 10
)
RETURNS TABLE (id BIGINT, content TEXT, similarity FLOAT, created_at TIMESTAMPTZ)
LANGUAGE SQL STABLE
AS $$
  SELECT id, content, 1 - (embedding <=> query_embedding) AS similarity, created_at
  FROM memories
  WHERE created_at BETWEEN start_date AND end_date
    AND embedding <=> query_embedding < 1 - match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

Call it from application code:
```typescript
const { data } = await supabase.rpc("search_memories_by_date_range", {
  query_embedding: embedding,
  start_date: "2026-01-01T00:00:00Z",
  end_date: "2026-03-31T23:59:59Z",
});
```

Expose via a new MCP tool in `route.ts`:
```typescript
server.tool("search_memory_by_date", "...", {
  query: z.string(),
  start_date: z.string().describe("ISO 8601 date"),
  end_date: z.string().describe("ISO 8601 date"),
}, async ({ query, start_date, end_date }) => { ... });
```

### 11.5 Adding Webhook Integrations

To trigger actions when memories are stored (e.g., notify a Slack channel):

**Option A: Supabase Database Webhooks**
```sql
-- Via Supabase Dashboard → Database → Webhooks
-- Trigger on INSERT to memories table
-- Sends POST to your webhook URL with row data
```

**Option B: Application-level webhooks**
```typescript
// In insertMemory() or the store_memory handler:
async function notifyWebhook(memory: Memory) {
  const webhookUrl = process.env.MEMORY_WEBHOOK_URL;
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "memory.created", memory }),
  });
}
```

**Option C: Supabase Realtime**
Subscribe to the `memories` table via Supabase Realtime channels from any client.

### 11.6 Adding Full-Text Search Fallback

Current search is vector-only. To add keyword/full-text fallback for low-similarity queries:

```sql
-- Add tsvector column
ALTER TABLE memories ADD COLUMN search_vector TSVECTOR;
UPDATE memories SET search_vector = to_tsvector('english', content);
CREATE INDEX memories_search_idx ON memories USING GIN (search_vector);

-- Add trigger to maintain tsvector
CREATE TRIGGER memories_tsvector_update
  BEFORE INSERT OR UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION tsvector_update_trigger(search_vector, 'pg_catalog.english', content);
```

Application-level hybrid search:
```typescript
// If vector search returns < threshold results, supplement with full-text:
const vectorResults = await searchMemories({ queryEmbedding, matchThreshold: 0.5 });
if (vectorResults.length < 3) {
  const { data: ftsResults } = await supabase
    .from("memories")
    .select("*")
    .textSearch("search_vector", query, { type: "websearch" })
    .limit(10);
  // merge, deduplicate, re-rank
}
```

---

## 12. Known Limitations

### 12.1 Vercel Serverless Function Timeouts

| Plan | Max Duration | Impact |
|---|---|---|
| Hobby | **10 seconds** | Large file embeddings (video, audio) will likely timeout |
| Pro | **60 seconds** | Video embedding (up to 120s clips) may still timeout |
| Enterprise | **900 seconds** | Sufficient for all operations |

Gemini embedding API calls for binary files (especially video) can take 10–30+ seconds depending on file size and content complexity. Text embeddings typically complete in <2 seconds.

**Mitigation strategies:**
- Upgrade to Vercel Pro for file operations
- Set `maxDuration` in route configuration: `export const maxDuration = 60;`
- Implement client-side chunking for large files before sending to `store_file`

### 12.2 Large File Upload Payload Limits

Vercel serverless functions have a **4.5 MB request body limit**. Base64 encoding adds 33% overhead:
- Maximum uploadable file: ~3.3 MB (before base64 → after base64 ≈ 4.5 MB)
- A 1-minute video at typical mobile quality can easily exceed 50 MB

**Mitigation strategies (PLANNED):**
- Direct upload to Supabase Storage from client, then pass the storage path to `store_file_from_url`
- Implement chunked upload protocol with reassembly in Supabase Storage

### 12.3 No Streaming for File Uploads

The current architecture has no progress feedback during large uploads. The Vercel function either completes or times out — there's no streaming progress to the MCP client.

### 12.4 Single-User Design

There is no `user_id` column in the `memories` table. All memories are globally accessible to anyone with a valid API key. Multi-user support requires schema migration (see § 11.3).

### 12.5 Vector-Only Search

No full-text search fallback exists. If a query has very low cosine similarity to all stored memories (e.g., searching for something stored with very different wording), it will return zero results rather than falling back to keyword search.

**Impact:** Semantically dissimilar but relevantly keyword-matching content won't be found.

### 12.6 No Batch Operations

Tools process one memory at a time. Importing a large existing knowledge base (Obsidian vault, Notion export) requires calling `store_memory` once per note, which is slow and risks hitting rate limits.

**Gemini API rate limits:** The free tier has generous but real limits. Rapid bulk imports may hit per-minute or per-day embedding quotas.

### 12.7 Timing-Unsafe Token Comparison

```typescript
if (!allowedKeys.includes(bearerToken)) { ... }
```

`Array.includes()` is not constant-time. In theory, this enables timing attacks to enumerate valid token prefixes. For a personal-use tool deployed behind HTTPS, this is an acceptable risk. Production multi-user systems should use constant-time comparison:
```typescript
import { timingSafeEqual } from "crypto";
const isValid = allowedKeys.some(key =>
  key.length === bearerToken.length &&
  timingSafeEqual(Buffer.from(key), Buffer.from(bearerToken))
);
```

### 12.8 `updated_at` Not Managed by DB Trigger

`updated_at` is set via `new Date().toISOString()` in application code in `updateMemory()`. If Supabase is accessed directly (e.g., via SQL or another client), `updated_at` won't auto-update. A more robust approach would be a PostgreSQL trigger:
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 12.9 No Embedding Versioning

When the Gemini embedding model is updated, all stored embeddings become stale (generated by an older model version). There is no `embedding_model_version` column to track which model generated each vector. Re-embedding the entire database after a model update is a manual batch operation with no built-in support.

### 12.10 HNSW Index Requires Full Rebuild on Dimension Change

If `EMBEDDING_DIMENSION` is changed (e.g., 768 → 1536):
1. The `vector(768)` column type must be altered
2. All existing embeddings must be re-generated and re-inserted
3. The HNSW index must be rebuilt
4. This is a full database rebuild — no incremental path

### 12.11 No Deduplication

Storing the same content twice creates two identical rows with different IDs and timestamps. There is no deduplication check on `content` or embedding proximity before insertion.

---

## Appendix A: Complete File Contents Reference

### A.1 embeddings.ts (Current Complete Source)

```typescript
import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY environment variable");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const EMBEDDING_DIMENSION = 768;
const MODEL_ID = "gemini-embedding-2-preview";

function normalizeVector(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const val of vector) {
    sumOfSquares += val * val;
  }
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return vector;
  return vector.map((val) => val / magnitude);
}

export async function getTextEmbedding(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: MODEL_ID,
    contents: [{ parts: [{ text }] }],
    config: { outputDimensionality: EMBEDDING_DIMENSION },
  });
  const values = response.embeddings?.[0]?.values;
  if (!values) throw new Error("No embeddings returned from Gemini API");
  return normalizeVector(values);
}

export async function getMultimodalEmbedding(
  data: Buffer | Uint8Array,
  mimeType: string
): Promise<number[]> {
  const base64Data =
    data instanceof Buffer ? data.toString("base64") : Buffer.from(data).toString("base64");
  const response = await ai.models.embedContent({
    model: MODEL_ID,
    contents: [{ parts: [{ inlineData: { data: base64Data, mimeType } }] }],
    config: { outputDimensionality: EMBEDDING_DIMENSION },
  });
  const values = response.embeddings?.[0]?.values;
  if (!values) throw new Error("No embeddings returned from Gemini API for multimodal content");
  return normalizeVector(values);
}
```

### A.2 supabase.ts (Current Complete Source)

See § 2.8 for the complete implementation. All functions are reproduced there.

### A.3 route.ts (Current Complete Source)

See § 2.9 for the complete implementation and tool-by-tool breakdown.

---

## Appendix B: Quick Reference — Tool Input/Output Summary

| Tool | Required Inputs | Optional Inputs | Returns |
|---|---|---|---|
| `store_memory` | `content: string` | `source`, `tags`, `content_type`, `metadata` | `{ success, memory: { id, content_type, tags, source, created_at } }` |
| `search_memory` | `query: string` | `limit` (1-50), `threshold` (0-1), `filter_tags` | `{ success, query, result_count, results: [...] }` |
| `list_memories` | none | `content_type`, `tags`, `limit` (1-100), `offset` | `{ success, count, memories: [...] }` |
| `update_memory` | `id: number` | `content`, `tags`, `source`, `metadata` | `{ success, memory: { id, content_type, tags, source, updated_at } }` |
| `delete_memory` | `id: number` | none | `{ success, message }` |
| `get_stats` | none | none | `{ success, total_memories, by_content_type, top_tags }` |

---

## Appendix C: Dependency Version Pinning Guide

When upgrading dependencies, these version constraints matter:

| Upgrade | Risk | Notes |
|---|---|---|
| `mcp-handler` | HIGH | API surface may change; `withMcpAuth` and `createMcpHandler` signatures not guaranteed stable |
| `@modelcontextprotocol/sdk` | HIGH | Protocol spec updates may break transport handling |
| `@google/genai` | MEDIUM | `embedContent` API and response shape may change; `response.embeddings[0].values` path needs verification |
| `@supabase/supabase-js` | LOW | Stable API; `.from().select()` pattern very stable |
| `next` | MEDIUM | App Router APIs; ensure `[transport]` dynamic routes still work |
| `zod` | LOW | Only uses basic `z.string()`, `z.number()`, `z.array()`, `z.record()`, `z.enum()` |

---

## Appendix D: Debugging Common Issues

### D.1 "No embeddings returned from Gemini API"

**Cause:** `GEMINI_API_KEY` invalid, expired, or quota exceeded.  
**Debug:** Check Vercel function logs; verify key in Google AI Studio console.

### D.2 "Supabase insert error: invalid input syntax for type vector"

**Cause:** Embedding array length mismatch. The DB expects `vector(768)` but received a different length.  
**Debug:** Log `embedding.length` before `insertMemory()`. Verify `EMBEDDING_DIMENSION = 768` matches the SQL schema `vector(768)`.

### D.3 MCP client gets 401 on every request

**Cause:** Bearer token not matching any key in `DIGITAL_BRAIN_API_KEYS`.  
**Debug:** 
1. Verify `DIGITAL_BRAIN_API_KEYS` is set in Vercel environment variables (not just `.env.local`)
2. Check for extra spaces or newlines in the key
3. Verify the client is sending `Authorization: Bearer <key>` (not `Bearer: <key>` or other format)

### D.4 SSE connection drops immediately

**Cause:** `REDIS_URL` not set or Upstash Redis not connected.  
**Debug:** Check Vercel Storage dashboard for KV store; verify it's linked to the project; confirm `REDIS_URL` appears in environment variables.

### D.5 `search_memory` returns empty results for known content

**Cause 1:** Threshold too high. Try `threshold: 0.2`.  
**Cause 2:** The stored content and query are semantically very different (topic drift).  
**Cause 3:** Embedding column is NULL for that row (check with `SELECT id, embedding IS NULL FROM memories`).

### D.6 Vercel deployment fails at build time

**Cause:** TypeScript compilation errors.  
**Common source:** `strict: true` is enabled; check for type errors with `npm run build` locally.

### D.7 Function timeout (504) on store/search

**Cause:** Gemini API latency spike or Hobby plan 10s timeout.  
**Debug:** Add timing logs around `getTextEmbedding()`. Consider upgrading to Vercel Pro plan.
