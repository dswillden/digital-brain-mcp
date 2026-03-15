import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// Gemini Embedding 2 client
// Model: gemini-embedding-2-preview
// Supports: text, images, video, audio, PDF — all in one unified vector space
// Output: 768 dimensions (truncated from 3072 via Matryoshka Representation Learning)
// ---------------------------------------------------------------------------

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY environment variable");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/** The embedding dimension we use across the project. */
export const EMBEDDING_DIMENSION = 768;

/** The model identifier. */
const MODEL_ID = "gemini-embedding-2-preview";

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
// Generate an embedding from raw bytes (image, audio, PDF, etc.)
// ---------------------------------------------------------------------------
export async function getMultimodalEmbedding(
  data: Buffer | Uint8Array,
  mimeType: string
): Promise<number[]> {
  const base64Data =
    data instanceof Buffer ? data.toString("base64") : Buffer.from(data).toString("base64");

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
}
