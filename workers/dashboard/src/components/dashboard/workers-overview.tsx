"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CFServiceBadge,
  CFServiceType,
} from "@/components/ui/cf-service-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  TrendingUp,
  Database,
  Brain,
  MessageSquare,
  Globe,
  Mail,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Worker {
  name: string;
  displayName: string;
  description: string;
  icon: typeof Shield;
  status: "active" | "idle" | "disabled";
  services?: CFServiceType[];
  metrics?: {
    requests?: number;
    latency?: number;
    cpu?: number;
  };
}

const initialWorkers: Worker[] = [
  {
    name: "hoox",
    displayName: "Gateway",
    description: "Webhook Receiver",
    icon: Shield,
    status: "active",
    services: [
      "Rate Limiting",
      "Queues",
      "Service Binding",
      "Durable Objects",
      "KV",
    ],
    metrics: { requests: 1247, latency: 12, cpu: 23 },
  },
  {
    name: "trade-worker",
    displayName: "Execution",
    description: "Trading Engine",
    icon: TrendingUp,
    status: "active",
    services: ["D1", "Queues", "KV", "R2", "Service Binding"],
    metrics: { requests: 856, latency: 8, cpu: 45 },
  },
  {
    name: "d1-worker",
    displayName: "Storage",
    description: "Database Operations",
    icon: Database,
    status: "active",
    services: ["D1", "Service Binding"],
    metrics: { requests: 3420, latency: 5, cpu: 18 },
  },
  {
    name: "agent-worker",
    displayName: "AI Agent",
    description: "Risk Manager",
    icon: Brain,
    status: "active",
    services: ["Workers AI", "D1", "Service Binding", "KV"],
    metrics: { requests: 124, latency: 145, cpu: 67 },
  },
  {
    name: "telegram-worker",
    displayName: "Telegram",
    description: "Notifications",
    icon: MessageSquare,
    status: "active",
    services: ["Service Binding", "R2", "KV", "Workers AI"],
    metrics: { requests: 89, latency: 25, cpu: 12 },
  },
  {
    name: "web3-wallet",
    displayName: "Web3",
    description: "On-Chain DEX",
    icon: Globe,
    status: "idle",
    services: ["Browser Rendering", "Service Binding"],
    metrics: { requests: 0, latency: 0, cpu: 0 },
  },

  {
    name: "email-worker",
    displayName: "Email",
    description: "IMAP Signals",
    icon: Mail,
    status: "disabled",
    services: ["Service Binding"],
  },
];

