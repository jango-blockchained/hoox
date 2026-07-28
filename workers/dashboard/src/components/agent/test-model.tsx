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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FieldGroup } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useState } from "react";
import { toast } from "sonner";

interface TestModelResponse {
  success: boolean;
  response?: string;
  error?: string;
}

export function TestModel() {
  const [provider, setProvider] = useState("workers-ai");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("Say hello");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleTest = async () => {
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/agent/test-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, prompt }),
        signal: controller.signal,
      });
      const data = (await res.json()) as TestModelResponse;
      if (data.success) {
        setResult(data.response ?? null);
        toast.success("Test successful");
      } else {
        toast.error(data.error || "Test failed");
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast.error("Failed to test model");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>Test Model</CardTitle>
        <CardDescription>Test a specific AI model</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Provider</FieldLabel>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workers-ai">Workers AI</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Model</FieldLabel>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g., @cf/meta/llama-3.1-8b-instruct"
            />
            <FieldDescription>Leave empty for default model</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Prompt</FieldLabel>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Test prompt"
            />
          </Field>
          <Button onClick={handleTest} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Spinner className="h-4 w-4" data-icon="inline-start" />{" "}
                Testing...
              </>
            ) : (
              "Run Test"
            )}
          </Button>
          {result && (
            <Alert>
              <AlertTitle>Result</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">
                {result}
              </AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
