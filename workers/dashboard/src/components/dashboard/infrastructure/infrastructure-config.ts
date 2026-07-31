/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Server, Layout, HardDrive, type LucideIcon } from "lucide-react";
import type { CFServiceType } from "@/components/ui/cf-service-badge";

// --- Types ---

export type ResourceKind = "worker" | "page" | "storage";
export type ResourceStatus = "active" | "inactive";

export interface InfrastructureResource {
  name: string;
  role: string;
  status: ResourceStatus;
  kind: ResourceKind;
  url?: string;
  /** Cloudflare services used by this resource (workers only). */
  services?: CFServiceType[];
  /** Storage backend label (D1, KV, R2, Vectorize) for storage entries. */
  storageType?: string;
  /** Optional live probe error from /api/workers/health. */
  healthError?: string;
  /** Optional epoch ms of last health sample. */
  lastChecked?: number;
}

export interface InfrastructureSection {
  title: string;
  description: string;
  icon: LucideIcon;
  resources: InfrastructureResource[];
}

// --- Sections ---

export const INFRASTRUCTURE_SECTIONS: InfrastructureSection[] = [
  {
    title: "Workers",
    description: "Deployed serverless functions",
    icon: Server,
    resources: [
      {
        name: "hoox",
        role: "Webhook Gateway",
        status: "active",
        kind: "worker",
        url: "https://hoox.cryptolinx.workers.dev",
        services: [
          "Rate Limiting",
          "Queues",
          "Service Binding",
          "Durable Objects",
          "KV",
        ],
      },
      {
        name: "trade-worker",
        role: "Execution Engine",
        status: "active",
        kind: "worker",
        url: "https://trade-worker.cryptolinx.workers.dev",
        services: ["D1", "Queues", "KV", "R2", "Service Binding"],
      },
      {
        name: "agent-worker",
        role: "AI Risk Manager",
        status: "active",
        kind: "worker",
        url: "https://agent-worker.cryptolinx.workers.dev",
        services: ["Workers AI", "D1", "Service Binding", "KV"],
      },
      {
        name: "telegram-worker",
        role: "Notifications",
        status: "active",
        kind: "worker",
        url: "https://telegram-worker.cryptolinx.workers.dev",
        services: ["Service Binding", "R2", "KV", "Workers AI"],
      },
      {
        name: "d1-worker",
        role: "Database Layer",
        status: "active",
        kind: "worker",
        url: "https://d1-worker.cryptolinx.workers.dev",
        services: ["D1", "Service Binding"],
      },
      {
        name: "email-worker",
        role: "IMAP Scanner",
        status: "active",
        kind: "worker",
        url: "https://email-worker.cryptolinx.workers.dev",
        services: ["Service Binding"],
      },
      {
        name: "web3-wallet-worker",
        role: "On-Chain DEX",
        status: "active",
        kind: "worker",
        url: "https://web3-wallet-worker.cryptolinx.workers.dev",
      },
    ],
  },
  {
    title: "Pages",
    description: "Deployed frontend applications",
    icon: Layout,
    resources: [
      {
        name: "dashboard",
        role: "Command Center UI",
        status: "active",
        kind: "page",
        url: "https://dashboard.cryptolinx.workers.dev",
      },
    ],
  },
  {
    title: "Storage & Databases",
    description: "Persistent data infrastructure",
    icon: HardDrive,
    resources: [
      {
        name: "trade_data",
        role: "D1 Relational Database",
        status: "active",
        kind: "storage",
        storageType: "D1",
      },
      {
        name: "my-rag-index",
        role: "Vectorize Database",
        status: "active",
        kind: "storage",
        storageType: "Vectorize",
      },
      {
        name: "trade-reports",
        role: "R2 Object Storage",
        status: "active",
        kind: "storage",
        storageType: "R2",
      },
      {
        name: "hoox_config",
        role: "KV Namespace",
        status: "active",
        kind: "storage",
        storageType: "KV",
      },
    ],
  },
];
