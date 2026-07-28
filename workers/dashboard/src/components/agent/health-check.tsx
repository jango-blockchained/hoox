"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HooxIcon } from "@/components/ui/hoox-icon";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface ProviderHealth {
  name: string;
  healthy: boolean;
  latency?: number;
  error?: string;
}

export function HealthCheck() {
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const fetchHealth = async (signal?: AbortSignal) => {
    setChecking(true);
    try {
      const res = await fetch("/api/agent/health", { signal });
      const data = (await res.json()) as {
        success: boolean;
        providers?: Record<string, ProviderHealth>;
      };
      if (data.success && data.providers) {
        setProviders(
          Object.entries(data.providers).map(([name, info]) => ({
            name,
            healthy: info.healthy,
            latency: info.latency,
            error: info.error,
          }))
        );
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Failed to fetch health status");
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal);
    return () => controller.abort();
  }, []);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Health Check</CardTitle>
          <CardDescription>AI provider health status</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchHealth()}
          disabled={checking}
        >
          <HooxIcon
            name="refresh"
            size="sm"
            className={checking ? "animate-spin" : ""}
            data-icon="inline-end"
          />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 bg-secondary/30 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant={p.healthy ? "default" : "destructive"}>
                      {p.healthy ? "Healthy" : "Error"}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.latency ? `${p.latency}ms` : "-"}</TableCell>
                  <TableCell>
                    {p.error && (
                      <span className="text-sm text-destructive">
                        {p.error}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
