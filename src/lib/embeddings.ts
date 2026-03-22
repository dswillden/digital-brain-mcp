import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// Gemini Embedding 2 — Full Multimodal Embedding Client
//
// Model: gemini-embedding-2-preview
// Supports: text, images (PNG/JPEG), video (MP4/MOV up to 120s),
//           audio (MP3/WAV/etc), PDF (up to 6 pages)
// All modalities map to the SAME unified vector space.
// Output: 768 dimensions (truncated from 3072 via MRL)
// ---------------------------------------------------------------------------

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY environment variable");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/** The embedding dimension used across the project. */
export const EMBEDDING_DIMENSION = 768;

/** The model identifier. */
const MODEL_ID = "gemini-embedding-2-preview";

/** Supported MIME types for multimodal embedding. */
export const SUPPORTED_MIME_TYPES = {
  // Images (up to 6 per request)
  image: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  // PDF documents (up to 6 pages)
  pdf: ["application/pdf"],
  // Audio
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3", "audio/aac", "audio/flac"],
  // Video (up to 120 seconds, MP4/MOV)
  video: ["video/mp4", "video/quicktime", "video/webm"],
} as const;

/** All supported MIME types as a flat array. */
export const ALL_SUPPORTED_MIME_TYPES = [
  ...SUPPORTED_MIME_TYPES.image,
  ...SUPPORTED_MIME_TYPES.pdf,
  ...SUPPORTED_MIME_TYPES.audio,
  ...SUPPORTED_MIME_TYPES.video,
];

/** Determine the modality category from a MIME type. */
export function getModalityFromMime(mimeType: string): "image" | "pdf" | "audio" | "video" | "unknown" {
  const mime = mimeType.toLowerCase();
  if (SUPPORTED_MIME_TYPES.image.includes(mime as never)) return "image";
  if (SUPPORTED_MIME_TYPES.pdf.includes(mime as never)) return "pdf";
  if (SUPPORTED_MIME_TYPES.audio.includes(mime as never)) return "audio";
  if (SUPPORTED_MIME_TYPES.video.includes(mime as never)) return "video";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Normalize a vector to unit length (required for cosine similarity)
// ---------------------------------------------------------------------------
function normalizeVector(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const val of vector) {
    sumOfSquares += val * val;
  }
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return vector;
  return vector.map((val) => val / magnitude);
}

// ---------------------------------------------------------------------------
// Generate an embedding from text content
// ---------------------------------------------------------------------------
export async function getTextEmbedding(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: MODEL_ID,
    contents: [{ parts: [{ text }] }],
    config: {
      outputDimensionality: EMBEDDING_DIMENSION,
    },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values) {
    throw new Error("No embeddings returned from Gemini API");
  }

  return normalizeVector(values);
}

// ---------------------------------------------------------------------------
// Generate an embedding from raw bytes (image, audio, PDF, video)
// ---------------------------------------------------------------------------
export async function getMultimodalEmbedding(
  base64Data: string,
  mimeType: string
): Promise<number[]> {
  const modality = getModalityFromMime(mimeType);
  if (modality === "unknown") {
    throw new Error(
      `Unsupported MIME type: ${mimeType}. Supported: ${ALL_SUPPORTED_MIME_TYPES.join(", ")}`
    );
  }

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
    throw new Error(`No embeddings returned from Gemini API for ${modality} content`);
  }

  return normalizeVector(values);
}

// ---------------------------------------------------------------------------
// Generate an embedding from combined text + file (interleaved multimodal)
// This lets the model understand the relationship between the description
// and the file content — e.g. "Architecture diagram for the EBR system" + image
// ---------------------------------------------------------------------------
export async function getInterleavedEmbedding(
  text: string,
  base64Data: string,
  mimeType: string
): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: MODEL_ID,
    contents: [
      {
        parts: [
          { text },
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
    throw new Error("No embeddings returned from Gemini API for interleaved content");
  }

  return normalizeVector(values);
}
