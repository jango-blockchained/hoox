"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { Bot, MessageSquare, Send, Trash2, User } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const MODELS = [
  { value: "workers-ai", label: "Workers AI (Llama 3.1)" },
  { value: "openai", label: "OpenAI (GPT-4o-mini)" },
  { value: "anthropic", label: "Anthropic (Claude)" },
] as const;

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("workers-ai");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(500);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const clearChat = useCallback(() => {
    if (loading) {
      abortRef.current?.abort();
      setLoading(false);
    }
    setMessages([]);
  }, [loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const history = [...messages, userMessage];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          model: model === "workers-ai" ? undefined : model,
          temperature,
          maxTokens,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = "Failed to send message";
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody.error) detail = errBody.error;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(detail);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let receivedContent = false;

      if (!reader) {
        // Non-streaming JSON fallback
        const data = (await res.json()) as {
          success?: boolean;
          response?: string;
          content?: string;
          error?: string;
        };
        const text = data.response ?? data.content ?? "";
        if (!text && data.error) throw new Error(data.error);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            last.content = text || "No response from model.";
          }
          return next;
        });
        return;
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as {
              content?: string;
              error?: string;
            };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) {
              receivedContent = true;
              assistantContent += parsed.content;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  last.content = assistantContent;
                }
                return next;
              });
            }
          } catch (parseErr) {
            if (
              parseErr instanceof Error &&
              parseErr.message !== "Unexpected end of JSON input" &&
              !parseErr.message.includes("JSON")
            ) {
              throw parseErr;
            }
          }
        }
      }

      if (!receivedContent && !assistantContent) {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            last.content = "No response from model.";
            last.error = true;
          }
          return next;
        });
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && !last.content) {
            return next.slice(0, -1);
          }
          return next;
        });
        return;
      }
      const message = e instanceof Error ? e.message : "Failed to send message";
      toast.error(message);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          if (!last.content) {
            last.content = message;
            last.error = true;
          }
        }
        return next;
      });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={model} onValueChange={setModel} disabled={loading}>
            <SelectTrigger className="w-[220px]" aria-label="Model">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              disabled={loading}
              className="text-muted-foreground"
            >
              <Trash2 className="h-4 w-4" data-icon="inline-start" />
              Clear
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Temp</span>
            <Slider
              value={[temperature]}
              onValueChange={(v) => setTemperature(v[0])}
              min={0}
              max={2}
              step={0.1}
              className="w-[100px]"
              disabled={loading}
              aria-label="Temperature"
            />
            <span className="w-8 font-mono text-sm tabular-nums">
              {temperature.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tokens</span>
            <Input
              type="number"
              value={maxTokens}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                setMaxTokens(
                  Number.isFinite(n) ? Math.min(4096, Math.max(1, n)) : 500
                );
              }}
              disabled={loading}
              className="w-[80px]"
              min={1}
              max={4096}
              aria-label="Max tokens"
            />
          </div>
        </div>
      </div>

      <Card className="border-border bg-card flex-1">
        <CardContent className="p-0">
          <div
            className="h-[min(500px,60vh)] overflow-y-auto p-4"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 ? (
              <Empty className="h-full min-h-[280px] border-0 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageSquare className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>Start a conversation</EmptyTitle>
                  <EmptyDescription>
                    Ask the AI agent about markets, risk, or strategy. Responses
                    stream in real time when available.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              messages.map((msg, i) => {
                const isStreaming =
                  loading &&
                  i === messages.length - 1 &&
                  msg.role === "assistant";
                return (
                  <div
                    key={`${msg.role}-${i}`}
                    className={cn(
                      "mb-4 flex gap-3",
                      msg.role === "user" && "justify-end"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Bot className="size-4 text-primary" aria-hidden />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3.5 py-2.5 shadow-sm",
                        msg.role === "user"
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : msg.error
                            ? "rounded-bl-md border border-destructive/40 bg-destructive/10 text-destructive"
                            : "rounded-bl-md bg-secondary text-secondary-foreground"
                      )}
                    >
                      {msg.content ? (
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {msg.content}
                          {isStreaming && (
                            <span
                              className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-current align-middle opacity-70"
                              aria-hidden
                            />
                          )}
                        </p>
                      ) : isStreaming ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Spinner className="h-3.5 w-3.5" />
                          Thinking…
                        </div>
                      ) : null}
                    </div>
                    {msg.role === "user" && (
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <User className="size-4" aria-hidden />
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={scrollRef} />
          </div>
        </CardContent>
      </Card>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Type your message…"
          disabled={loading}
          className="flex-1"
          aria-label="Message"
          autoComplete="off"
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          {loading ? (
            <>
              <Spinner className="h-4 w-4" data-icon="inline-start" />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" data-icon="inline-start" />
              Send
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
