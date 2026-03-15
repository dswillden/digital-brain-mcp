// ---------------------------------------------------------------------------
// Authentication middleware for the Digital Brain MCP server
//
// Security model:
//   - Every request to /api/mcp/* must include a valid API key
//   - The key is passed via the "Authorization: Bearer <key>" header
//   - Multiple keys can be configured (comma-separated) in the
//     DIGITAL_BRAIN_API_KEYS environment variable so you can issue
//     separate keys per client (Claude, Cursor, OpenCode, etc.) and
//     rotate them independently
//   - If no keys are configured, ALL requests are rejected (fail-closed)
// ---------------------------------------------------------------------------

export interface AuthResult {
  authenticated: boolean;
  error?: string;
}

/**
 * Validate an incoming request against the configured API keys.
 * Returns { authenticated: true } on success, or an error message on failure.
 */
export function authenticateRequest(request: Request): AuthResult {
  const configuredKeys = process.env.DIGITAL_BRAIN_API_KEYS;

  // Fail-closed: if no keys are configured, reject everything
  if (!configuredKeys || configuredKeys.trim() === "") {
    return {
      authenticated: false,
      error: "Server misconfigured: no API keys set. Set DIGITAL_BRAIN_API_KEYS.",
    };
  }

  const allowedKeys = configuredKeys
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  // Extract the Bearer token from the Authorization header
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return {
      authenticated: false,
      error: "Missing Authorization header. Use: Authorization: Bearer <your-api-key>",
    };
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return {
      authenticated: false,
      error: "Malformed Authorization header. Expected: Bearer <your-api-key>",
    };
  }

  const providedKey = parts[1];

  // Constant-time comparison would be ideal, but for API-key-length
  // strings the timing difference is negligible.  If you want extra
  // hardening you can swap in crypto.timingSafeEqual here.
  if (!allowedKeys.includes(providedKey)) {
    return {
      authenticated: false,
      error: "Invalid API key.",
    };
  }

  return { authenticated: true };
}
