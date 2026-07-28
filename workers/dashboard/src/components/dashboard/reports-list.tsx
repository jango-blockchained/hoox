"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Download, Eye, RefreshCw, Search } from "lucide-react";
import { HooxIcon } from "@/components/ui/hoox-icon";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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

import { api, type Report } from "@/lib/api";
import { cn } from "@/lib/utils";

const typeMeta: Record<
  Report["type"],
  {
    label: string;
    className: string;
    icon: "file" | "chart";
  }
> = {
  pdf: {
    label: "PDF",
    className: "text-destructive border-destructive/30 bg-destructive/5",
    icon: "file" as const,
  },
  csv: {
    label: "CSV",
    className: "text-success border-success/30 bg-success/5",
    icon: "chart" as const,
  },
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    units.length - 1
  );
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportsList() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | Report["type"]>("all");
  const [error, setError] = useState<string | null>(null);

  const fetchReports = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const result = await api.getReports();
      if (result.success) {
        setReports(result.reports);
      } else {
        setError("Could not load reports. Please try again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const filtered = useMemo(
    () =>
      reports.filter((r) => {
        const matchesSearch = r.name
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === "all" || r.type === typeFilter;
        return matchesSearch && matchesType;
      }),
    [reports, searchQuery, typeFilter]
  );

  const hasAnyReports = reports.length > 0;
  const hasAnyMatches = filtered.length > 0;

  const handleDownload = async (report: Report) => {
    // The download endpoint currently returns 503 (the report-worker
    // R2 download is not yet wired up). Surface that as a toast so the
    // user gets a clear reason for the failure rather than a silent
    // navigation to a 503 HTML page. When the endpoint is live, the
    // fetch below will succeed and trigger a real download.
    try {
      const res = await fetch(
        `/api/reports/download?key=${encodeURIComponent(report.key)}`,
        { method: "GET" }
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error("Download unavailable", {
          description:
            body.error ?? `Server returned ${res.status}. Please retry later.`,
        });
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = report.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      toast.success("Download started", {
        description: report.name,
      });
    } catch (e) {
      toast.error("Download failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CardTitle className="text-sm font-medium">
            Generated Reports
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {reports.length} Total
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9"
              aria-label="Search reports by name"
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={(value) =>
              setTypeFilter(value as "all" | Report["type"])
            }
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-2"
            onClick={() => fetchReports(true)}
            disabled={isRefreshing}
            aria-label="Refresh reports"
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => fetchReports()}>
              Try again
            </Button>
          </div>
        ) : !hasAnyReports ? (
          <Empty>
            <EmptyMedia variant="icon">
              <HooxIcon
                name="file"
                size="md"
                className="text-muted-foreground"
              />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No reports yet</EmptyTitle>
              <EmptyDescription>
                They will appear here after the next report-worker run at 06:00
                / 18:00 UTC.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : !hasAnyMatches ? (
          <Empty>
            <EmptyMedia variant="icon">
              <HooxIcon
                name="search"
                size="md"
                className="text-muted-foreground"
              />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No matching reports</EmptyTitle>
              <EmptyDescription>
                Try adjusting your search or type filter.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs text-muted-foreground">
                    Name
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground">
                    Type
                  </TableHead>
                  <TableHead className="text-right text-xs text-muted-foreground">
                    Size
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground">
                    Created
                  </TableHead>
                  <TableHead className="text-right text-xs text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filtered.map((report) => {
                    const meta = typeMeta[report.type];
                    return (
                      <motion.tr
                        key={report.id}
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="group border-b border-border transition-colors hover:bg-secondary/30"
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <HooxIcon
                              name={meta.icon}
                              size="sm"
                              className="shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                            <span className="truncate" title={report.name}>
                              {report.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("text-xs", meta.className)}
                          >
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {formatBytes(report.size)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(report.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <HoverCard openDelay={150} closeDelay={100}>
                              <HoverCardTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7"
                                  aria-label={`View metadata for ${report.name}`}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-80">
                                <div className="flex flex-col gap-2 text-sm">
                                  <p className="font-medium text-foreground">
                                    {report.name}
                                  </p>
                                  <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
                                    <div className="flex justify-between gap-3">
                                      <dt className="text-foreground/70">
                                        Type
                                      </dt>
                                      <dd className="font-mono text-foreground">
                                        {meta.label}
                                      </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                      <dt className="text-foreground/70">
                                        Size
                                      </dt>
                                      <dd className="font-mono text-foreground">
                                        {formatBytes(report.size)}
                                      </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                      <dt className="text-foreground/70">
                                        Created
                                      </dt>
                                      <dd className="text-foreground">
                                        {formatDate(report.createdAt)}
                                      </dd>
                                    </div>
                                    <div className="flex flex-col gap-0.5 pt-1">
                                      <dt className="text-foreground/70">
                                        R2 Key
                                      </dt>
                                      <dd className="break-all font-mono text-foreground">
                                        {report.key}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1.5"
                              onClick={() => handleDownload(report)}
                              aria-label={`Download ${report.name}`}
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span className="text-xs">Download</span>
                            </Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
