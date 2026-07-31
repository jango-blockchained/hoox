"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useTransition, useCallback } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Send,
  Hash,
  AlertTriangle,
  Info,
  AlertCircle,
  CheckCircle2,
  Inbox,
  Loader2,
  RefreshCw,
  Radio,
  FileText,
  Activity,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

// ── Zod schema (mirrors server-side validation) ────────────────────────
//
// Kept in sync with `workers/dashboard/src/app/api/notifications/send/route.ts`.
// The client validates first to give instant feedback; the server re-validates
// as the source of truth (Zod v4 at every external boundary).
const NotificationLevelSchema = z.enum(["info", "warning", "error", "success"]);
const NotificationFormSchema = z.object({
  chatId: z
    .string()
    .min(1, "Chat ID is required")
    .regex(/^-?\d+$/u, "Chat ID must be numeric (Telegram chat ID)"),
  level: NotificationLevelSchema,
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or less"),
  message: z
    .string()
    .min(1, "Message body is required")
    .max(4000, "Message must be 4000 characters or less"),
});

type NotificationLevel = z.infer<typeof NotificationLevelSchema>;
type NotificationFormValues = z.infer<typeof NotificationFormSchema>;

interface RecentAlert {
  id?: string;
  level: NotificationLevel | "info";
  title: string;
  message: string;
  timestamp: number;
  source?: "dashboard-tester" | "telegram-worker";
  status?: "sent" | "failed" | "local";
}

const CHAT_ID_STORAGE_KEY = "hoox.notifications.chatId";
const RECENT_STORAGE_KEY = "hoox.notifications.recent";
const MAX_RECENT = 20;

const LEVEL_OPTIONS: ReadonlyArray<{
  value: NotificationLevel;
  label: string;
  icon: typeof Info;
  description: string;
}> = [
  {
    value: "info",
    label: "Info",
    icon: Info,
    description: "General information (blue dot)",
  },
  {
    value: "warning",
    label: "Warning",
    icon: AlertTriangle,
    description: "Caution state (yellow dot)",
  },
  {
    value: "error",
    label: "Error",
    icon: AlertCircle,
    description: "Failure or critical event (red dot)",
  },
  {
    value: "success",
    label: "Success",
    icon: CheckCircle2,
    description: "Positive outcome (green dot)",
  },
];

