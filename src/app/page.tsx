export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 600, margin: "80px auto", padding: "0 20px" }}>
      <h1>🧠 Digital Brain MCP</h1>
      <p>
        This is a <strong>Model Context Protocol (MCP)</strong> server for your second brain.
      </p>
      <p>
        Connect any MCP-compatible client (Claude, Cursor, OpenCode, etc.) to the{" "}
        <code>/api/mcp/sse</code> endpoint with your API key.
      </p>
      <h2>Available Tools</h2>
      <ul>
        <li><strong>store_memory</strong> — Save notes, facts, ideas, code, and knowledge</li>
        <li><strong>search_memory</strong> — Semantic search across everything stored</li>
        <li><strong>list_memories</strong> — Browse and filter your memories</li>
        <li><strong>update_memory</strong> — Modify existing entries</li>
        <li><strong>delete_memory</strong> — Remove entries</li>
        <li><strong>get_stats</strong> — See brain statistics</li>
      </ul>
      <h2>Tech Stack</h2>
      <ul>
        <li>Embeddings: Google Gemini Embedding 2 (768 dimensions, multimodal)</li>
        <li>Vector DB: Supabase + pgvector</li>
        <li>Hosting: Vercel (Next.js + mcp-handler)</li>
        <li>Auth: Bearer token API keys</li>
      </ul>
    </main>
  );
}
