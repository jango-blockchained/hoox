"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { HooxIcon } from "@/components/ui/hoox-icon";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

function formatDateAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, "yyyy-MM-dd HH:mm");
}

function formatDateDisplay(iso: string): string {
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

function formatDateRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return formatDistanceToNowStrict(d, { addSuffix: true });
  } catch {
    return formatDateDisplay(iso);
  }
}

export function ReportsList() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | Report["type"]>("all");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const fetchReports = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const result = await api.getReports();
      if (result.success) {
        setReports(result.reports);
        setLastUpdatedAt(Date.now());
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
    void fetchReports();
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

  const typeCounts = useMemo(() => {
    let pdf = 0;
    let csv = 0;
    for (const r of reports) {
      if (r.type === "pdf") pdf += 1;
      else csv += 1;
    }
    return { pdf, csv };
  }, [reports]);

  const hasAnyReports = reports.length > 0;
  const hasAnyMatches = filtered.length > 0;
  const hasActiveFilters = typeFilter !== "all" || searchQuery.length > 0;

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
  };

  const handleDownload = async (report: Report) => {
    setDownloadingKey(report.key);
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
        description: `${report.name} · ${formatBytes(report.size)}`,
      });
    } catch (e) {
      toast.error("Download failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/reports/regenerate", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!res.ok || !body.success) {
        toast.error("Could not start report generation", {
          description:
            body.error ??
            body.message ??
            `Server returned ${res.status}. Report-worker may not be wired yet.`,
        });
        return;
      }

      toast.success("Report generation started", {
        description:
          body.message ??
          "The report-worker accepted the request. Refresh in a minute.",
      });
      // Soft refresh shortly after kick-off so newly written objects surface.
      window.setTimeout(() => {
        void fetchReports(true);
      }, 2500);
    } catch (e) {
      toast.error("Regenerate failed", {
        description: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm font-medium">
                Generated Reports
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {reports.length} total
              </Badge>
              {typeCounts.pdf > 0 && (
                <Badge
                  variant="outline"
                  className={cn("text-[10px]", typeMeta.pdf.className)}
                >
                  {typeCounts.pdf} PDF
                </Badge>
              )}
              {typeCounts.csv > 0 && (
                <Badge
                  variant="outline"
                  className={cn("text-[10px]", typeMeta.csv.className)}
                >
                  {typeCounts.csv} CSV
                </Badge>
              )}
              {lastUpdatedAt && (
                <span className="text-[10px] text-muted-foreground">
                  Updated{" "}
                  {formatDistanceToNowStrict(new Date(lastUpdatedAt), {
                    addSuffix: true,
                  })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-2"
                    onClick={() => void handleRegenerate()}
                    disabled={isRegenerating}
                    aria-label="Regenerate report now"
                  >
                    {isRegenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Regenerate
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Kick off an on-demand report via report-worker
                </TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-2"
                onClick={() => void fetchReports(true)}
                disabled={isRefreshing}
                aria-label="Refresh reports"
              >
                <RefreshCw
                  className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                />
                Refresh
              </Button>
            </div>
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
              <SelectTrigger
                className="h-9 w-[140px]"
                aria-label="Filter by type"
              >
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-2"
                onClick={clearFilters}
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div
              className="flex flex-col gap-2"
              aria-busy="true"
              aria-label="Loading reports"
            >
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText className="h-5 w-5 text-destructive" />
                </EmptyMedia>
                <EmptyTitle>Could not load reports</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchReports()}
                >
                  Try again
                </Button>
              </EmptyContent>
            </Empty>
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
                  Reports appear after the report-worker runs (cron: 06:00 and
                  18:00 UTC), or when you kick off an on-demand generation.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => void handleRegenerate()}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Generate now
                </Button>
              </EmptyContent>
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
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
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
                      const isDownloading = downloadingKey === report.key;
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
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default tabular-nums">
                                  {formatBytes(report.size)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {report.size.toLocaleString()} bytes
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <time
                                  dateTime={report.createdAt}
                                  className="cursor-default"
                                >
                                  <span className="block text-foreground/80">
                                    {formatDateRelative(report.createdAt)}
                                  </span>
                                  <span className="block text-[10px] opacity-80">
                                    {formatDateDisplay(report.createdAt)}
                                  </span>
                                </time>
                              </TooltipTrigger>
                              <TooltipContent>
                                {formatDateAbsolute(report.createdAt)}
                              </TooltipContent>
                            </Tooltip>
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
                                          {formatBytes(report.size)} (
                                          {report.size.toLocaleString()} B)
                                        </dd>
                                      </div>
                                      <div className="flex justify-between gap-3">
                                        <dt className="text-foreground/70">
                                          Created
                                        </dt>
                                        <dd className="text-foreground">
                                          {formatDateAbsolute(report.createdAt)}
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
                                onClick={() => void handleDownload(report)}
                                disabled={isDownloading}
                                aria-label={`Download ${report.name}`}
                              >
                                {isDownloading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                <span className="text-xs">
                                  {isDownloading ? "…" : "Download"}
                                </span>
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
    </TooltipProvider>
  );
}
