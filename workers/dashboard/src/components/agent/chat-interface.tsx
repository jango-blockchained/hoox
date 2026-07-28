"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
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
import { Send, Bot, User } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("workers-ai");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(500);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = async () => {
    const controller = new AbortController();
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
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
        throw new Error("Failed to send message");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  assistantContent += parsed.content;
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMsg = newMessages[newMessages.length - 1];
                    if (lastMsg && lastMsg.role === "assistant") {
                      lastMsg.content = assistantContent;
                    }
                    return newMessages;
                  });
                }
              } catch {
                /* ignore parse errors during streaming */
              }
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast.error("Failed to send message");
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workers-ai">Workers AI (Llama 3.1)</SelectItem>
              <SelectItem value="openai">OpenAI (GPT-4o-mini)</SelectItem>
              <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Temp:</span>
            <Slider
              value={[temperature]}
              onValueChange={(v) => setTemperature(v[0])}
              min={0}
              max={2}
              step={0.1}
              className="w-[100px]"
            />
            <span className="text-sm font-mono w-8">{temperature}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tokens:</span>
            <Input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 500)}
              className="w-[80px]"
            />
          </div>
        </div>
      </div>

      <Card className="bg-card border-border flex-1">
        <CardContent className="p-0">
          <div className="h-[500px] overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Start a conversation with the AI agent
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 mb-4 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="size-4 text-primary" />
                  </div>
                )}
                <div
                  className={`rounded-lg p-3 max-w-[80%] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.role === "user" && (
                  <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                    <User className="size-4" />
                  </div>
                )}
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Type your message..."
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()}>
          {loading ? (
            <>
              <Spinner className="h-4 w-4" data-icon="inline-start" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" data-icon="inline-start" />
              Send
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
