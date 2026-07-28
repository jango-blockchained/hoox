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
import { TrendingUp, TrendingDown } from "lucide-react";

const MOCK_STOPS = [
  {
    symbol: "BTCUSDT",
    side: "LONG",
    entry: 92000,
    current: 94500,
    stop: 89500,
  },
  { symbol: "ETHUSDT", side: "SHORT", entry: 3500, current: 3400, stop: 3700 },
];

export function TrailingStops() {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>Active Trailing Stops</CardTitle>
        <CardDescription>Currently monitored positions</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead>Current</TableHead>
              <TableHead>Stop</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_STOPS.map((stop) => (
              <TableRow key={stop.symbol}>
                <TableCell className="font-medium">{stop.symbol}</TableCell>
                <TableCell>
                  <Badge
                    variant={stop.side === "LONG" ? "default" : "destructive"}
                  >
                    {stop.side === "LONG" ? (
                      <>
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {stop.side}
                      </>
                    ) : (
                      <>
                        <TrendingDown className="h-3 w-3 mr-1" />
                        {stop.side}
                      </>
                    )}
                  </Badge>
                </TableCell>
                <TableCell>${stop.entry.toLocaleString()}</TableCell>
                <TableCell className="text-success">
                  ${stop.current.toLocaleString()}
                </TableCell>
                <TableCell className="text-destructive">
                  ${stop.stop.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
