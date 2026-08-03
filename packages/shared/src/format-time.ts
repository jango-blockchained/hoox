/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Relative time formatter — converts a timestamp (ms) into a human-readable
 * "time ago" string. Used by the StatusBar stale-data indicator and toast
 * notifications for reconnection downtime.
 *
 * Format: "< 1m ago", "2m ago", "1h ago", "3d ago", "> 30d ago"
 */

/**
 * Format a timestamp as a relative "X ago" string.
 *
 * @param timestampMs  Unix timestamp in milliseconds
 * @param nowMs        Optional "now" reference (defaults to Date.now())
 * @returns            Relative time string (e.g. "5m ago")
 */
export function formatRelativeTime(
  timestampMs: number,
  nowMs?: number
): string {
  const now = nowMs ?? Date.now();
  const diffMs = now - timestampMs;

  // Guard: future timestamps or zero
  if (diffMs < 0) return "just now";
  if (timestampMs === 0) return "—";

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "< 1m ago";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return `> 30d ago`;
}

/**
 * Format a duration in milliseconds as a compact human-readable string.
 * Used for reconnection downtime toasts.
 *
 * @param durationMs  Duration in milliseconds
 * @returns           Compact duration string (e.g. "12s", "2m 30s")
 */
export function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainMin = minutes % 60;
    return remainMin > 0 ? `${hours}h ${remainMin}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const remainSec = seconds % 60;
    return remainSec > 0 ? `${minutes}m ${remainSec}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}
