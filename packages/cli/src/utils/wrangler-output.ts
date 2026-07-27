/**
 * Sanitize wrangler (and similar CLI) stderr/stdout for human error messages.
 *
 * Wrangler often dumps banners, emoji, log-file paths, and multi-line stack
 * noise. Operators need the last actionable line(s), not the full wall.
 */

const NOISE_LINE =
  /^(?:⛅️|────────────────|Getting User settings|Logs were written|🪵|npm notice|\$ |▲ \[WARNING\])/i;

/**
 * Collapse wrangler-style output into a short, actionable snippet.
 *
 * @param raw - Full stdout/stderr from wrangler (or similar)
 * @param maxLines - Keep at most this many trailing meaningful lines (default 4)
 */
export function sanitizeWranglerOutput(raw: string, maxLines = 4): string {
  if (!raw || !raw.trim()) return "wrangler failed (no output)";

  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\u001b\[[0-9;]*m/g, "").trimEnd())
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !NOISE_LINE.test(l));

  // Prefer errors + bullet detail lines that usually follow wrangler ERROR blocks
  const preferred = lines.filter(
    (l) =>
      /error|fail|invalid|missing|not found|✘|✗|code\s+\d+/i.test(l) ||
      /^[-•]/.test(l) ||
      /should be|unexpected field|already in use/i.test(l)
  );
  const pool = preferred.length > 0 ? preferred : lines;
  const tail = pool.slice(-maxLines);

  let text = tail.join(" · ");
  // Cap total length for card layout
  if (text.length > 400) {
    text = text.slice(0, 397) + "…";
  }
  return text || "wrangler failed (unrecognized output)";
}

/**
 * Build a CLIError-friendly details block from multiple secret failures.
 */
export function formatSecretFailureDetails(
  failed: Array<{ name: string; reason: string }>
): string {
  if (failed.length === 0) return "";
  return failed.map((f) => `${f.name}: ${f.reason}`).join("\n");
}
