/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Secrets Viewer — Read-only dashboard for Cloudflare Workers secrets.
 *
 * Layout:
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │  SECRETS VIEWER   12 secrets · ◉ 5s auto    [⚠ READ-ONLY]   │
 *   │───────────────────────────────────────────────────────────────
 *   │  [! SECURITY !] Values are hidden for security reasons.       │
 *   │                 Use `hoox config secrets set` in CLI to manage│
 *   │───────────────────────────────────────────────────────────────
 *   │  [search…]                           Last sampled 12:34:56   │
 *   │───────────────────────────────────────────────────────────────
 *   │  SECRET NAME                   TYPE        SOURCE   STATUS  │
 *   │  BINANCE_KEY_BINDING          api_key     config   OK      │
 *   │  OPENAI_API_KEY               api_key     config   OK      │
 *   │  TELEGRAM_BOT_TOKEN           token       config   OK      │
 *   │  …                                                         │
 *   │───────────────────────────────────────────────────────────────
 *   │  [REFRESH]                                                 │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Pattern established for the TUI feature-parity batch:
 *   - Pure function component, no props required
 *   - Subscribes to useUIStore (so auto-refresh can pause when not active)
 *   - Calls cliBridge.configSecretsList() on mount + every 5s while active
 *   - Wraps content in <ErrorBoundary viewName="Secrets Viewer">
 *   - Renders an empty/error state instead of throwing
 *   - Read-only: write operations are intentionally *not* exposed
 *     here. The TUI never sends `secrets set` / `secrets delete` —
 *     those are CLI-only.
 *
 * Security:
 *   - Values are NEVER fetched or displayed — this is strictly read-only
 *   - The prominent security warning banner is always visible
 *   - Only secret names, inferred types, and sources are shown
 *   - No ability to reveal or copy secret values
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { Colors, useUIStore } from "@hoox-sh/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { Spinner } from "../shared/spinner";
import { ViewHeader } from "../shared/view-header";
import { cliBridge } from "../../services/cli-bridge";
import type {
  SecretMetadata,
  SecretsSnapshot,
} from "../../services/cli-bridge";

/** Auto-refresh interval in milliseconds. */
const REFRESH_INTERVAL_MS = 5_000;

/**
 * Format a secret type for display in the TYPE column.
 */
function formatType(type: SecretMetadata["type"]): string {
  return type;
}

/**
 * Color for the source badge.
 */
function sourceColor(source: SecretMetadata["source"]): string {
  return source === "Cloudflare" ? Colors.info : Colors.muted;
}

/**
 * Pick a color for a row based on secret type severity.
 */
function rowColor(type: SecretMetadata["type"]): string {
  if (type === "api_key" || type === "token") {
    return Colors.warning;
  }
  return Colors.foreground;
}

// ─── Sub-component: Single Secret Row ─────────────────────────────────────────

interface SecretRowProps {
  secret: SecretMetadata;
  isSelected: boolean;
  onSelect: (name: string) => void;
}

function SecretRow({ secret, isSelected, onSelect }: SecretRowProps) {
  const fg = isSelected ? Colors.accent : rowColor(secret.type);
  return (
    <box
      flexDirection="row"
      gap={2}
      paddingLeft={1}
      paddingRight={1}
      alignItems="center"
      backgroundColor={isSelected ? Colors.card : undefined}
      onMouseUp={() => onSelect(secret.name)}
    >
      <text fg={fg} bold={isSelected}>
        {secret.name}
      </text>
      <text fg={Colors.muted}>{formatType(secret.type).padStart(8, " ")}</text>
      <text fg={sourceColor(secret.source)} dim>
        {secret.source.padEnd(10, " ")}
      </text>
    </box>
  );
}

// ─── Sub-component: Search Box ─────────────────────────────────────────────────

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
  // When active, capture printable keys for filtering (same pattern as KV Viewer).
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

// ─── Main SecretsViewer View ───────────────────────────────────────────────────

