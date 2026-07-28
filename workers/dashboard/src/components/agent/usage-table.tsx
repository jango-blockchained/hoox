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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const PROVIDER_DATA = [
  {
    name: "workers-ai",
    requests: 850,
    tokens: 300000,
    avgLatency: 150,
    cost: "$0.00",
  },
  {
    name: "openai",
    requests: 320,
    tokens: 120000,
    avgLatency: 200,
    cost: "$9.60",
  },
  {
    name: "anthropic",
    requests: 77,
    tokens: 30000,
    avgLatency: 350,
    cost: "$2.75",
  },
];

export function UsageTable() {
  const totalRequests = PROVIDER_DATA.reduce((sum, p) => sum + p.requests, 0);
  const totalTokens = PROVIDER_DATA.reduce((sum, p) => sum + p.tokens, 0);
  const totalCost = PROVIDER_DATA.reduce(
    (sum, p) => sum + parseFloat(p.cost.replace("$", "")),
    0
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>Provider Breakdown</CardTitle>
        <CardDescription>Usage statistics by provider</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg bg-secondary/30 p-3">
            <p className="text-2xl font-bold">
              {totalRequests.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Total Requests</p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-3">
            <p className="text-2xl font-bold">{totalTokens.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Tokens</p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-3">
            <p className="text-2xl font-bold">${totalCost.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Est. Cost</p>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Requests</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Avg Latency</TableHead>
              <TableHead>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PROVIDER_DATA.map((provider) => (
              <TableRow key={provider.name}>
                <TableCell className="font-medium">
                  <Badge variant="outline">{provider.name}</Badge>
                </TableCell>
                <TableCell>{provider.requests.toLocaleString()}</TableCell>
                <TableCell>{provider.tokens.toLocaleString()}</TableCell>
                <TableCell>{provider.avgLatency}ms</TableCell>
                <TableCell>{provider.cost}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
