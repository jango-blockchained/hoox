/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * KV Viewer — Read-only dashboard for the Cloudflare CONFIG_KV namespace.
 *
 * Layout:
 *   ┌───────────────────────────────────────────────────────────┐
 *   │  KV VIEWER     12 keys · 3 secret · ◉ 5s auto   [⚠ read-only]
 *   │───────────────────────────────────────────────────────────
 *   │  [search…]                       Last sampled 12:34:56
 *   │───────────────────────────────────────────────────────────
 *   │  KEY NAME                       SIZE  TYPE  MOD  STATUS
 *   │  trade:kill_switch              4 B   bool  —    SECRET
 *   │  agent:openai_key               51 B  str   —    SECRET
 *   │  routing:dynamic:enabled        4 B   bool  —    OK
 *   │  …                                                        │
 *   │───────────────────────────────────────────────────────────
 *   │  ! Values are read-only in the TUI. Use `hoox config kv …` │
 *   │    for writes. Secret values are flagged with a banner.    │
 *   │  [REFRESH]                                               │
 *   └───────────────────────────────────────────────────────────┘
 *
 * Pattern established for the TUI feature-parity batch:
 *   - Pure function component, no props required
 *   - Subscribes to useUIStore (so auto-refresh can pause when not active)
 *   - Calls cliBridge.configKvList() on mount + every 5s while active
 *   - Wraps content in <ErrorBoundary viewName="KV Viewer">
 *   - Renders an empty/error state instead of throwing
 *   - Read-only: write operations are intentionally *not* exposed
 *     here. The TUI never sends `kv set` / `kv delete` — those are
 *     CLI-only.
 *
 * Security:
 *   - Secret keys (per the KV manifest) are flagged with a banner.
 *   - Values are read on-demand via cliBridge.configKvGet(); the
 *     banner is shown before the first reveal.
 *   - We deliberately do not mask values — the user explicitly opted
 *     in to viewing them. The CLI equivalent (`hoox config kv get`)
 *     is the same: no masking.
 *
 * Search/filter:
 *   - Case-insensitive substring match against the key name.
 *   - The total key count in the header reflects the *unfiltered* list
 *     while the table shows the filtered count.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { Colors, useUIStore } from "@jango-blockchained/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { Spinner, EmptyState } from "../shared/spinner";
import { ViewHeader } from "../shared/view-header";
import { cliBridge } from "../../services/cli-bridge";
import type { KvKey, KvKeySnapshot } from "../../services/cli-bridge";

/** Auto-refresh interval in milliseconds. */
const REFRESH_INTERVAL_MS = 5_000;

/**
 * Format a byte size as a human-readable string (`4 B`, `1.2 KB`, …).
 * Used in the SIZE column. `null` renders as `—`.
 */
