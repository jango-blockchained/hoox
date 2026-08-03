/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
import { useState, useCallback, useEffect } from "react";
import { Colors, WorkerStatusColor } from "@hoox-sh/hoox-shared";
import { StatusDot } from "../../shared/status-dot";
import { cliBridge } from "../../../services/cli-bridge";
import type { ModelHealth } from "../../../services/cli-bridge";

/** Polling interval for AI model health checks (30 seconds). */
const MODEL_HEALTH_POLL_MS = 30_000;

/**
 * Map model status to a StatusDot-compatible status string.
 * online → operational, degraded → degraded, offline → down
 */
function modelStatusToDot(
  status: ModelHealth["status"]
): "operational" | "degraded" | "down" {
  if (status === "online") return "operational";
  if (status === "degraded") return "degraded";
  return "down";
}

/** Model status color via shared worker status map. */
function modelStatusColor(status: ModelHealth["status"]): string {
  return WorkerStatusColor[modelStatusToDot(status)];
}

/**
 * ModelHealthRow — a single expandable row showing one AI provider.
 * Click to expand/collapse detailed stats (latency, daily usage, error).
 */
function ModelHealthRow({
  model,
  isExpanded,
  onToggle,
}: {
  model: ModelHealth;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const color = modelStatusColor(model.status);

  return (
    <box flexDirection="column" gap={0}>
      {/* Main row — always visible */}
      <box flexDirection="row" gap={1} paddingLeft={1}>
        {/* Expand/collapse indicator */}
        <text fg={Colors.muted} dim>
          {isExpanded ? "▼" : "▶"}
        </text>

        {/* Status dot */}
        <StatusDot status={modelStatusToDot(model.status)} />

        {/* Provider name */}
        <text fg={Colors.foreground} bold>
          {model.name}
        </text>

        {/* Model identifier (truncated) */}
        <text fg={Colors.muted} dim>
          {model.model.length > 30
            ? model.model.slice(0, 27) + "…"
            : model.model}
        </text>

        {/* Expand hint */}
        <text fg={Colors.accent} onMouseUp={onToggle}>
          [DETAILS]
        </text>
      </box>

      {/* Expanded details */}
      {isExpanded && (
        <box flexDirection="column" gap={0} paddingLeft={6}>
          {/* Latency */}
          <box flexDirection="row" gap={1} paddingLeft={2}>
            <text fg={Colors.muted} dim>
              latency:
            </text>
            <text fg={color}>
              {model.latencyMs !== null ? `${model.latencyMs}ms` : "-"}
            </text>
          </box>

          {/* Daily requests */}
          <box flexDirection="row" gap={1} paddingLeft={2}>
            <text fg={Colors.muted} dim>
              daily requests:
            </text>
            <text fg={Colors.info}>
              {model.dailyRequests !== null
                ? model.dailyRequests.toLocaleString()
                : "-"}
            </text>
          </box>

          {/* Error message (if any) */}
          {model.error && (
            <text fg={Colors.error}>
              {"  error: "}
              {model.error}
            </text>
          )}
        </box>
      )}
    </box>
  );
}

/**
 * ModelHealthSection — displays health status of all configured AI providers.
 *
 * Auto-refreshes every 30 seconds when the dashboard is active.
 * Supports multiple providers: Workers AI, OpenAI, Anthropic, Google, Azure.
 * Click on a provider to expand detailed stats (latency, daily usage, error).
 */
function ModelHealthSection() {
  const [providers, setProviders] = useState<ModelHealth[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const fetchHealth = useCallback(async () => {
    const result = await cliBridge.agentHealthCheck();
    if (result.success && result.data) {
      setProviders(result.data.providers);
      setLastRefresh(Date.now());
    }
    setLoading(false);
  }, []);

  // Initial fetch + 30s polling
  useEffect(() => {
    void fetchHealth();
    const interval = setInterval(() => {
      void fetchHealth();
    }, MODEL_HEALTH_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const toggleExpand = useCallback((index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }, []);

  if (loading && providers.length === 0) {
    return (
      <box flexDirection="column" gap={0}>
        <text fg={Colors.foreground} bold dim>
          AI MODEL HEALTH
        </text>
        <text fg={Colors.muted} dim paddingTop={1}>
          Checking provider status…
        </text>
      </box>
    );
  }

  if (providers.length === 0) {
    return (
      <box flexDirection="column" gap={0}>
        <text fg={Colors.foreground} bold dim>
          AI MODEL HEALTH
        </text>
        <text fg={Colors.muted} dim paddingTop={1}>
          No AI providers configured
        </text>
      </box>
    );
  }

  // Summary counts
  const onlineCount = providers.filter((p) => p.status === "online").length;
  const degradedCount = providers.filter((p) => p.status === "degraded").length;
  const offlineCount = providers.filter((p) => p.status === "offline").length;

  return (
    <box flexDirection="column" gap={0}>
      {/* Section header */}
      <box flexDirection="row" gap={2}>
        <text fg={Colors.foreground} bold dim>
          AI MODEL HEALTH
        </text>

        {/* Status summary badges */}
        {onlineCount > 0 && (
          <text fg={Colors.success} dim>
            {onlineCount} online
          </text>
        )}
        {degradedCount > 0 && (
          <text fg={Colors.warning} dim>
            {degradedCount} degraded
          </text>
        )}
        {offlineCount > 0 && (
          <text fg={Colors.error} dim>
            {offlineCount} offline
          </text>
        )}

        {/* Last refresh timestamp */}
        {lastRefresh !== null && (
          <text fg={Colors.muted} dim>
            {`updated ${new Date(lastRefresh).toLocaleTimeString()}`}
          </text>
        )}
      </box>

      {/* Provider list */}
      <box
        flexDirection="column"
        gap={0}
        paddingTop={1}
        border={true}
        borderStyle="single"
        borderColor={Colors.border}
        backgroundColor={Colors.card}
        paddingX={1}
        paddingY={0}
      >
        {providers.map((model, index) => (
          <ModelHealthRow
            key={model.name}
            model={model}
            isExpanded={expandedIndex === index}
            onToggle={() => toggleExpand(index)}
          />
        ))}
      </box>
    </box>
  );
}

export { ModelHealthSection };
