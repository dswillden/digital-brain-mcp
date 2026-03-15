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