const TEMPLATES: ReadonlyArray<{
  id: string;
  label: string;
  level: NotificationLevel;
  title: string;
  message: string;
}> = [
  {
    id: "health-check",
    label: "Health check",
    level: "info",
    title: "System health check",
    message:
      "Dashboard notification channel test.\n\nIf you received this, telegram-worker delivery is healthy.",
  },
  {
    id: "worker-down",
    label: "Worker alert",
    level: "error",
    title: "Worker unreachable",
    message:
      "A worker failed its health check.\n\nAction: inspect Cloudflare Workers logs and restart if needed.",
  },
  {
    id: "trade-filled",
    label: "Trade filled",
    level: "success",
    title: "Trade filled",
    message:
      "Order filled successfully.\n\nSymbol: BTC/USDT\nSide: LONG\nSize: (edit me)",
  },
  {
    id: "risk-warning",
    label: "Risk warning",
    level: "warning",
    title: "Risk threshold approaching",
    message:
      "Portfolio risk is nearing configured limits.\n\nReview open positions and reduce exposure if necessary.",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function levelClasses(level: NotificationLevel | "info"): {
  badge: string;
  indicator: string;
  border: string;
  iconColor: string;
} {
  switch (level) {
    case "success":
      return {
        badge: "bg-success/10 text-success border-success/30",
        indicator: "bg-success",
        border: "border-success/30",
        iconColor: "text-success",
      };
    case "warning":
      return {
        badge: "bg-warning/10 text-warning-foreground border-warning/30",
        indicator: "bg-warning",
        border: "border-warning/30",
        iconColor: "text-warning",
      };
    case "error":
      return {
        badge: "bg-destructive/10 text-destructive border-destructive/30",
        indicator: "bg-destructive",
        border: "border-destructive/30",
        iconColor: "text-destructive",
      };
    case "info":
    default:
      return {
        badge: "bg-primary/10 text-primary border-primary/30",
        indicator: "bg-primary",
        border: "border-primary/30",
        iconColor: "text-primary",
      };
  }
}

function formatTimestamp(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      month: "short",
      day: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString();
  }
}

function formatRelative(timestamp: number): string {
  try {
    return formatDistanceToNowStrict(new Date(timestamp), { addSuffix: true });
  } catch {
    return formatTimestamp(timestamp);
  }
}

function readStoredChatId(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(CHAT_ID_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredChatId(value: string): void {
  try {
    if (value) sessionStorage.setItem(CHAT_ID_STORAGE_KEY, value);
    else sessionStorage.removeItem(CHAT_ID_STORAGE_KEY);
  } catch {
    // private mode / quota — ignore
  }
}

function readStoredRecent(): RecentAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is RecentAlert =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as RecentAlert).title === "string" &&
          typeof (item as RecentAlert).message === "string" &&
          typeof (item as RecentAlert).timestamp === "number"
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function writeStoredRecent(alerts: RecentAlert[]): void {
  try {
    sessionStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify(alerts.slice(0, MAX_RECENT))
    );
  } catch {
    // ignore
  }
}

// ── Component ───────────────────────────────────────────────────────────

export function NotificationTester() {
  const [chatId, setChatId] = useState("");
  const [level, setLevel] = useState<NotificationLevel>("info");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof NotificationFormValues, string>>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message?: string;
  } | null>(null);

  const [recent, setRecent] = useState<RecentAlert[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [channelNote, setChannelNote] = useState<string | null>(null);
  const [channelReachable, setChannelReachable] = useState<
    "unknown" | "ok" | "degraded"
  >("unknown");
  const [isPending, startTransition] = useTransition();
  const [hydrated, setHydrated] = useState(false);

  // Hydrate session-scoped form defaults
  useEffect(() => {
    setChatId(readStoredChatId());
    setRecent(readStoredRecent());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeStoredChatId(chatId);
  }, [chatId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeStoredRecent(recent);
  }, [recent, hydrated]);

  const loadRecent = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingRecent(true);
    try {
      const res = await fetch("/api/notifications/recent", { signal });
      if (!res.ok) {
        if (res.status === 401) {
          setChannelReachable("degraded");
          setChannelNote("Session unauthorized — re-login may be required.");
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed to load alerts (${res.status})`);
      }
      const data = (await res.json()) as {
        success: boolean;
        alerts?: RecentAlert[];
        note?: string;
        channel?: { status?: string };
      };
      setChannelNote(data.note ?? null);
      setChannelReachable(data.success ? "ok" : "degraded");
      // Merge server history (when available) with session-local echoes.
      const serverAlerts = Array.isArray(data.alerts) ? data.alerts : [];
      setRecent((prev) => {
        if (serverAlerts.length === 0) return prev;
        const byId = new Map<string, RecentAlert>();
        for (const a of [...serverAlerts, ...prev]) {
          const key = a.id ?? `${a.timestamp}-${a.title}`;
          if (!byId.has(key)) byId.set(key, a);
        }
        return Array.from(byId.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_RECENT);
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Failed to load recent alerts:", err);
      setChannelReachable("degraded");
      setChannelNote(
        err instanceof Error ? err.message : "Could not reach notification API"
      );
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRecent(controller.signal);
    return () => controller.abort();
  }, [loadRecent]);

  const applyTemplate = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setLevel(template.level);
    setTitle(template.title);
    setMessage(template.message);
    setFieldErrors((prev) => ({
      ...prev,
      level: undefined,
      title: undefined,
      message: undefined,
    }));
    setLastResult(null);
    setSubmitError(null);
    toast.message("Template applied", { description: template.label });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setLastResult(null);

    const candidate = { chatId, level, title, message };
    const parsed = NotificationFormSchema.safeParse(candidate);
    if (!parsed.success) {
      const errors: Partial<Record<keyof NotificationFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in errors)) {
          (errors as Record<string, string>)[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      try {
        const res = await fetch("/api/notifications/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });

        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
          error?: string;
        };

        if (!res.ok || !data.success) {
          const errMsg = data.error ?? `Send failed (${res.status})`;
          setSubmitError(errMsg);
          setLastResult({ success: false, message: errMsg });
          setChannelReachable("degraded");
          toast.error("Failed to send notification", { description: errMsg });

          const failedEcho: RecentAlert = {
            id: `failed-${Date.now()}`,
            level: parsed.data.level,
            title: parsed.data.title,
            message: parsed.data.message,
            timestamp: Date.now(),
            source: "dashboard-tester",
            status: "failed",
          };
          setRecent((prev) => [failedEcho, ...prev].slice(0, MAX_RECENT));
          return;
        }

        setLastResult({ success: true, message: data.message });
        setChannelReachable("ok");
        toast.success("Notification sent", {
          description: data.message ?? "Telegram delivery accepted",
        });

        const echo: RecentAlert = {
          id: `local-${Date.now()}`,
          level: parsed.data.level,
          title: parsed.data.title,
          message: parsed.data.message,
          timestamp: Date.now(),
          source: "dashboard-tester",
          status: "sent",
        };
        setRecent((prev) => [echo, ...prev].slice(0, MAX_RECENT));

        // Keep chat ID + title for follow-up tests; clear body only.
        setMessage("");
        void loadRecent();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Network error";
        setSubmitError(errMsg);
        setLastResult({ success: false, message: errMsg });
        setChannelReachable("degraded");
        toast.error("Network error", { description: errMsg });
      }
    });
  };

  const channelStatusLabel =
    channelReachable === "ok"
      ? "Reachable"
      : channelReachable === "degraded"
        ? "Degraded"
        : "Unknown";

  const channelStatusClass =
    channelReachable === "ok"
      ? "bg-success/10 text-success border-success/30"
      : channelReachable === "degraded"
        ? "bg-warning/10 text-warning border-warning/30"
        : "bg-muted text-muted-foreground border-border";

  return (
    <div className="flex flex-col gap-6">
      {/* Channel status strip */}
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md border border-border bg-secondary/40 p-2">
              <Radio className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  Telegram delivery channel
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] uppercase tracking-wider",
                    channelStatusClass
                  )}
                >
                  <span
                    className={cn(
                      "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                      channelReachable === "ok"
                        ? "bg-success"
                        : channelReachable === "degraded"
                          ? "bg-warning"
                          : "bg-muted-foreground"
                    )}
                    aria-hidden="true"
                  />
                  {channelStatusLabel}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {channelNote ??
                  "Send a test message to verify telegram-worker connectivity and auth."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              {recent.filter((a) => a.status !== "failed").length} sent this
              session
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── LEFT: Send Test Notification ──────────────────────────────── */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-primary" aria-hidden="true" />
              Send Test Notification
            </CardTitle>
            <CardDescription>
              Deliver a message through the telegram-worker to verify the
              channel is healthy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-6"
              noValidate
            >
              {/* Templates */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Quick templates
                </div>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Notification templates"
                >
                  {TEMPLATES.map((t) => (
                    <Button
                      key={t.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => applyTemplate(t.id)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
              </div>

              <FieldGroup>
                <Field data-invalid={Boolean(fieldErrors.chatId) || undefined}>
                  <FieldLabel htmlFor="chat-id">Target chat ID</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>
                        <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="font-mono text-xs">chat</span>
                      </InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="chat-id"
                      name="chatId"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="123456789"
                      value={chatId}
                      onChange={(e) => {
                        setChatId(e.target.value);
                        if (fieldErrors.chatId) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            chatId: undefined,
                          }));
                        }
                      }}
                      aria-invalid={Boolean(fieldErrors.chatId) || undefined}
                    />
                  </InputGroup>
                  <FieldDescription>
                    Numeric Telegram chat ID. Negative IDs are supported (groups
                    / channels). Remembered for this session.
                  </FieldDescription>
                  {fieldErrors.chatId && (
                    <FieldError>{fieldErrors.chatId}</FieldError>
                  )}
                </Field>

                <Field data-invalid={Boolean(fieldErrors.level) || undefined}>
                  <FieldLabel htmlFor="level">Message level</FieldLabel>
                  <Select
                    value={level}
                    onValueChange={(value) => {
                      setLevel(value as NotificationLevel);
                      if (fieldErrors.level) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          level: undefined,
                        }));
                      }
                    }}
                  >
                    <SelectTrigger id="level" className="bg-secondary/50">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVEL_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <span className="flex items-center gap-2">
                              <Icon
                                className={cn(
                                  "h-3.5 w-3.5",
                                  levelClasses(option.value).iconColor
                                )}
                                aria-hidden="true"
                              />
                              {option.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Determines the icon and color used in the Telegram message.
                  </FieldDescription>
                  {fieldErrors.level && (
                    <FieldError>{fieldErrors.level}</FieldError>
                  )}
                </Field>

                <Field data-invalid={Boolean(fieldErrors.title) || undefined}>
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="title">Title</FieldLabel>
                    <span
                      className={cn(
                        "font-mono text-[10px] text-muted-foreground",
                        title.length > 180 && "text-warning",
                        title.length > 200 && "text-destructive"
                      )}
                    >
                      {title.length}/200
                    </span>
                  </div>
                  <Input
                    id="title"
                    name="title"
                    type="text"
                    autoComplete="off"
                    placeholder="System check"
                    value={title}
                    maxLength={220}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (fieldErrors.title) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          title: undefined,
                        }));
                      }
                    }}
                    className="bg-secondary/50"
                    aria-invalid={Boolean(fieldErrors.title) || undefined}
                  />
                  <FieldDescription>
                    Short headline shown at the top of the message.
                  </FieldDescription>
                  {fieldErrors.title && (
                    <FieldError>{fieldErrors.title}</FieldError>
                  )}
                </Field>

                <Field data-invalid={Boolean(fieldErrors.message) || undefined}>
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="message">Message body</FieldLabel>
                    <span
                      className={cn(
                        "font-mono text-[10px] text-muted-foreground",
                        message.length > 3600 && "text-warning",
                        message.length > 4000 && "text-destructive"
                      )}
                    >
                      {message.length}/4000
                    </span>
                  </div>
                  <Textarea
                    id="message"
                    name="message"
                    placeholder="Describe the alert details…"
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      if (fieldErrors.message) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          message: undefined,
                        }));
                      }
                    }}
                    className="min-h-[140px] resize-y bg-secondary/50 font-mono text-sm"
                    aria-invalid={Boolean(fieldErrors.message) || undefined}
                  />
                  <FieldDescription>
                    Full message body. Supports Telegram MarkdownV2 in the
                    telegram-worker.
                  </FieldDescription>
                  {fieldErrors.message && (
                    <FieldError>{fieldErrors.message}</FieldError>
                  )}
                </Field>
              </FieldGroup>

              <div className="flex flex-col gap-3">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="self-end gap-2"
                  data-icon="inline-start"
                >
                  {isPending ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Test Notification
                    </>
                  )}
                </Button>

                {lastResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <Alert
                      variant={lastResult.success ? "default" : "destructive"}
                      className={cn(
                        lastResult.success
                          ? "border-success/30 bg-success/10 text-foreground"
                          : undefined
                      )}
                    >
                      {lastResult.success ? (
                        <CheckCircle2
                          className="text-success"
                          aria-hidden="true"
                        />
                      ) : (
                        <AlertCircle aria-hidden="true" />
                      )}
                      <AlertTitle>
                        {lastResult.success
                          ? "Notification accepted"
                          : "Send failed"}
                      </AlertTitle>
                      <AlertDescription>
                        {lastResult.message ??
                          (lastResult.success
                            ? "The telegram-worker acknowledged the message."
                            : "Check the server logs for details.")}
                      </AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                {submitError && !lastResult && (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden="true" />
                    <AlertTitle>Request error</AlertTitle>
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── RIGHT: Recent Alerts feed ─────────────────────────────────── */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Inbox className="h-4 w-4 text-primary" aria-hidden="true" />
                Recent Alerts
              </CardTitle>
              <CardDescription>
                Session + server history (up to {MAX_RECENT} entries). Local
                echoes appear immediately after send.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void loadRecent()}
              disabled={isLoadingRecent}
              aria-label="Refresh recent alerts"
            >
              {isLoadingRecent ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {isLoadingRecent && recent.length === 0 ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-md" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <Empty className="border-border/60 bg-secondary/20">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Inbox className="h-5 w-5 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyTitle>No alerts yet</EmptyTitle>
                  <EmptyDescription>
                    Send your first test notification to populate the feed.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul
                className="flex max-h-[min(70vh,640px)] flex-col gap-3 overflow-y-auto pr-1"
                aria-label="Recent test notifications"
              >
                {recent.slice(0, MAX_RECENT).map((alert) => {
                  const tones = levelClasses(alert.level);
                  const Icon =
                    LEVEL_OPTIONS.find((o) => o.value === alert.level)?.icon ??
                    Info;
                  return (
                    <li
                      key={alert.id ?? `${alert.timestamp}-${alert.title}`}
                      className={cn(
                        "flex flex-col gap-2 rounded-md border bg-secondary/30 p-3",
                        tones.border,
                        alert.status === "failed" && "opacity-80"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "inline-block h-2 w-2 shrink-0 rounded-full",
                              tones.indicator
                            )}
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm font-medium text-foreground">
                            {alert.title}
                          </span>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                          {alert.status === "failed" && (
                            <Badge
                              variant="outline"
                              className="border-destructive/30 bg-destructive/10 text-[10px] uppercase text-destructive"
                            >
                              Failed
                            </Badge>
                          )}
                          {alert.status === "sent" && (
                            <Badge
                              variant="outline"
                              className="border-success/30 bg-success/10 text-[10px] uppercase text-success"
                            >
                              Sent
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-normal text-[10px] uppercase tracking-wider",
                              tones.badge
                            )}
                          >
                            <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
                            <span className="sr-only">Level: </span>
                            {alert.level}
                          </Badge>
                        </div>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                        {alert.message}
                      </p>
                      <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
                        <time
                          dateTime={new Date(alert.timestamp).toISOString()}
                        >
                          {formatRelative(alert.timestamp)}
                        </time>
                        <span>{formatTimestamp(alert.timestamp)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