function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Render the `lastModified` timestamp as HH:MM:SS on today's date, or `—`. */
function formatTime(iso: string | null): string {
  if (iso === null) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Render the type column. `null` becomes `—`. */
function formatType(t: KvKey["manifestType"]): string {
  if (t === null) return "—";
  return t;
}

/** Pick a color for a row based on whether the key is secret. */
function rowColor(isSecret: boolean): string {
  return isSecret ? Colors.warning : Colors.foreground;
}

// ─── Sub-component: Single KV Row ─────────────────────────────────────────────

interface KvRowProps {
  keyName: string;
  size: string;
  type: string;
  modified: string;
  isSecret: boolean;
  isSelected: boolean;
  onSelect: (name: string) => void;
}

function KvRow({
  keyName,
  size,
  type,
  modified,
  isSecret,
  isSelected,
  onSelect,
}: KvRowProps) {
  const fg = isSelected ? Colors.accent : rowColor(isSecret);
  const status = isSecret ? "SECRET" : "OK";
  const statusColor = isSecret ? Colors.warning : Colors.success;
  return (
    <box
      flexDirection="row"
      gap={2}
      paddingLeft={1}
      paddingRight={1}
      alignItems="center"
      backgroundColor={isSelected ? Colors.card : undefined}
      onMouseUp={() => onSelect(keyName)}
    >
      <text fg={fg} bold={isSelected}>
        {keyName}
      </text>
      <text fg={Colors.muted} dim>
        {size.padStart(8, " ")}
      </text>
      <text fg={Colors.muted}>{type.padStart(4, " ")}</text>
      <text fg={Colors.muted} dim>
        {modified.padStart(8, " ")}
      </text>
      <text fg={statusColor} bold>
        {status}
      </text>
    </box>
  );
}

// ─── Sub-component: Detail Pane (selected key + value) ────────────────────────

interface DetailPaneProps {
  selectedKey: KvKey | null;
  value: string | null;
  loading: boolean;
  valueError: string | null;
  onReveal: () => void;
  onHide: () => void;
  revealed: boolean;
}

function DetailPane({
  selectedKey,
  value,
  loading,
  valueError,
  onReveal,
  onHide,
  revealed,
}: DetailPaneProps) {
  if (!selectedKey) {
    return (
      <box
        flexDirection="column"
        flexGrow={1}
        gap={1}
        border={true}
        borderStyle="single"
        borderColor={Colors.border}
        paddingX={1}
        paddingY={0}
      >
        <text fg={Colors.muted} dim>
          Select a key to view its value.
        </text>
        <text fg={Colors.dim} dim>
          ↑↓ navigate · Enter reveal · Esc clear
        </text>
      </box>
    );
  }

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      gap={1}
      border={true}
      borderStyle="single"
      borderColor={Colors.border}
      paddingX={1}
      paddingY={0}
    >
      {/* Selected key header */}
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={Colors.accent} bold>
          {selectedKey.name}
        </text>
        {selectedKey.isSecret && (
          <text fg={Colors.warning} bold>
            ⚠ SECRET
          </text>
        )}
      </box>
      <text fg={Colors.border} dim>
        {"─".repeat(60)}
      </text>

      {/* Secret warning before reveal */}
      {selectedKey.isSecret && !revealed && (
        <box flexDirection="column" gap={1} paddingLeft={1}>
          <text fg={Colors.warning} bold>
            ⚠ This key may contain a secret value (API key, password, etc.).
          </text>
          <box flexDirection="row" gap={1}>
            <text fg={Colors.muted}>
              The value will be displayed as plain text. Press
            </text>
            <text fg={Colors.accent}>[REVEAL]</text>
            <text fg={Colors.muted}>to view it.</text>
          </box>
        </box>
      )}

      {/* Value display */}
      {revealed ? (
        <box flexDirection="column" gap={1} paddingLeft={1} flexGrow={1}>
          {loading ? (
            <box alignItems="center" justifyContent="center" flexGrow={1}>
              <Spinner label="Loading value..." />
            </box>
          ) : valueError ? (
            <text fg={Colors.error}>! {valueError}</text>
          ) : value === null ? (
            <text fg={Colors.muted} dim>
              (empty value)
            </text>
          ) : (
            <text fg={Colors.foreground}>{value}</text>
          )}
        </box>
      ) : null}

      {/* Action buttons */}
      <box flexDirection="row" gap={2} paddingLeft={1}>
        {revealed ? (
          <text fg={Colors.muted} onMouseUp={onHide}>
            [HIDE]
          </text>
        ) : (
          <text fg={Colors.accent} bold onMouseUp={onReveal}>
            [REVEAL]
          </text>
        )}
      </box>
    </box>
  );
}

// ─── Sub-component: Search Box ────────────────────────────────────────────────

interface SearchBoxProps {
  query: string;
  onChange: (next: string) => void;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}

function SearchBox({
  query,
  onChange,
  active,
  onActivate,
  onDeactivate,
}: SearchBoxProps) {
  useKeyboard((key) => {
    if (!active) return;
    if (key.name === "escape") {
      onDeactivate();
      return;
    }
    if (key.name === "backspace" || key.name === "delete") {
      onChange(query.slice(0, -1));
      return;
    }
    if (key.name === "return") {
      onDeactivate();
      return;
    }
    if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
      onChange(query + key.sequence);
    }
  });

  return (
    <box
      flexDirection="row"
      gap={1}
      paddingLeft={1}
      paddingRight={1}
      alignItems="center"
      border={true}
      borderStyle="single"
      borderColor={active ? Colors.accent : Colors.border}
      onMouseUp={onActivate}
    >
      <text fg={Colors.muted} dim>
        search:
      </text>
      <text fg={Colors.foreground}>
        {query.length > 0 ? query : active ? "_" : "(press / to filter)"}
      </text>
    </box>
  );
}

// ─── Main KvViewer View ──────────────────────────────────────────────────────

/**
 * KvViewer — Main view showing the CONFIG_KV namespace keys.
 *
 * The view follows the same architectural pattern as the queue-depth
 * viewer (see `queue-depth.tsx` for the original):
 *   1. Pure function component, no required props
 *   2. Subscribes to `useUIStore.activeView` to pause auto-refresh
 *      when the user navigates away
 *   3. Calls a `cliBridge.<method>()` on mount + on a fixed interval
 *      (5s here) — refreshes can also be triggered manually via a
 *      button
 *   4. Renders an explicit empty/error state instead of throwing
 *   5. Wraps in <ErrorBoundary viewName="KV Viewer"> so a render bug
 *      in this view never crashes the whole TUI
 */
