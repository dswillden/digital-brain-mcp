import { NextRequest, NextResponse } from "next/server";
import {
  getMultimodalEmbedding,
  getInterleavedEmbedding,
  getModalityFromMime,
  ALL_SUPPORTED_MIME_TYPES,
} from "@/lib/embeddings";
import { insertMemory, uploadFile } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Direct File Upload Endpoint
// POST /api/upload
//
// Accepts multipart/form-data with a file field. No base64 encoding needed.
// Authenticates with the same Bearer token as the MCP endpoint.
//
// Usage:
//   curl -X POST https://digital-brain-mcp.vercel.app/api/upload \
//     -H "Authorization: Bearer YOUR_API_KEY" \
//     -F "file=@/path/to/diagram.png" \
//     -F "description=Architecture diagram for EBR" \
//     -F "tags=work,ebr" \
//     -F "source=manual-upload"
// ---------------------------------------------------------------------------

/** Verify the Bearer token against configured API keys. */
function verifyAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);
  const configuredKeys = process.env.DIGITAL_BRAIN_API_KEYS;
  if (!configuredKeys || configuredKeys.trim() === "") return false;

  const allowedKeys = configuredKeys
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  return allowedKeys.includes(token);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function POST(req: NextRequest) {
  // --- Auth ---
  if (!verifyAuth(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized. Provide a valid Bearer token." },
      { status: 401 }
    );
  }

  try {
    // --- Parse multipart form ---
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No file provided. Send a multipart form with a "file" field. Example: curl -F "file=@photo.png" ...',
        },
        { status: 400 }
      );
    }

    // --- Validate MIME type ---
    const mimeType = file.type || "application/octet-stream";
    const modality = getModalityFromMime(mimeType);
    if (modality === "unknown") {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type: ${mimeType}. Supported: ${ALL_SUPPORTED_MIME_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // --- Read optional fields ---
    const description = formData.get("description")?.toString() || undefined;
    const source = formData.get("source")?.toString() || "file-upload";
    const tagsRaw = formData.get("tags")?.toString() || "";
    const tags = tagsRaw
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    const metadataRaw = formData.get("metadata")?.toString();
    let metadata: Record<string, unknown> = {};
    if (metadataRaw) {
      try {
        metadata = JSON.parse(metadataRaw);
      } catch {
        // Ignore invalid JSON metadata
      }
    }

    // --- Read file bytes ---
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const base64Data = fileBuffer.toString("base64");
    const fileName = file.name || `upload_${Date.now()}`;

    // --- Generate embedding ---
    let embedding: number[];
    if (description) {
      embedding = await getInterleavedEmbedding(
        description,
        base64Data,
        mimeType
      );
    } else {
      embedding = await getMultimodalEmbedding(base64Data, mimeType);
    }

    // --- Upload file to Supabase Storage ---
    const storagePath = await uploadFile(fileName, fileBuffer, mimeType);

    // --- Build content text ---
    const contentText =
      description ??
      `[${modality.toUpperCase()}] ${fileName} (${mimeType}, ${formatBytes(fileBuffer.length)})`;

    // --- Store memory record ---
    const memory = await insertMemory({
      content: contentText,
      embedding,
      source,
      tags,
      content_type: modality,
      metadata: {
        ...metadata,
        modality,
        original_filename: fileName,
        upload_method: "direct-upload",
      },
      file_mime_type: mimeType,
      file_name: fileName,
      file_size_bytes: fileBuffer.length,
      file_storage_path: storagePath,
    });

    return NextResponse.json(
      {
        success: true,
        message: `${modality.charAt(0).toUpperCase() + modality.slice(1)} uploaded and embedded successfully.`,
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
      { status: 201 }
    );
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// --- CORS preflight for browser-based uploads ---
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
