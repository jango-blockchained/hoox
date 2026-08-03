/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
import { useState, useEffect, useMemo } from "react";
import {
  Colors,
  getHooxRepoPath,
  resolveHooxRuntimeRoot,
} from "@hoox-sh/hoox-shared";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";
import { ErrorBoundary } from "../shared/error-boundary";
import { ViewHeader } from "../shared/view-header";

// Define types for the graph metadata
interface GraphMetadata {
  workers: Record<
    string,
    {
      description: string;
      category: string;
      tags: string[];
      isPublic: boolean;
      smartPlacement: boolean;
    }
  >;
  infrastructure: Record<
    string,
    {
      label: string;
      category: string;
      description: string;
      tags: string[];
      bindingName: string;
    }
  >;
  dataFlows: Array<{
    source: string;
    target: string;
    description: string;
    flowType: string;
  }>;
  communities: Array<{
    id: string;
    label: string;
    description: string;
    nodeIds: string[];
  }>;
}

/**
 * Resolve graph-metadata.json regardless of launch CWD.
 * Candidates: runtime root (HOOX_REPO / cwd / ~/.hoox/repo), walk-up from
 * cwd, and relative to this source file (packages/tui/… → monorepo root).
 */
/**
 * Resolve path to graph-metadata.json.
 *
 * Override with `HOOX_GRAPH_METADATA_PATH` (absolute or relative) for tests
 * and non-standard layouts — avoids process-wide `fs` mocks in the suite.
 */
