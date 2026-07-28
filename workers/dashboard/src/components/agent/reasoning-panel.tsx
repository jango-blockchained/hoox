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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface ReasoningResponse {
  success: boolean;
  reasoning?: string;
  answer?: string;
  response?: string;
  error?: string;
}

export function ReasoningPanel() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("workers-ai");
  const [effort, setEffort] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    setLoading(true);
    setReasoning(null);
    setAnswer(null);
    const controller = new AbortController();
    try {
      const res = await fetch("/api/agent/reasoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model, reasoningEffort: effort }),
        signal: controller.signal,
      });
      const data = (await res.json()) as ReasoningResponse;
      if (data.success) {
        setReasoning(data.reasoning ?? null);
        setAnswer(data.answer ?? data.response ?? null);
        toast.success("Reasoning complete");
      } else {
        toast.error(data.error || "Reasoning failed");
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast.error("Failed to get reasoning");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> Reasoning Input
          </CardTitle>
          <CardDescription>
            Enter a complex query for deep thinking analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Model</span>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workers-ai">
                  DeepSeek R1 (Workers AI)
                </SelectItem>
                <SelectItem value="openai">o1-preview (OpenAI)</SelectItem>
                <SelectItem value="openai-mini">o1-mini (OpenAI)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Reasoning Effort</span>
            <ToggleGroup
              type="single"
              value={effort}
              onValueChange={(v) => v && setEffort(v)}
              className="justify-start"
            >
              <ToggleGroupItem value="low" aria-label="Low effort">
                Low
              </ToggleGroupItem>
              <ToggleGroupItem value="medium" aria-label="Medium effort">
                Medium
              </ToggleGroupItem>
              <ToggleGroupItem value="high" aria-label="High effort">
                High
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Prompt</span>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Design a risk management strategy for a $100k portfolio..."
              className="min-h-[120px]"
            />
          </div>
          <Button onClick={handleSubmit} disabled={loading || !prompt.trim()}>
            {loading ? (
              <>
                <Spinner className="h-4 w-4" data-icon="inline-start" />{" "}
                Thinking...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" data-icon="inline-start" /> Submit
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Response</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[80%]" />
              <Skeleton className="h-4 w-[60%]" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !reasoning && !answer ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              Submit a prompt to see the reasoning process and answer
            </div>
          ) : (
            <Tabs defaultValue="answer" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
                <TabsTrigger value="answer">Answer</TabsTrigger>
              </TabsList>
              <TabsContent value="reasoning" className="mt-4">
                <div className="rounded-lg bg-secondary/30 p-4 min-h-[200px]">
                  <p className="text-sm whitespace-pre-wrap">
                    {reasoning || "No reasoning output"}
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="answer" className="mt-4">
                <div className="rounded-lg bg-secondary/30 p-4 min-h-[200px]">
                  <p className="text-sm whitespace-pre-wrap">
                    {answer || "No answer yet"}
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