export function WorkersOverview() {
  const [workers, setWorkers] = useState(initialWorkers);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchAgentData = async () => {
      try {
        const res = await fetch("/api/agent/status", {
          signal: controller.signal,
        });
        const data = (await res.json()) as {
          success: boolean;
          status?: { killSwitch?: boolean };
        };
        if (data.success && data.status) {
          setWorkers((prev) =>
            prev.map((w) => {
              if (w.name === "agent-worker") {
                return {
                  ...w,
                  status: data.status?.killSwitch
                    ? ("idle" as const)
                    : ("active" as const),
                  metrics: {
                    ...w.metrics,
                    requests:
                      (w.metrics?.requests || 0) +
                      Math.floor(Math.random() * 5),
                  },
                };
              }
              return w;
            })
          );
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("Failed to fetch agent data", e);
      }
    };

    fetchAgentData();

    const interval = setInterval(() => {
      fetchAgentData();

      setWorkers((prev) =>
        prev.map((worker) => {
          if (
            worker.name === "agent-worker" ||
            worker.status !== "active" ||
            !worker.metrics
          )
            return worker;
          return {
            ...worker,
            metrics: {
              requests:
                (worker.metrics.requests || 0) + Math.floor(Math.random() * 5),
              latency: Math.max(
                1,
                (worker.metrics.latency || 0) + (Math.random() - 0.5) * 4
              ),
              cpu: Math.min(
                100,
                Math.max(
                  5,
                  (worker.metrics.cpu || 0) + (Math.random() - 0.5) * 10
                )
              ),
            },
          };
        })
      );
    }, 3000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const activeCount = workers.filter((w) => w.status === "active").length;
  const totalRequests = workers.reduce(
    (acc, w) => acc + (w.metrics?.requests || 0),
    0
  );

  return (
    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Hoox Framework</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {activeCount}/{workers.length} Active
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              onClick={handleRefresh}
            >
              <RefreshCw
                className={`size-3.5 text-muted-foreground ${isRefreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-secondary/30 p-3">
            <p className="text-xl font-bold text-foreground">
              {totalRequests.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">Total Requests</p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-3">
            <p className="text-xl font-bold text-foreground">
              {Math.round(
                workers
                  .filter((w) => w.metrics?.latency)
                  .reduce((acc, w) => acc + (w.metrics?.latency || 0), 0) /
                  activeCount
              )}
              ms
            </p>
            <p className="text-[10px] text-muted-foreground">Avg Latency</p>
          </div>
        </div>

        {/* Workers List */}
        <div className="flex flex-col gap-1.5">
          {workers.map((worker) => (
            <div key={worker.name}>
              <button
                onClick={() =>
                  setExpandedWorker(
                    expandedWorker === worker.name ? null : worker.name
                  )
                }
                className="flex w-full items-center justify-between rounded-lg bg-secondary/30 p-2.5 transition-all duration-300 hover:bg-secondary/50 hover:shadow-[0_0_15px_rgba(var(--primary),0.1)] hover:scale-[1.01]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-8 items-center justify-center rounded-lg transition-colors ${
                      worker.status === "active"
                        ? "bg-success/10"
                        : worker.status === "idle"
                          ? "bg-warning/10"
                          : "bg-secondary"
                    }`}
                  >
                    <worker.icon
                      className={`size-4 ${
                        worker.status === "active"
                          ? "text-success"
                          : worker.status === "idle"
                            ? "text-warning"
                            : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-medium text-foreground">
                      {worker.displayName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {worker.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {worker.metrics && worker.status === "active" && (
                    <motion.span
                      className="font-mono text-[10px] text-muted-foreground"
                      animate={{ opacity: [1, 0.6, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      {(worker.metrics?.latency ?? 0).toFixed(0)}ms
                    </motion.span>
                  )}
                  <motion.div
                    className={`size-2 rounded-full ${
                      worker.status === "active"
                        ? "bg-success shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                        : worker.status === "idle"
                          ? "bg-warning shadow-[0_0_8px_rgba(234,179,8,0.6)]"
                          : "bg-muted-foreground/50"
                    }`}
                    animate={
                      worker.status === "active"
                        ? {
                            scale: [1, 1.3, 1],
                            opacity: [1, 0.7, 1],
                          }
                        : worker.status === "idle"
                          ? { scale: [1, 1.2, 1] }
                          : {}
                    }
                    transition={{
                      duration: worker.status === "active" ? 1.5 : 2,
                      repeat: Infinity,
                    }}
                  />
                  <ChevronRight
                    className={`size-4 text-muted-foreground transition-transform ${
                      expandedWorker === worker.name ? "rotate-90" : ""
                    }`}
                  />
                </div>
              </button>

              <AnimatePresence>
                {expandedWorker === worker.name && worker.metrics && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 ml-11 rounded-lg bg-secondary/20 p-3 flex flex-col gap-3">
                      <div>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-muted-foreground">
                            CPU Usage
                          </span>
                          <span className="text-foreground">
                            {(worker.metrics?.cpu || 0).toFixed(0)}%
                          </span>
                        </div>
                        <Progress
                          value={worker.metrics?.cpu || 0}
                          className="h-1.5"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-[10px]">
                        <div>
                          <div className="flex justify-between items-end mb-1">
                            <span className="text-muted-foreground">
                              Requests
                            </span>
                            <p className="font-medium text-foreground">
                              {(worker.metrics?.requests || 0).toLocaleString()}
                            </p>
                          </div>
                          <div className="h-4 w-full flex items-end gap-[1px]">
                            {Array.from({ length: 20 }).map((_, i) => (
                              <motion.div
                                key={`req-${i}`}
                                className="w-full bg-primary/40 rounded-t-[1px]"
                                animate={{
                                  height: [
                                    `${Math.random() * 40 + 20}%`,
                                    `${Math.random() * 80 + 20}%`,
                                    `${Math.random() * 40 + 20}%`,
                                  ],
                                }}
                                transition={{
                                  duration: 1.5 + Math.random(),
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between items-end mb-1">
                            <span className="text-muted-foreground">
                              Latency
                            </span>
                            <p className="font-medium text-foreground">
                              {(worker.metrics?.latency || 0).toFixed(1)}ms
                            </p>
                          </div>
                          <div className="h-4 w-full flex items-end gap-[1px]">
                            {Array.from({ length: 20 }).map((_, i) => (
                              <motion.div
                                key={`lat-${i}`}
                                className="w-full bg-success/40 rounded-t-[1px]"
                                animate={{
                                  height: [
                                    `${Math.random() * 30 + 10}%`,
                                    `${Math.random() * 60 + 10}%`,
                                    `${Math.random() * 30 + 10}%`,
                                  ],
                                }}
                                transition={{
                                  duration: 2 + Math.random(),
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {worker.services && worker.services.length > 0 && (
                        <div className="pt-1">
                          <span className="text-[10px] text-muted-foreground mb-1.5 block">
                            Services Utilized
                          </span>
                          <div className="flex flex-nowrap overflow-x-auto scrollbar-none gap-1.5 pb-1">
                            {worker.services.map((service) => (
                              <CFServiceBadge
                                key={service}
                                service={service}
                                isActive={worker.status === "active"}
                                mini
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-[10px]">
                        <span className="text-muted-foreground">
                          Worker ID:{" "}
                        </span>
                        <code className="font-mono text-foreground">
                          {worker.name}
                        </code>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
