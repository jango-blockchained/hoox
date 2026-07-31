"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ExternalLink,
  Code2,
  Wifi,
  WifiOff,
  Clock,
  Search,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "next-themes";
import { Fragment } from "react";
import { getBreadcrumbs, openCommandPalette } from "./sidebar-config";
import { Kbd } from "@/components/ui/kbd";

export function DashboardHeader() {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [latency, setLatency] = useState(12);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCurrentTime(new Date());
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    const latencyInterval = setInterval(() => {
      setLatency(Math.floor(Math.random() * 20) + 5);
    }, 5000);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(timeInterval);
      clearInterval(latencyInterval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const cycleTheme = useCallback(() => {
    const order = ["dark", "light", "system"] as const;
    const current = theme ?? "dark";
    const idx = order.indexOf(current as (typeof order)[number]);
    const next = order[(idx + 1) % order.length];
    setTheme(next);
  }, [theme, setTheme]);

  const ThemeIcon = !mounted
    ? Monitor
    : resolvedTheme === "dark"
      ? Moon
      : resolvedTheme === "light"
        ? Sun
        : Monitor;

  return (
    <TooltipProvider delayDuration={300}>
      <header className="sticky top-0 z-50 border-b border-border/80 bg-sidebar/90 backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/75">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
          {/* Left: sidebar trigger + breadcrumbs */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SidebarTrigger className="-ml-1" aria-label="Toggle sidebar" />
            <Separator
              orientation="vertical"
              className="mr-1 hidden h-4 sm:block"
            />

            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="flex-nowrap sm:gap-1.5">
                {breadcrumbs.map((crumb, i) => {
                  const isLast = i === breadcrumbs.length - 1;
                  return (
                    <Fragment key={`${crumb.label}-${i}`}>
                      {i > 0 && (
                        <BreadcrumbSeparator className="hidden sm:block" />
                      )}
                      <BreadcrumbItem
                        className={
                          i < breadcrumbs.length - 1
                            ? "hidden sm:inline-flex"
                            : "min-w-0"
                        }
                      >
                        {isLast || !crumb.href ? (
                          <BreadcrumbPage className="truncate max-w-[40vw] sm:max-w-none">
                            {crumb.label}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link href={crumb.href}>{crumb.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Center / status — desktop */}
          <div
            className="hidden items-center gap-2 md:flex"
            role="status"
            aria-label="System status"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex items-center gap-1.5 rounded-md bg-secondary/40 px-2.5 py-1"
                  aria-label={
                    isOnline ? "Connection online" : "Connection offline"
                  }
                >
                  {isOnline ? (
                    <>
                      <Wifi
                        className="size-3 text-success"
                        aria-hidden="true"
                      />
                      <span className="text-xs text-muted-foreground">
                        Online
                      </span>
                      <span
                        className="size-1.5 rounded-full bg-success animate-pulse motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    </>
                  ) : (
                    <>
                      <WifiOff
                        className="size-3 text-destructive"
                        aria-hidden="true"
                      />
                      <span className="text-xs text-destructive">Offline</span>
                    </>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Browser connection status</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="gap-1.5 font-mono text-[10px] tabular-nums"
                >
                  <Activity
                    className="size-3 text-success"
                    aria-hidden="true"
                  />
                  {latency}ms
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Estimated API latency</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                  <Clock className="size-3" aria-hidden="true" />
                  <span className="font-mono">
                    {currentTime
                      ? currentTime.toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })
                      : "--:--:--"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Local time</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Right: actions */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  onClick={() => openCommandPalette()}
                  aria-label="Open command palette"
                >
                  <Search className="size-4" aria-hidden="true" />
                  <span className="hidden lg:inline">Search</span>
                  <Kbd className="hidden font-mono text-[10px] lg:inline-flex">
                    ⌘K
                  </Kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Command palette</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={cycleTheme}
                  aria-label="Cycle theme"
                  className="text-muted-foreground"
                >
                  <ThemeIcon className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>
                  Theme: {mounted ? (theme ?? "system") : "…"} (click to cycle)
                </p>
              </TooltipContent>
            </Tooltip>

            <Button
              variant="ghost"
              size="sm"
              className="hidden gap-2 text-muted-foreground xl:flex"
              asChild
            >
              <a
                href="https://github.com/jango-blockchained/hoox-setup"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Code2 className="size-4" aria-hidden="true" />
                <span>Source</span>
              </a>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Visit</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <a
                    href="https://hoox.cryptolinx.workers.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Live Gateway
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href="https://dash.cloudflare.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Cloudflare Dashboard
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href="https://github.com/jango-blockchained/hoox-setup"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub Repository
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
