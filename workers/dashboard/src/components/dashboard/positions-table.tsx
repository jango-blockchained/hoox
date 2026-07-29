"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpRight,
  ArrowDownRight,
  X,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { api, isTestnetPosition } from "@/lib/api";

interface Position {
  id: string | number;
  exchange: string;
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  status: string;
  openedAt: number;
  updatedAt: number;
}

const initialPositions: Position[] = [];

function formatTimeAgo(timestamp: number) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function PositionsTable() {
  const [positions, setPositions] = useState(initialPositions);
  const [closingPosition, setClosingPosition] = useState<
    string | number | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [sideFilter, setSideFilter] = useState("all");
  /** Default live-only so testnet rows do not pollute the main book view. */
  const [modeFilter, setModeFilter] = useState<"live" | "test" | "all">("live");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Simulate live price updates
  useEffect(() => {
    async function fetchPositions() {
      try {
        const data = await api.getPositions();
        if (data.success && data.positions) {
          setPositions(data.positions as Position[]);
        }
      } catch (error) {
        console.error("Failed to fetch positions:", error);
      }
    }

    fetchPositions();
    const interval = setInterval(fetchPositions, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleClosePosition = async (position: Position) => {
    setClosingPosition(position.id ?? null);
    const isTest = isTestnetPosition(position);
    try {
      const result = await api.closePosition(
        position.exchange,
        position.symbol,
        position.side,
        position.size,
        { test: isTest }
      );
      if (result.success) {
        setPositions((prev) =>
          prev.filter((p) => String(p.id) !== String(position.id))
        );
        toast.success(
          isTest ? "Testnet position closed" : "Position closed successfully",
          {
            description: `${position.symbol} on ${position.exchange}${isTest ? " (testnet)" : ""} has been closed.`,
          }
        );
      } else {
        toast.error("Failed to close position", {
          description: result.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error("Failed to close position", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setClosingPosition(null);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    async function fetchPositions() {
      try {
        const data = await api.getPositions();
        if (data.success && data.positions) {
          setPositions(data.positions as Position[]);
        }
      } catch (error) {
        console.error("Failed to fetch positions:", error);
      }
    }
    fetchPositions().finally(() => setIsRefreshing(false));
  };

  const filteredPositions = positions.filter((pos) => {
    const matchesSearch = pos.symbol
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesExchange =
      exchangeFilter === "all" || pos.exchange === exchangeFilter;
    const matchesSide = sideFilter === "all" || pos.side === sideFilter;
    const isTest = isTestnetPosition(pos);
    const matchesMode =
      modeFilter === "all" ||
      (modeFilter === "test" && isTest) ||
      (modeFilter === "live" && !isTest);
    return matchesSearch && matchesExchange && matchesSide && matchesMode;
  });

  // Summary metrics follow the active mode filter so live totals stay clean.
  const totalPnl = filteredPositions.reduce(
    (acc, pos) => acc + (pos.pnl || 0),
    0
  );
  const totalValue = filteredPositions.reduce(
    (acc, pos) => acc + (pos.currentPrice || 0) * pos.size,
    0
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm font-medium">
              Active Positions
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {filteredPositions.length} Open
              {modeFilter === "live"
                ? " (live)"
                : modeFilter === "test"
                  ? " (test)"
                  : ""}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-2"
            onClick={handleRefresh}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Summary Row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mt-4">
          <div className="rounded-lg bg-secondary/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total Value
            </p>
            <p className="text-lg font-bold text-foreground">
              $
              {totalValue.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Unrealized PnL
            </p>
            <p
              className={`text-lg font-bold ${totalPnl >= 0 ? "text-success" : "text-destructive"}`}
            >
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Winning
            </p>
            <p className="text-lg font-bold text-success flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              {positions.filter((p) => p.pnl > 0).length}
            </p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Losing
            </p>
            <p className="text-lg font-bold text-destructive flex items-center gap-1">
              <TrendingDown className="h-4 w-4" />
              {positions.filter((p) => p.pnl < 0).length}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={exchangeFilter} onValueChange={setExchangeFilter}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="Exchange" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Exchanges</SelectItem>
              <SelectItem value="binance">Binance</SelectItem>
              <SelectItem value="mexc">MEXC</SelectItem>
              <SelectItem value="bybit">Bybit</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sideFilter} onValueChange={setSideFilter}>
            <SelectTrigger className="w-[110px] h-9">
              <SelectValue placeholder="Side" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sides</SelectItem>
              <SelectItem value="LONG">Long</SelectItem>
              <SelectItem value="SHORT">Short</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={modeFilter}
            onValueChange={(v) => setModeFilter(v as "live" | "test" | "all")}
          >
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live">Live only</SelectItem>
              <SelectItem value="test">Testnet</SelectItem>
              <SelectItem value="all">Live + Test</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs text-muted-foreground">
                  Exchange
                </TableHead>
                <TableHead className="text-xs text-muted-foreground">
                  Symbol
                </TableHead>
                <TableHead className="text-xs text-muted-foreground">
                  Side
                </TableHead>
                <TableHead className="text-xs text-muted-foreground text-right">
                  Size
                </TableHead>
                <TableHead className="text-xs text-muted-foreground text-right">
                  Entry
                </TableHead>
                <TableHead className="text-xs text-muted-foreground text-right">
                  Current
                </TableHead>
                <TableHead className="text-xs text-muted-foreground text-right">
                  PnL
                </TableHead>
                <TableHead className="text-xs text-muted-foreground text-right">
                  Leverage
                </TableHead>
                <TableHead className="text-xs text-muted-foreground">
                  Updated
                </TableHead>
                <TableHead className="text-xs text-muted-foreground text-right">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {filteredPositions.map((position) => (
                  <motion.tr
                    key={position.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="group border-b border-border transition-colors hover:bg-secondary/30"
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs capitalize">
                          {position.exchange}
                        </Badge>
                        {isTestnetPosition(position) && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase tracking-wide"
                          >
                            TEST
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {position.symbol}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {position.side === "LONG" ? (
                          <ArrowUpRight className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <span
                          className={`text-xs font-medium ${
                            position.side === "LONG"
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          {position.side}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {position.size}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${position.entryPrice.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <motion.span
                        key={position.currentPrice}
                        initial={{
                          color:
                            position.pnl >= 0
                              ? "var(--color-success)"
                              : "var(--color-destructive)",
                        }}
                        animate={{ color: "var(--color-foreground)" }}
                        transition={{ duration: 0.5 }}
                      >
                        $
                        {position.currentPrice.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </motion.span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <motion.span
                          key={position.pnl}
                          className={`font-mono text-sm font-medium ${
                            position.pnl >= 0
                              ? "text-success"
                              : "text-destructive"
                          }`}
                          initial={{ scale: 1.1 }}
                          animate={{ scale: 1 }}
                        >
                          {position.pnl >= 0 ? "+" : ""}$
                          {position.pnl.toFixed(2)}
                        </motion.span>
                        <span
                          className={`text-xs ${
                            position.pnlPercent >= 0
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          {position.pnlPercent >= 0 ? "+" : ""}
                          {position.pnlPercent.toFixed(2)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className="text-xs">
                        {position.leverage}x
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTimeAgo(position.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                            disabled={closingPosition === position.id}
                          >
                            {closingPosition === position.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-1 text-xs">Close</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Close Position</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to close your{" "}
                              {position.symbol} {position.side.toLowerCase()}{" "}
                              position on {position.exchange}? Current PnL:{" "}
                              <span
                                className={
                                  position.pnl >= 0
                                    ? "text-success"
                                    : "text-destructive"
                                }
                              >
                                {position.pnl >= 0 ? "+" : ""}$
                                {position.pnl.toFixed(2)}
                              </span>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleClosePosition(position)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Close Position
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>

        {filteredPositions.length === 0 && (
          <EmptyState
            icon="positions"
            title="No positions found"
            description="Try adjusting your filters or open a new position"
          />
        )}
      </CardContent>
    </Card>
  );
}