export function resolveGraphMetadataPath(): string | null {
  const override = process.env.HOOX_GRAPH_METADATA_PATH?.trim();
  if (override) {
    const resolved = path.isAbsolute(override)
      ? override
      : path.resolve(process.cwd(), override);
    return fs.existsSync(resolved) ? resolved : null;
  }

  const fileName = "graph-metadata.json";
  const candidates: string[] = [
    path.resolve(process.cwd(), fileName),
    // This file lives at packages/tui/src/components/views/
    path.resolve(import.meta.dir, "../../../../../", fileName),
  ];

  const runtime = resolveHooxRuntimeRoot();
  if (runtime.root) {
    candidates.push(path.join(runtime.root, fileName));
  }
  candidates.push(path.join(getHooxRepoPath(), fileName));

  // Walk up from CWD looking for the monorepo marker
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    candidates.push(path.join(dir, fileName));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function EdgeTopology() {
  return (
    <ErrorBoundary viewName="Edge Topology">
      <EdgeTopologyInner />
    </ErrorBoundary>
  );
}

function EdgeTopologyInner() {
  const [metadata, setMetadata] = useState<GraphMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [activeCommunity, setActiveCommunity] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  useEffect(() => {
    try {
      const graphPath = resolveGraphMetadataPath();
      if (!graphPath) {
        setError(
          "graph-metadata.json not found. Run `bun run graph` from the monorepo root, set HOOX_REPO, or `hoox doctor --fix-runtime`."
        );
        return;
      }
      const data = fs.readFileSync(graphPath, "utf-8");
      setMetadata(JSON.parse(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const workers = metadata ? Object.entries(metadata.workers) : [];
  const infra = metadata ? Object.entries(metadata.infrastructure) : [];
  const communities = metadata ? metadata.communities : [];

  // Combine all selectable items for keyboard navigation
  const selectableItems = useMemo(() => {
    if (!metadata) return [];

    // Filter nodes if a community is selected
    const visibleWorkers = activeCommunity
      ? workers.filter(([id]) =>
          communities
            .find((c) => c.id === activeCommunity)
            ?.nodeIds.includes(`workspace:${id}`)
        )
      : workers;

    const visibleInfra = activeCommunity
      ? infra.filter(([id]) =>
          communities
            .find((c) => c.id === activeCommunity)
            ?.nodeIds.includes(`infra:${id}`)
        )
      : infra;

    return [
      { type: "community", id: null, label: "All" },
      ...communities.map((c) => ({
        type: "community",
        id: c.id,
        label: c.label,
      })),
      ...visibleWorkers.map(([id]) => ({ type: "worker", id })),
      ...visibleInfra.map(([id]) => ({ type: "infra", id })),
    ];
  }, [metadata, activeCommunity, workers, infra, communities]);

  useKeyboard((key) => {
    if (key.name === "escape") {
      setSelectedNode(null);
      setActiveCommunity(null);
      setFocusedIndex(0);
      return;
    }

    if (key.name === "right" || key.name === "tab") {
      setFocusedIndex((prev) => (prev + 1) % selectableItems.length);
      return;
    }

    if (key.name === "left" || (key.name === "tab" && key.shift)) {
      setFocusedIndex(
        (prev) => (prev - 1 + selectableItems.length) % selectableItems.length
      );
      return;
    }

    if (key.name === "return" || key.name === "space") {
      const item = selectableItems[focusedIndex];
      if (!item) return;

      if (item.type === "community") {
        setActiveCommunity(item.id);
        setSelectedNode(null);
        setFocusedIndex(0); // Reset focus when community changes
      } else {
        setSelectedNode(item.id);
      }
    }
  });

  if (error) {
    return (
      <box flexDirection="column" padding={1}>
        <text fg={Colors.error} bold>
          Error loading topology data:
        </text>
        <text fg={Colors.error}>{error}</text>
      </box>
    );
  }

  if (!metadata) {
    return (
      <box
        flexDirection="column"
        padding={1}
        justifyContent="center"
        alignItems="center"
        height="100%"
      >
        <text fg={Colors.muted}>Loading Edge Topology...</text>
      </box>
    );
  }

  // Determine what to show in the right column
  // (metadata is non-null here: the guard at the top of this branch returns early)
  let rightColumnContent;
  if (selectedNode) {
    const isWorker = selectedNode.startsWith("workers/");
    if (isWorker) {
      const worker = metadata.workers[selectedNode];
      const inboundFlows = metadata.dataFlows.filter(
        (f) => f.target === selectedNode
      );
      const outboundFlows = metadata.dataFlows.filter(
        (f) => f.source === selectedNode
      );

      rightColumnContent = (
        <box flexDirection="column" flexGrow={1} overflow="hidden">
          <text bold fg={Colors.success} marginBottom={1}>
            {selectedNode.replace("workers/", "")}
          </text>
          <text fg={Colors.foreground} marginBottom={1}>
            {worker.description}
          </text>

          <text bold fg={Colors.muted} marginTop={1}>
            TAGS
          </text>
          <box flexDirection="row" flexWrap="wrap" marginBottom={1}>
            {worker.tags.map((t) => (
              <text key={t} fg={Colors.info} marginRight={1}>
                #{t}
              </text>
            ))}
          </box>

          <text bold fg={Colors.muted} marginTop={1}>
            {`INBOUND FLOWS (${inboundFlows.length})`}
          </text>
          {inboundFlows.map((f, i) => (
            <text key={i} fg={Colors.foreground} dim>
              ← {f.source.replace("workers/", "")}: {f.flowType}
            </text>
          ))}

          <text bold fg={Colors.muted} marginTop={1}>
            {`OUTBOUND FLOWS (${outboundFlows.length})`}
          </text>
          {outboundFlows.map((f, i) => (
            <text key={i} fg={Colors.foreground} dim>
              → {f.target.replace("workers/", "")}: {f.flowType}
            </text>
          ))}
        </box>
      );
    } else {
      const infraNode = metadata.infrastructure[selectedNode];
      rightColumnContent = (
        <box flexDirection="column" flexGrow={1} overflow="hidden">
          <text bold fg={Colors.info} marginBottom={1}>
            {infraNode.label}
          </text>
          <text fg={Colors.foreground} marginBottom={1}>
            {infraNode.description}
          </text>

          <text bold fg={Colors.muted} marginTop={1}>
            BINDING
          </text>
          <text fg={Colors.accent} marginBottom={1}>
            {infraNode.bindingName}
          </text>

          <text bold fg={Colors.muted} marginTop={1}>
            TAGS
          </text>
          <box flexDirection="row" flexWrap="wrap" marginBottom={1}>
            {infraNode.tags.map((t) => (
              <text key={t} fg={Colors.info} marginRight={1}>
                #{t}
              </text>
            ))}
          </box>
        </box>
      );
    }
  } else {
    // Default flows view
    rightColumnContent = (
      <box flexDirection="column" flexGrow={1} overflow="hidden">
        {metadata.dataFlows.slice(0, 15).map((flow, idx) => (
          <box key={idx} flexDirection="column" marginBottom={1}>
            <box flexDirection="row">
              <text fg={Colors.success}>
                {flow.source.replace("workers/", "")}
              </text>
              <text fg={Colors.muted} marginX={1}>
                →
              </text>
              <text fg={Colors.info}>
                {flow.target.replace("workers/", "")}
              </text>
            </box>
            <text dim fg={Colors.muted}>
              {flow.flowType}
            </text>
          </box>
        ))}
        {metadata.dataFlows.length > 15 && (
          <text dim fg={Colors.muted}>
            ... and {metadata.dataFlows.length - 15} more flows
          </text>
        )}
      </box>
    );
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <ViewHeader
        title="EDGE TOPOLOGY"
        meta={
          <text fg={Colors.muted} dim>
            {`${workers.length} Workers • ${infra.length} Infrastructure Nodes • ${metadata.dataFlows.length} Data Flows`}
          </text>
        }
      />

      {/* Main Content */}
      <box flexDirection="row" flexGrow={1} paddingTop={1}>
        {/* Left Column: Communities & Nodes */}
        <box
          flexDirection="column"
          width="60%"
          paddingRight={2}
          borderRight
          borderStyle="single"
          borderColor={Colors.border}
        >
          {/* Communities Filter */}
          <box flexDirection="row" marginBottom={1} flexWrap="wrap">
            <text fg={Colors.muted} marginRight={1}>
              View:
            </text>
            <text
              fg={activeCommunity === null ? Colors.accent : Colors.text}
              bg={
                selectableItems[focusedIndex]?.id === null &&
                selectableItems[focusedIndex]?.type === "community"
                  ? Colors.muted
                  : undefined
              }
              bold={activeCommunity === null}
              marginRight={2}
            >
              [All]
            </text>
            {communities.map((c) => (
              <text
                key={c.id}
                fg={activeCommunity === c.id ? Colors.accent : Colors.text}
                bg={
                  selectableItems[focusedIndex]?.id === c.id &&
                  selectableItems[focusedIndex]?.type === "community"
                    ? Colors.muted
                    : undefined
                }
                bold={activeCommunity === c.id}
                marginRight={2}
              >
                [{c.label}]
              </text>
            ))}
          </box>

          {/* Workers Grid */}
          <text bold fg={Colors.success} marginBottom={1}>
            WORKERS
          </text>
          <box flexDirection="row" flexWrap="wrap" marginBottom={2}>
            {(activeCommunity
              ? workers.filter(([id]) =>
                  communities
                    .find((c) => c.id === activeCommunity)
                    ?.nodeIds.includes(`workspace:${id}`)
                )
              : workers
            ).map(([id, w]) => {
              const isFocused =
                selectableItems[focusedIndex]?.id === id &&
                selectableItems[focusedIndex]?.type === "worker";
              return (
                <box
                  key={id}
                  width="30%"
                  marginRight={1}
                  marginBottom={1}
                  padding={1}
                  borderStyle="rounded"
                  borderColor={
                    selectedNode === id
                      ? Colors.accent
                      : isFocused
                        ? Colors.foreground
                        : Colors.border
                  }
                  flexDirection="column"
                >
                  <text bold fg={w.isPublic ? Colors.warning : Colors.text}>
                    {id.replace("workers/", "")}
                  </text>
                  <text dim fg={Colors.muted}>
                    {w.category}
                  </text>
                  {w.smartPlacement && (
                    <text fg={Colors.success} dim>
                      ⚡ Smart Placement
                    </text>
                  )}
                </box>
              );
            })}
          </box>

          {/* Infrastructure Grid */}
          <text bold fg={Colors.info} marginBottom={1}>
            INFRASTRUCTURE
          </text>
          <box flexDirection="row" flexWrap="wrap">
            {(activeCommunity
              ? infra.filter(([id]) =>
                  communities
                    .find((c) => c.id === activeCommunity)
                    ?.nodeIds.includes(`infra:${id}`)
                )
              : infra
            ).map(([id, i]) => {
              const isFocused =
                selectableItems[focusedIndex]?.id === id &&
                selectableItems[focusedIndex]?.type === "infra";
              return (
                <box
                  key={id}
                  width="30%"
                  marginRight={1}
                  marginBottom={1}
                  padding={1}
                  borderStyle="rounded"
                  borderColor={
                    selectedNode === id
                      ? Colors.accent
                      : isFocused
                        ? Colors.foreground
                        : Colors.border
                  }
                  flexDirection="column"
                >
                  <text bold fg={Colors.info}>
                    {i.label}
                  </text>
                  <text dim fg={Colors.muted}>
                    {i.category}
                  </text>
                  <text dim fg={Colors.muted}>
                    {i.bindingName}
                  </text>
                </box>
              );
            })}
          </box>
        </box>

        {/* Right Column: Details & Flows */}
        <box flexDirection="column" width="40%" paddingLeft={2}>
          <text bold fg={Colors.accent} marginBottom={1}>
            {selectedNode ? "NODE DETAILS" : "SYSTEM FLOWS"}
          </text>
          {rightColumnContent}
        </box>
      </box>
    </box>
  );
}
