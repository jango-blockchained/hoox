"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CFServiceBadge,
  CFServiceType,
} from "@/components/ui/cf-service-badge";
import {
  Webhook,
  Split,
  Brain,
  Shield,
  BarChart3,
  Zap,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface Signal {
  id: string;
  symbol: string;
  action: "BUY" | "SELL";
  status: "pending" | "processing" | "completed" | "rejected";
  currentStage: number;
  startTime: number;
  splitInto?: number;
  aiScore?: number;
  riskApproved?: boolean;
  executed?: boolean;
}

const stages = [
  {
    id: 0,
    name: "Webhook",
    shortName: "Receive",
    icon: Webhook,
    worker: "webhook-worker",
    description: "Signal received from TradingView",
    color: "from-primary to-neutral-500",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/30",
    services: ["Rate Limiting", "Queues", "KV"] as CFServiceType[],
  },
  {
    id: 1,
    name: "Splitter",
    shortName: "Split",
    icon: Split,
    worker: "splitter-worker",
    description: "Split across exchanges",
    color: "from-blue-500 to-cyan-500",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/30",
    services: ["Service Binding", "Durable Objects"] as CFServiceType[],
  },
  {
    id: 2,
    name: "AI Analysis",
    shortName: "Analyze",
    icon: Brain,
    worker: "ai-worker",
    description: "ML model evaluation",
    color: "from-purple-500 to-pink-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    services: ["Workers AI", "Vectorize"] as CFServiceType[],
  },
  {
    id: 3,
    name: "Risk Check",
    shortName: "Validate",
    icon: Shield,
    worker: "risk-worker",
    description: "Risk parameters validation",
    color: "from-emerald-500 to-green-500",
    bgColor: "bg-success/10",
    borderColor: "border-success/30",
    services: ["D1", "KV"] as CFServiceType[],
  },
  {
    id: 4,
    name: "Position",
    shortName: "Manage",
    icon: BarChart3,
    worker: "position-worker",
    description: "Position sizing & management",
    color: "from-neutral-500 to-primary",
    bgColor: "bg-warning/10",
    borderColor: "border-warning/30",
    services: ["D1"] as CFServiceType[],
  },
  {
    id: 5,
    name: "Execute",
    shortName: "Trade",
    icon: Zap,
    worker: "execution-worker",
    description: "Order execution on exchange",
    color: "from-red-500 to-rose-500",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/30",
    services: ["Service Binding", "R2"] as CFServiceType[],
  },
];

const symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "LINK/USDT"];

function generateSignal(): Signal {
  return {
    id: Math.random().toString(36).substr(2, 9),
    symbol: symbols[Math.floor(Math.random() * symbols.length)],
    action: Math.random() > 0.5 ? "BUY" : "SELL",
    status: "pending",
    currentStage: -1,
    startTime: Date.now(),
  };
}