/**
 * SecretsViewer — Main view showing the declared secrets across all workers.
 *
 * The view follows the same architectural pattern as the KV viewer
 * (see `kv-viewer.tsx` for the original):
 *   1. Pure function component, no required props
 *   2. Subscribes to `useUIStore.activeView` to pause auto-refresh
 *      when the user navigates away
 *   3. Calls `cliBridge.configSecretsList()` on mount + on a fixed
 *      interval (5s) — refreshes can also be triggered manually via
 *      a button
 *   4. Renders an explicit empty/error state instead of throwing
 *   5. Wraps in <ErrorBoundary viewName="Secrets Viewer"> so a render
 *      bug in this view never crashes the whole TUI
 *
 * Security guarantees:
 *   - Values are NEVER fetched — only names and metadata are retrieved
 *   - The security warning banner is prominently displayed at all times
 *   - No "reveal" or "copy" functionality exists
 *   - Write operations are intentionally not exposed
 */
export function SecretsViewer() {
  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "secrets-viewer";

  const [snapshot, setSnapshot] = useState<SecretsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchActive, setSearchActive] = useState(false);

  const [selectedSecretName, setSelectedSecretName] = useState<string | null>(
    null
  );

  // ── Fetch handler ─────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await cliBridge.configSecretsList();
    if (result.success && result.data) {
      setSnapshot(result.data);
      setError(null);
    } else {
      setError(result.stderr || result.stdout || "Failed to read secrets");
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
      const result = await cliBridge.configSecretsList();
      if (cancelled) return;
      if (result.success && result.data) {
        setSnapshot(result.data);
      } else {
        setError(result.stderr || result.stdout || "Failed to read secrets");
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

  // ── Derived data ───────────────────────────────────────────────────────────
  const allSecrets = snapshot?.secrets ?? [];
  const filteredSecrets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length === 0) return allSecrets;
    return allSecrets.filter((s) => s.name.toLowerCase().includes(q));
  }, [allSecrets, search]);

  const selectedSecret = useMemo(() => {
    if (!selectedSecretName) return null;
    return allSecrets.find((s) => s.name === selectedSecretName) ?? null;
  }, [allSecrets, selectedSecretName]);

  // ── Keyboard: list nav + open search (inactive while search is active) ───
  useKeyboard((key) => {
    if (!isActive) return;
    if (searchActive) return; // SearchBox owns keys while active
    if (key.name === "slash" || (key.ctrl && key.name === "f")) {
      setSearchActive(true);
      return;
    }
    if (key.name === "escape") {
      if (selectedSecretName) setSelectedSecretName(null);
      return;
    }
    if (key.name === "up") {
      if (filteredSecrets.length === 0) return;
      const idx = selectedSecretName
        ? filteredSecrets.findIndex((s) => s.name === selectedSecretName)
        : -1;
      const next = Math.max(0, idx - 1);
      setSelectedSecretName(filteredSecrets[next]?.name ?? null);
      return;
    }
    if (key.name === "down") {
      if (filteredSecrets.length === 0) return;
      const idx = selectedSecretName
        ? filteredSecrets.findIndex((s) => s.name === selectedSecretName)
        : -1;
      const next = Math.min(filteredSecrets.length - 1, idx + 1);
      setSelectedSecretName(filteredSecrets[next]?.name ?? null);
      return;
    }
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary viewName="Secrets Viewer">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        <ViewHeader
          title="SECRETS VIEWER"
          showDivider={false}
          meta={
            <box flexDirection="row" gap={2} alignItems="center">
              <text fg={Colors.muted} dim>
                {`${allSecrets.length} secret${allSecrets.length === 1 ? "" : "s"}`}
              </text>
              {search.length > 0 ? (
                <text fg={Colors.info} dim>
                  {`(${filteredSecrets.length} match${filteredSecrets.length === 1 ? "" : "es"})`}
                </text>
              ) : null}
              <text fg={Colors.warning} bold>
                ⚠ READ-ONLY
              </text>
              <text fg={Colors.info} dim>
                {`◉ ${REFRESH_INTERVAL_MS / 1000}s auto`}
              </text>
            </box>
          }
        />

        {/* Security warning banner — ALWAYS visible */}
        <box
          flexDirection="column"
          padding={1}
          gap={0}
          border={true}
          borderStyle="single"
          borderColor={Colors.warning}
          backgroundColor={Colors.card}
        >
          <text fg={Colors.warning} bold>
            ⚠ SECURITY: Values are hidden for security reasons.
          </text>
          <box flexDirection="row" gap={1}>
            <text fg={Colors.muted} dim>
              This view is strictly read-only. Use
            </text>
            <text fg={Colors.accent}>hoox config secrets set</text>
            <text fg={Colors.muted} dim>
              in CLI to manage secrets.
            </text>
          </box>
        </box>

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
              ? `Last sampled ${snapshot.timestamp.slice(11, 19)}`
              : "Last sampled —"}
          </text>
        </box>

        {/* Main content: secret list + detail */}
        <box flexDirection="row" flexGrow={1} gap={1}>
          {/* Left pane: scrollable list */}
          <box
            flexDirection="column"
            flexGrow={1}
            border={true}
            borderStyle="single"
            borderColor={Colors.border}
          >
            {/* Column header */}
            <box flexDirection="row" gap={2} paddingLeft={1} paddingRight={1}>
              <text fg={Colors.muted} dim>
                SECRET NAME
              </text>
              <text fg={Colors.muted} dim>
                {"TYPE".padStart(8, " ")}
              </text>
              <text fg={Colors.muted} dim>
                {"SOURCE".padEnd(10, " ")}
              </text>
            </box>
            <text fg={Colors.border} dim>
              {"─".repeat(80)}
            </text>

            {/* Body */}
            {loading && allSecrets.length === 0 ? (
              <box padding={1} flexGrow={1} justifyContent="center">
                <Spinner label="Loading secrets…" />
              </box>
            ) : error && allSecrets.length === 0 ? (
              <box padding={1} flexDirection="column" gap={0}>
                <text fg={Colors.error} bold>
                  ! {error.length > 60 ? error.slice(0, 57) + "…" : error}
                </text>
                <text fg={Colors.muted} dim>
                  Make sure hoox CLI is installed and configured.
                </text>
              </box>
            ) : allSecrets.length === 0 ? (
              <box padding={1} flexDirection="column" gap={0}>
                <text fg={Colors.muted} dim>
                  No secrets declared. Add secrets to wrangler.jsonc and use
                </text>
                <text fg={Colors.accent}>hoox config secrets set</text>
                <text fg={Colors.muted} dim>
                  to manage them.
                </text>
              </box>
            ) : filteredSecrets.length === 0 ? (
              <box padding={1} flexDirection="row" gap={1}>
                <text fg={Colors.muted} dim>
                  {`No secrets match "${search}". Press`}
                </text>
                <text fg={Colors.accent}>/</text>
                <text fg={Colors.muted} dim>
                  to clear.
                </text>
              </box>
            ) : (
              <scrollbox width="100%" flexGrow={1}>
                {filteredSecrets.map((s) => (
                  <SecretRow
                    key={s.name}
                    secret={s}
                    isSelected={s.name === selectedSecretName}
                    onSelect={(name) => setSelectedSecretName(name)}
                  />
                ))}
              </scrollbox>
            )}
          </box>

          {/* Right pane: detail / info viewer */}
          <box
            flexDirection="column"
            flexGrow={1}
            border={true}
            borderStyle="single"
            borderColor={Colors.border}
          >
            {selectedSecret ? (
              <box flexDirection="column" gap={1} padding={2}>
                <text fg={Colors.accent} bold>
                  {selectedSecret.name}
                </text>
                <text fg={Colors.border} dim>
                  {"─".repeat(40)}
                </text>
                <box flexDirection="column" gap={0}>
                  <box flexDirection="row" gap={1}>
                    <text fg={Colors.muted}>Type:</text>
                    <text fg={Colors.foreground}>{selectedSecret.type}</text>
                  </box>
                  <box flexDirection="row" gap={1}>
                    <text fg={Colors.muted}>Source:</text>
                    <text fg={sourceColor(selectedSecret.source)}>
                      {selectedSecret.source}
                    </text>
                  </box>
                </box>
                <text fg={Colors.muted} dim>
                  Values are not available for viewing.
                </text>
              </box>
            ) : (
              <box flexDirection="column" flexGrow={1} padding={2} gap={1}>
                <text fg={Colors.muted} dim>
                  Select a secret to view its metadata.
                </text>
                <text fg={Colors.dim} dim>
                  ↑↓ navigate · values hidden
                </text>
              </box>
            )}
          </box>
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
            {error && allSecrets.length > 0 && (
              <text fg={Colors.warning} dim>
                ! {error.length > 50 ? error.slice(0, 47) + "…" : error}
              </text>
            )}
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={Colors.muted} dim>
              Use
            </text>
            <text fg={Colors.accent}>hoox config secrets set|delete</text>
            <text fg={Colors.muted} dim>
              in CLI for writes
            </text>
          </box>
        </box>
      </box>
    </ErrorBoundary>
  );
}
