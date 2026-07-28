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
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";

interface ApiStatRow {
  endpoint: string;
  call_count: number;
  success_count: number;
  avg_latency_ms: number;
}

const EXCHANGES = ["Binance", "Bybit", "MEXC", "all"];

export function ApiStats() {
  const [data, setData] = useState<ApiStatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExchange, setSelectedExchange] = useState("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      try {
        const url = new URL(`/api/analytics/api-stats`, window.location.origin);
        if (selectedExchange !== "all") {
          url.searchParams.set("exchange", selectedExchange);
        }
        const res = await fetch(url.toString(), { signal: controller.signal });
        const json = (await res.json()) as {
          success: boolean;
          data?: ApiStatRow[];
        };
        if (json.success) {
          setData(json.data || []);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.error("Failed to fetch API stats:", error);
      } finally {
        setLoading(false);
      }
    }
    if (mounted) fetchData();
    return () => controller.abort();
  }, [selectedExchange, mounted]);

  if (!mounted) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.3 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>API Call Statistics</CardTitle>
                <CardDescription>
                  Latency and success rates by endpoint
                </CardDescription>
              </div>
            </div>
            <Select
              value={selectedExchange}
              onValueChange={setSelectedExchange}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXCHANGES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e === "all" ? "All Exchanges" : e}
                  </SelectItem>
                ))}
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
              No API call data available
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Avg Latency</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => {
                  const successRate =
                    row.call_count > 0
                      ? ((row.success_count / row.call_count) * 100).toFixed(1)
                      : "0";
                  const latency = row.avg_latency_ms
                    ? Math.round(row.avg_latency_ms)
                    : 0;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        {row.endpoint}
                      </TableCell>
                      <TableCell>{row.call_count}</TableCell>
                      <TableCell>
                        <span
                          className={
                            latency > 500
                              ? "text-destructive"
                              : latency > 200
                                ? "text-warning"
                                : ""
                          }
                        >
                          {latency}ms
                        </span>
                      </TableCell>
                      <TableCell>{successRate}%</TableCell>
                      <TableCell>
                        {Number(successRate) >= 95 ? (
                          <Badge variant="secondary">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            Good
                          </Badge>
                        ) : Number(successRate) >= 80 ? (
                          <Badge variant="outline">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            Fair
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <TrendingDown className="h-3 w-3 mr-1" />
                            Poor
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
