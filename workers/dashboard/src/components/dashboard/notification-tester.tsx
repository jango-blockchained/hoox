"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useTransition } from "react";
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
} from "lucide-react";

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

// Recent alert shape returned by /api/notifications/recent. Kept permissive
// — the route is a stub today and may evolve to forward real history from
// the telegram-worker once that endpoint exists.
interface RecentAlert {
  id?: string;
  level: NotificationLevel | "info";
  title: string;
  message: string;
  timestamp: number;
  source?: "dashboard-tester" | "telegram-worker";
}

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

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve the level-aware semantic classes. We deliberately use the
 * project's `success` / `warning` / `destructive` tokens instead of raw
 * tailwind colors so light/dark themes stay consistent.
 */
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
  // `Intl.DateTimeFormat` is widely supported in CF Workers / browser runtimes.
  // We swallow any error so a locale lookup failure can never crash the feed.
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

  const [recent, setRecent] = useState<RecentAlert[] | null>(null);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Fetch recent alerts on mount and refresh after a successful send.
  const loadRecent = async (signal?: AbortSignal) => {
    setIsLoadingRecent(true);
    try {
      const res = await fetch("/api/notifications/recent", { signal });
      if (!res.ok) {
        // 401 means middleware bounced us; no need to surface a hard error.
        if (res.status === 401) {
          setRecent([]);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed to load alerts (${res.status})`);
      }
      const data = (await res.json()) as {
        success: boolean;
        alerts?: RecentAlert[];
      };
      setRecent(Array.isArray(data.alerts) ? data.alerts : []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Failed to load recent alerts:", err);
      setRecent([]);
    } finally {
      setIsLoadingRecent(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadRecent(controller.signal);
    return () => controller.abort();
  }, []);

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
          toast.error("Failed to send notification", { description: errMsg });
          return;
        }

        setLastResult({ success: true, message: data.message });
        toast.success("Notification sent", {
          description: data.message ?? "Telegram delivery accepted",
        });

        // Optimistically prepend a local echo so the feed updates without
        // waiting for the round-trip to loadRecent().
        const echo: RecentAlert = {
          id: `local-${Date.now()}`,
          level: parsed.data.level,
          title: parsed.data.title,
          message: parsed.data.message,
          timestamp: Date.now(),
          source: "dashboard-tester",
        };
        setRecent((prev) => [echo, ...(prev ?? [])].slice(0, 10));

        // Reset only the message body — keep the chat ID for follow-up tests.
        setMessage("");
        void loadRecent();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Network error";
        setSubmitError(errMsg);
        setLastResult({ success: false, message: errMsg });
        toast.error("Network error", { description: errMsg });
      }
    });
  };

  const isSendDisabled = isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── LEFT: Send Test Notification ──────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-primary" />
            Send Test Notification
          </CardTitle>
          <CardDescription>
            Deliver a message through the telegram-worker to verify the channel
            is healthy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-6"
            noValidate
          >
            <FieldGroup>
              {/* Chat ID — wrapped in an InputGroup so the leading "#" reads
                  like an inline addon without manually composing the layout. */}
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
                  Numeric Telegram chat ID. Negative IDs are supported (groups /
                  channels).
                </FieldDescription>
                {fieldErrors.chatId && (
                  <FieldError>{fieldErrors.chatId}</FieldError>
                )}
              </Field>

              {/* Level */}
              <Field data-invalid={Boolean(fieldErrors.level) || undefined}>
                <FieldLabel htmlFor="level">Message level</FieldLabel>
                <Select
                  value={level}
                  onValueChange={(value) => {
                    setLevel(value as NotificationLevel);
                    if (fieldErrors.level) {
                      setFieldErrors((prev) => ({ ...prev, level: undefined }));
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

              {/* Title */}
              <Field data-invalid={Boolean(fieldErrors.title) || undefined}>
                <FieldLabel htmlFor="title">Title</FieldLabel>
                <Input
                  id="title"
                  name="title"
                  type="text"
                  autoComplete="off"
                  placeholder="System check"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (fieldErrors.title) {
                      setFieldErrors((prev) => ({ ...prev, title: undefined }));
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

              {/* Message body */}
              <Field data-invalid={Boolean(fieldErrors.message) || undefined}>
                <FieldLabel htmlFor="message">Message body</FieldLabel>
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

            {/* Submit row */}
            <div className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={isSendDisabled}
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

              {/* Last result feedback — uses semantic tokens only */}
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
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4 text-primary" />
              Recent Alerts
            </CardTitle>
            <CardDescription>
              Up to 10 most-recent test notifications dispatched from this
              dashboard.
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
          {isLoadingRecent ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-md" />
              ))}
            </div>
          ) : !recent || recent.length === 0 ? (
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
              className="flex flex-col gap-3"
              aria-label="Recent test notifications"
            >
              {recent.slice(0, 10).map((alert) => {
                const tones = levelClasses(alert.level);
                const Icon =
                  LEVEL_OPTIONS.find((o) => o.value === alert.level)?.icon ??
                  Info;
                return (
                  <li
                    key={alert.id ?? `${alert.timestamp}-${alert.title}`}
                    className={cn(
                      "flex flex-col gap-2 rounded-md border bg-secondary/30 p-3",
                      tones.border
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-block h-2 w-2 shrink-0 rounded-full",
                            tones.indicator
                          )}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-medium text-foreground">
                          {alert.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-normal text-[10px] uppercase tracking-wider",
                            tones.badge
                          )}
                        >
                          <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
                          {alert.level}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {formatTimestamp(alert.timestamp)}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {alert.message}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
