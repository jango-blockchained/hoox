"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { motion } from "framer-motion";

interface SignalOutcomeRow {
  source: string;
  signal_type: string;
  symbol: string;
  signal_count: number;
  avg_confidence: number;
}

export function SignalOutcomes() {
  const [data, setData] = useState<SignalOutcomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30d");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      try {
        const url = new URL(`/api/analytics/signals`, window.location.origin);
        if (timeRange !== "all") {
          const days = timeRange === "7d" ? 7 : 30;
          url.searchParams.set(
            "timeRange",
            new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
          );
        }
        const res = await fetch(url.toString(), { signal: controller.signal });
        const json = (await res.json()) as {
          success: boolean;
          data?: SignalOutcomeRow[];
        };
        if (json.success) {
          setData(json.data || []);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.error("Failed to fetch signal outcomes:", error);
      } finally {
        setLoading(false);
      }
    }
    if (mounted) fetchData();
    return () => controller.abort();
  }, [timeRange, mounted]);

  if (!mounted) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.4 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Signal Outcomes</CardTitle>
                <CardDescription>
                  Signal distribution by source and type
                </CardDescription>
              </div>
            </div>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-[200px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-muted-foreground">
              No signal data available
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Avg Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.source}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.signal_type}</Badge>
                    </TableCell>
                    <TableCell>{row.symbol}</TableCell>
                    <TableCell>{row.signal_count}</TableCell>
                    <TableCell>
                      <span
                        className={
                          row.avg_confidence >= 0.7
                            ? "text-success"
                            : row.avg_confidence >= 0.4
                              ? "text-warning"
                              : "text-destructive"
                        }
                      >
                        {(row.avg_confidence * 100).toFixed(0)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