function StageNode({
  stage,
  isActive,
  isProcessing,
  stats,
}: {
  stage: (typeof stages)[0];
  isActive: boolean;
  isProcessing: boolean;
  stats: { processed: number; latency: number };
}) {
  const Icon = stage.icon;

  return (
    <motion.div
      className="relative flex flex-col items-center"
      animate={isProcessing ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 0.5, repeat: isProcessing ? Infinity : 0 }}
    >
      {/* Glow effect */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${stage.color} blur-xl opacity-10`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0.05, 0.15, 0.05], scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity }}
          />
        )}
      </AnimatePresence>

      {/* Main node */}
      <motion.div
        className={`relative flex h-16 w-16 items-center justify-center rounded-2xl border-2 transition-all duration-300 ${
          isProcessing
            ? `${stage.bgColor} ${stage.borderColor} shadow-lg`
            : isActive
              ? `${stage.bgColor} ${stage.borderColor}`
              : "bg-secondary/50 border-border"
        }`}
        whileHover={{ scale: 1.1 }}
      >
        <Icon
          className={`h-7 w-7 transition-colors duration-300 ${
            isProcessing || isActive
              ? "text-foreground"
              : "text-muted-foreground"
          }`}
        />

        {/* Processing indicator */}
        {isProcessing && (
          <motion.div
            className={`absolute -inset-1 rounded-2xl border-2 ${stage.borderColor}`}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 0.8, ease: "easeInOut", repeat: Infinity }}
          />
        )}
      </motion.div>

      {/* Stage name */}
      <span className="mt-2 text-xs font-medium text-foreground">
        {stage.shortName}
      </span>

      {/* Stats */}
      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{stats.processed}</span>
        <span className="text-muted-foreground/50">|</span>
        <span>{stats.latency}ms</span>
      </div>

      {/* Services */}
      {stage.services && stage.services.length > 0 && (
        <div className="mt-2 flex flex-nowrap overflow-x-auto scrollbar-none justify-start gap-1 w-full max-w-[80px] px-1 pb-1">
          {stage.services.map((service) => (
            <CFServiceBadge
              key={service}
              service={service}
              isActive={isProcessing}
              mini
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ConnectionLine({
  fromStage,
  isActive,
  hasSignal,
}: {
  fromStage: number;
  isActive: boolean;
  hasSignal: boolean;
}) {
  return (
    <div className="relative flex-1 flex items-center justify-center px-1">
      {/* Background line */}
      <div className="absolute h-0.5 w-full bg-border/50 rounded-full" />

      {/* Active line */}
      <motion.div
        className={`absolute h-0.5 rounded-full bg-gradient-to-r ${stages[fromStage].color}`}
        initial={{ width: "0%" }}
        animate={{ width: isActive ? "100%" : "0%" }}
        transition={{ duration: 0.3 }}
      />

      {/* Arrow */}
      <ArrowRight
        className={`relative z-10 h-4 w-4 transition-colors duration-300 ${
          isActive ? "text-foreground" : "text-muted-foreground/30"
        }`}
      />

      {/* Signal pulse */}
      <AnimatePresence>
        {hasSignal && (
          <motion.div
            className={`absolute h-2 w-2 rounded-full bg-gradient-to-r ${stages[fromStage].color}`}
            initial={{ left: "0%", opacity: 1 }}
            animate={{ left: "100%", opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "linear" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function SignalFlowVisualization() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [stageStats, setStageStats] = useState(
    stages.map(() => ({
      processed: 0,
      latency: Math.floor(Math.random() * 30) + 10,
    }))
  );
  const [completedSignals, setCompletedSignals] = useState<{
    successful: number;
    rejected: number;
  }>({ successful: 0, rejected: 0 });

  // Process signals through stages
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setSignals((prev) => {
        const updated = prev.map((signal) => {
          if (signal.currentStage < stages.length - 1) {
            const nextStage = signal.currentStage + 1;

            // Random rejection at risk stage
            if (nextStage === 3 && Math.random() < 0.15) {
              return {
                ...signal,
                status: "rejected" as const,
                riskApproved: false,
              };
            }

            // Update stats
            setStageStats((stats) =>
              stats.map((s, i) =>
                i === nextStage
                  ? {
                      processed: s.processed + 1,
                      latency: Math.floor(Math.random() * 30) + 10,
                    }
                  : s
              )
            );

            // Add AI score at AI stage
            if (nextStage === 2) {
              return {
                ...signal,
                currentStage: nextStage,
                aiScore: Math.floor(Math.random() * 30) + 70,
              };
            }

            // Mark as completed at final stage
            if (nextStage === stages.length - 1) {
              setCompletedSignals((c) => ({
                ...c,
                successful: c.successful + 1,
              }));
              return {
                ...signal,
                currentStage: nextStage,
                status: "completed" as const,
                executed: true,
              };
            }

            return {
              ...signal,
              currentStage: nextStage,
              status: "processing" as const,
            };
          }
          return signal;
        });

        // Remove completed/rejected signals after delay
        return updated.filter(
          (s) =>
            !(
              (s.status === "completed" || s.status === "rejected") &&
              Date.now() - s.startTime > 5000
            )
        );
      });
    }, 600);

    return () => clearInterval(interval);
  }, [isRunning]);

  // Generate new signals
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(
      () => {
        if (signals.length < 5) {
          setSignals((prev) => [...prev, generateSignal()]);
        }
      },
      2000 + Math.random() * 2000
    );

    return () => clearInterval(interval);
  }, [isRunning, signals.length]);

  // Start initial signal
  useEffect(() => {
    if (signals.length === 0 && isRunning) {
      setSignals([generateSignal()]);
    }
  }, [signals.length, isRunning]);

  const handleReset = useCallback(() => {
    setSignals([]);
    setStageStats(
      stages.map(() => ({
        processed: 0,
        latency: Math.floor(Math.random() * 30) + 10,
      }))
    );
    setCompletedSignals({ successful: 0, rejected: 0 });
  }, []);

  const activeStages = new Set(signals.map((s) => s.currentStage));
  const processingStages = new Set(
    signals.filter((s) => s.status === "processing").map((s) => s.currentStage)
  );

  return (
    <Card className="overflow-hidden border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">
              Signal Flow Pipeline
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Real-time visualization of signal processing through workers
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Stats badges */}
            <Badge
              variant="outline"
              className="gap-1 border-success/30 text-success"
            >
              <CheckCircle2 className="h-3 w-3" />
              {completedSignals.successful}
            </Badge>
            <Badge
              variant="outline"
              className="gap-1 border-destructive/30 text-destructive"
            >
              <XCircle className="h-3 w-3" />
              {completedSignals.rejected}
            </Badge>

            {/* Controls */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRunning(!isRunning)}
              className="gap-1.5"
            >
              {isRunning ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {isRunning ? "Pause" : "Play"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {/* Main visualization */}
        <div className="relative rounded-xl border border-border bg-secondary/20 p-6">
          {/* Stage nodes and connections */}
          <div className="flex items-center justify-between">
            {stages.map((stage, index) => (
              <div
                key={stage.id}
                className="flex items-center"
                style={{ flex: index < stages.length - 1 ? 1 : 0 }}
              >
                <StageNode
                  stage={stage}
                  isActive={
                    activeStages.has(index) || stageStats[index].processed > 0
                  }
                  isProcessing={processingStages.has(index)}
                  stats={stageStats[index]}
                />
                {index < stages.length - 1 && (
                  <ConnectionLine
                    fromStage={index}
                    isActive={stageStats[index].processed > 0}
                    hasSignal={signals.some(
                      (s) =>
                        s.currentStage === index && s.status === "processing"
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Active signals queue */}
          <div className="mt-6 flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              Active Signals:
            </span>
            <div className="flex flex-wrap gap-2">
              <AnimatePresence mode="popLayout">
                {signals.map((signal) => (
                  <motion.div
                    key={signal.id}
                    initial={{ opacity: 0, scale: 0.8, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: -10 }}
                    layout
                  >
                    <Badge
                      variant="outline"
                      className={`gap-1.5 ${
                        signal.status === "completed"
                          ? "border-success/30 bg-success/10 text-success"
                          : signal.status === "rejected"
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : signal.action === "BUY"
                              ? "border-success/30 text-success"
                              : "border-destructive/30 text-destructive"
                      }`}
                    >
                      {signal.status === "completed" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : signal.status === "rejected" ? (
                        <XCircle className="h-3 w-3" />
                      ) : (
                        <motion.div
                          className="h-1.5 w-1.5 rounded-full bg-current"
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        />
                      )}
                      <span className="font-medium">{signal.action}</span>
                      <span className="text-muted-foreground">
                        {signal.symbol.split("/")[0]}
                      </span>
                      {signal.aiScore && (
                        <span className="text-purple-400">
                          AI:{signal.aiScore}%
                        </span>
                      )}
                      <span className="text-muted-foreground/60">
                        @
                        {stages[Math.max(0, signal.currentStage)]?.shortName ||
                          "Queue"}
                      </span>
                    </Badge>
                  </motion.div>
                ))}
              </AnimatePresence>
              {signals.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  No active signals
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Worker details grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stages.map((stage, index) => {
            const stats = stageStats[index];
            const isActive = processingStages.has(index);
            const Icon = stage.icon;

            return (
              <motion.div
                key={stage.id}
                className={`rounded-lg border p-3 transition-all ${
                  isActive
                    ? `${stage.bgColor} ${stage.borderColor}`
                    : "border-border bg-secondary/30"
                }`}
                animate={isActive ? { scale: [1, 1.02, 1] } : {}}
                transition={{ duration: 0.5 }}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={`h-4 w-4 ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                  />
                  <span className="text-xs font-medium">{stage.name}</span>
                </div>
                <div className="mt-2 text-lg font-bold tabular-nums">
                  {stats.processed}
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>processed</span>
                  <span className="tabular-nums">{stats.latency}ms</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
