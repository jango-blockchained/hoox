/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Formatters — Number, currency, duration, and timestamp formatting utilities.
 *
 * Pure functions — no side effects, safe for NaN/Infinity/negative/zero.
 */
/** Format large numbers with K/M/B suffixes */
export function formatNumber(n: number): string {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

/** Format as compact currency */
export function formatCurrency(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Compact currency without sign prefix for raw values */
export function formatCompactCurrency(n: number): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Format duration in seconds to human-readable */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

/** Compact duration (e.g. "72h", "1d 3h") */
export function formatDurationCompact(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

/** ISO timestamp to human-readable */
export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString("en-US", { hour12: false });
  } catch {
    return iso;
  }
}

/** Relative time (e.g. "2m ago", "1h ago", "3d ago") */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Format percentage */
export function formatPercent(n: number, decimals = 2): string {
  if (!isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

/** Uptime seconds to human-readable */
export function formatUptime(seconds: number): string {
  return formatDuration(seconds);
}

/** Latency in ms */
export function formatLatency(ms: number): string {
  if (!isFinite(ms)) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Request count */
export function formatRequests(n: number): string {
  return formatNumber(n);
}

/** Memory in MB */
export function formatMemory(usedMB: number, limitMB: number): string {
  const u = usedMB.toFixed(0);
  const l = limitMB.toFixed(0);
  return `${u}/${l} MB`;
}

/** CPU time in ms */
export function formatCpu(ms: number): string {
  if (!isFinite(ms)) return "—";
  return `${ms.toFixed(1)}ms`;
}
