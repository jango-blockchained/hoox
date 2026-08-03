"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Image, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function VisionUpload() {
  const [imageUrl, setImageUrl] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(
    "Analyze this chart and identify key support and resistance levels"
  );
  const [model, setModel] = useState("@cf/meta/llama-3.2-11b-vision-instruct");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setImageBase64(base64);
      setPreviewUrl(base64);
      setImageUrl("");
      setResult(null);
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (url: string) => {
    setImageUrl(url);
    setPreviewUrl(url.trim() ? url.trim() : null);
    setImageBase64(null);
    setResult(null);
  };

  const clearImage = () => {
    setImageUrl("");
    setImageBase64(null);
    setPreviewUrl(null);
    setResult(null);
  };

  const analyzeImage = async () => {
    if (!previewUrl) {
      toast.error("Please provide an image");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    setLoading(true);
    setResult(null);
    const controller = new AbortController();
    try {
      const res = await fetch("/api/agent/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          imageUrl: imageBase64 ? undefined : imageUrl,
          prompt: prompt.trim(),
          model,
        }),
        signal: controller.signal,
      });
      const data = (await res.json()) as {
        success: boolean;
        response?: string;
        error?: string;
      };
      if (data.success) {
        setResult(data.response ?? null);
        toast.success("Analysis complete");
      } else {
        toast.error(data.error || "Analysis failed");
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast.error("Failed to analyze image");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-5 w-5 text-primary" />
            Upload Image
          </CardTitle>
          <CardDescription>
            Upload a chart image or provide a URL for AI analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="image-url">Image URL</Label>
            <Input
              id="image-url"
              value={imageUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://example.com/chart.png"
              disabled={loading || !!imageBase64}
            />
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="image-upload">Upload File</Label>
            <Input
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={loading}
              className="cursor-pointer"
            />
          </div>
          {previewUrl && (
            <div className="overflow-hidden rounded-lg border">
              {/* External chart preview URL — plain img is intentional */}
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-[300px] w-full object-contain"
                onError={() => {
                  if (!imageBase64) {
                    toast.error("Could not load image from URL");
                  }
                }}
              />
            </div>
          )}
          {previewUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearImage}
              disabled={loading}
              className="self-start text-muted-foreground"
            >
              Clear image
            </Button>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What would you like the AI to analyze?"
              className="min-h-[80px]"
              disabled={loading}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="model">Model</Label>
            <Select value={model} onValueChange={setModel} disabled={loading}>
              <SelectTrigger id="model">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="@cf/meta/llama-3.2-11b-vision-instruct">
                  Llama 3.2 Vision (Workers AI)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => void analyzeImage()}
            disabled={loading || !previewUrl || !prompt.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Spinner className="h-4 w-4" data-icon="inline-start" />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" data-icon="inline-start" />
                Analyze Image
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Image className="h-5 w-5 text-primary" aria-hidden /> Analysis
            Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[80%]" />
              <Skeleton className="h-4 w-[60%]" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !result ? (
            <Empty className="min-h-[220px] border border-dashed py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Image className="size-5" aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No analysis yet</EmptyTitle>
                <EmptyDescription>
                  Upload an image and click analyze to see vision results.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertTitle>Vision Analysis</AlertTitle>
              <AlertDescription className="mt-2 whitespace-pre-wrap">
                {result}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