export function KvViewer() {
  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "kv-viewer";

  const [snapshot, setSnapshot] = useState<KvKeySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchActive, setSearchActive] = useState(false);

  const [selectedKeyName, setSelectedKeyName] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const [valueError, setValueError] = useState<string | null>(null);

  // ── Fetch handler ─────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await cliBridge.configKvList();
    if (result.success && result.data) {
      setSnapshot(result.data);
      setError(null);
    } else {
      setError(result.stderr || result.stdout || "Failed to read KV keys");
    }
    setLoading(false);
  }, []);

  // Initial load on mount.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      const result = await cliBridge.configKvList();
      if (cancelled) return;
      if (result.success && result.data) {
        setSnapshot(result.data);
      } else {
        setError(result.stderr || result.stdout || "Failed to read KV keys");
      }
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-refresh every 5s while the view is the active view.
  useEffect(() => {
    if (!isActive) return;
    const handle = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [isActive, refresh]);

  // ── Derived data ─────────────────────────────────────────────────────
  const allKeys = snapshot?.keys ?? [];
  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length === 0) return allKeys;
    return allKeys.filter((k) => k.name.toLowerCase().includes(q));
  }, [allKeys, search]);

  const secretCount = useMemo(
    () => allKeys.filter((k) => k.isSecret).length,
    [allKeys]
  );

  const selectedKey = useMemo(() => {
    if (!selectedKeyName) return null;
    return allKeys.find((k) => k.name === selectedKeyName) ?? null;
  }, [allKeys, selectedKeyName]);

  // When the selected key changes, reset the reveal/value state.
  useEffect(() => {
    setRevealed(false);
    setValue(null);
    setValueError(null);
  }, [selectedKeyName]);

  // ── Detail pane callbacks ────────────────────────────────────────────
  const handleReveal = useCallback(async () => {
    if (!selectedKey) return;
    setRevealed(true);
    setValueLoading(true);
    setValueError(null);
    const result = await cliBridge.configKvGet(selectedKey.name);
    if (result.success) {
      setValue(result.data);
    } else {
      setValueError(result.stderr || result.stdout || "Failed to read value");
    }
    setValueLoading(false);
  }, [selectedKey]);

  const handleHide = useCallback(() => {
    setRevealed(false);
    setValue(null);
    setValueError(null);
  }, []);

  // ── Global keyboard handling (active only when this view is on top) ──
  useKeyboard((key) => {
    if (!isActive) return;
    if (searchActive) return; // SearchBox handles its own keys.
    if (key.name === "slash" || (key.ctrl && key.name === "f")) {
      setSearchActive(true);
      return;
    }
    if (key.name === "escape") {
      if (selectedKeyName) setSelectedKeyName(null);
      return;
    }
    if (key.name === "up") {
      if (filteredKeys.length === 0) return;
      const idx = selectedKeyName
        ? filteredKeys.findIndex((k) => k.name === selectedKeyName)
        : -1;
      const next = Math.max(0, idx - 1);
      setSelectedKeyName(filteredKeys[next]?.name ?? null);
      return;
    }
    if (key.name === "down") {
      if (filteredKeys.length === 0) return;
      const idx = selectedKeyName
        ? filteredKeys.findIndex((k) => k.name === selectedKeyName)
        : -1;
      const next = Math.min(filteredKeys.length - 1, idx + 1);
      setSelectedKeyName(filteredKeys[next]?.name ?? null);
      return;
    }
    if (key.name === "return") {
      if (selectedKey && !revealed) {
        void handleReveal();
      }
      return;
    }
  });

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary viewName="KV Viewer">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        <ViewHeader
          title="KV VIEWER"
          showDivider={false}
          meta={
            <box flexDirection="row" gap={2} alignItems="center">
              <text fg={Colors.muted} dim>
                {`${allKeys.length} key${allKeys.length === 1 ? "" : "s"} · ${secretCount} secret`}
              </text>
              {search.length > 0 ? (
                <text fg={Colors.info} dim>
                  {`(${filteredKeys.length} match${filteredKeys.length === 1 ? "" : "es"})`}
                </text>
              ) : null}
              <text fg={Colors.warning} bold>
                ⚠ read-only
              </text>
              <text fg={Colors.info} dim>
                {`◉ ${REFRESH_INTERVAL_MS / 1000}s auto`}
              </text>
            </box>
          }
        />

        {/* Search + last sampled row */}
        <box flexDirection="row" gap={1} alignItems="center">
          <SearchBox
            query={search}
            onChange={setSearch}
            active={searchActive}
            onActivate={() => setSearchActive(true)}
            onDeactivate={() => setSearchActive(false)}
          />
          <text fg={Colors.muted} dim>
            {snapshot
              ? `Last sampled ${formatTime(snapshot.timestamp)}`
              : "Last sampled —"}
          </text>
        </box>

        {/* Main content: list + detail */}
        <box flexDirection="row" flexGrow={1} gap={1}>
          {/* Left pane: scrollable list */}
          <box
            flexDirection="column"
            flexGrow={1}
            border={true}
            borderStyle="single"
            borderColor={Colors.border}
            paddingX={1}
            paddingY={0}
          >
            {/* Column header */}
            <box flexDirection="row" gap={2} paddingLeft={1} paddingRight={1}>
              <text fg={Colors.muted} dim>
                KEY NAME
              </text>
              <text fg={Colors.muted} dim>
                {"SIZE".padStart(8, " ")}
              </text>
              <text fg={Colors.muted} dim>
                {"TYPE".padStart(4, " ")}
              </text>
              <text fg={Colors.muted} dim>
                {"MOD".padStart(8, " ")}
              </text>
              <text fg={Colors.muted} dim>
                STATUS
              </text>
            </box>
            <text fg={Colors.border} dim>
              {"─".repeat(80)}
            </text>

            {/* Body */}
            {loading && allKeys.length === 0 ? (
              <box
                padding={1}
                alignItems="center"
                justifyContent="center"
                flexGrow={1}
              >
                <Spinner label="Loading KV keys..." />
              </box>
            ) : error && allKeys.length === 0 ? (
              <box padding={1} flexDirection="column" gap={0}>
                <text fg={Colors.error} bold>
                  ! {error.length > 60 ? error.slice(0, 57) + "…" : error}
                </text>
                <text fg={Colors.muted} dim>
                  Make sure wrangler is installed and authenticated.
                </text>
              </box>
            ) : allKeys.length === 0 ? (
              <box padding={1} flexGrow={1}>
                <EmptyState
                  message="No keys in CONFIG_KV."
                  suggestion="Populate with `hoox config kv apply-manifest`"
                  icon="🔑"
                />
              </box>
            ) : filteredKeys.length === 0 ? (
              <box padding={1} flexGrow={1}>
                <EmptyState
                  message={`No keys match "${search}".`}
                  suggestion="Press / to clear."
                  icon="🔍"
                />
              </box>
            ) : (
              <scrollbox width="100%" flexGrow={1}>
                {filteredKeys.map((k) => (
                  <KvRow
                    key={k.name}
                    keyName={k.name}
                    size={formatSize(k.valueSize)}
                    type={formatType(k.manifestType)}
                    modified={formatTime(k.lastModified)}
                    isSecret={k.isSecret}
                    isSelected={k.name === selectedKeyName}
                    onSelect={(name) => setSelectedKeyName(name)}
                  />
                ))}
              </scrollbox>
            )}
          </box>

          {/* Right pane: detail / value viewer */}
          <DetailPane
            selectedKey={selectedKey}
            value={value}
            loading={valueLoading}
            valueError={valueError}
            onReveal={() => void handleReveal()}
            onHide={handleHide}
            revealed={revealed}
          />
        </box>

        {/* Footer: refresh + read-only warning */}
        <box
          flexDirection="row"
          justifyContent="space-between"
          paddingLeft={1}
          paddingRight={1}
          alignItems="center"
        >
          <box flexDirection="row" gap={2} alignItems="center">
            <text
              fg={loading ? Colors.muted : Colors.accent}
              bg={Colors.card}
              dim={loading}
              onMouseUp={loading ? undefined : () => void refresh()}
            >
              {loading ? " ... " : " [REFRESH] "}
            </text>
            {error && allKeys.length > 0 && (
              <text fg={Colors.warning} dim>
                ! {error.length > 50 ? error.slice(0, 47) + "…" : error}
              </text>
            )}
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={Colors.muted} dim>
              Use
            </text>
            <text fg={Colors.accent}>hoox config kv get|set|delete</text>
            <text fg={Colors.muted} dim>
              in CLI for writes
            </text>
          </box>
        </box>
      </box>
    </ErrorBoundary>
  );
}
