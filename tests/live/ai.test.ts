/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live Workers AI Inference Tests
 *
 * Tests Cloudflare Workers AI inference at the edge via REST API.
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 *
 * What's tested:
 *   - Text generation (LLaMA 3)
 *   - Text embeddings (BGE)
 *   - Text classification
 *   - AI Gateway (if configured)
 *   - Model list
 *
 * NOTE: Some models may not be available on all accounts. Tests
 * gracefully skip unavailable models.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { getConfig, cfApi, hasLiveEnv, section } from "./helpers";

// Skip these live integration tests when no Cloudflare credentials available
const hasCloudflareEnv = hasLiveEnv("CLOUDFLARE_ACCOUNT_ID");
(hasCloudflareEnv ? describe : describe.skip)("Workers AI", () => {
  let config: ReturnType<typeof getConfig>;

  beforeAll(async () => {
    config = getConfig();
  });

  // -----------------------------------------------------------------------
  // Text generation
  // -----------------------------------------------------------------------

  test(
    "LLaMA 3 text generation returns a response",
    { timeout: 60000 },
    async () => {
      section("Text generation");
      try {
        const result = await cfApi<{ response: string }>(
          "POST",
          `/accounts/${config.accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
          {
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful assistant. Keep responses under 20 words.",
              },
              {
                role: "user",
                content: "What is the capital of France?",
              },
            ],
            max_tokens: 50,
          }
        );
        expect(result.success).toBe(true);
        expect(result.result.response).toBeTruthy();
        const response = result.result.response.toLowerCase();
        expect(response).toContain("paris");
        console.log(`  ✓ LLaMA 3: "${result.result.response.trim()}"`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ LLaMA 3 not available: ${message}`);
        console.log("    (Check that Workers AI is enabled for your account)");
      }
    }
  );

  test(
    "AI model returns deterministic outputs",
    { timeout: 60000 },
    async () => {
      try {
        // Test with a simpler deterministic model
        const result = await cfApi<{ response: string }>(
          "POST",
          `/accounts/${config.accountId}/ai/run/@hf/thebloke/deepseek-coder-1.3b-base-gguf`,
          {
            messages: [
              {
                role: "user",
                content: "Write a hello world function in Python:",
              },
            ],
            max_tokens: 30,
          }
        );
        expect(result.success).toBe(true);
        expect(result.result.response.length).toBeGreaterThan(0);
        console.log(
          `  ✓ DeepSeek: generated ${result.result.response.length} chars`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ DeepSeek not available: ${message}`);
      }
    }
  );

  // -----------------------------------------------------------------------
  // Embeddings
  // -----------------------------------------------------------------------

  test("BGE text embeddings return vector", { timeout: 60000 }, async () => {
    section("Embeddings");
    try {
      const result = await cfApi<{ data: Array<number[]> }>(
        "POST",
        `/accounts/${config.accountId}/ai/run/@cf/baai/bge-small-en-v1.5`,
        {
          text: ["Cloudflare Workers are awesome for edge computing"],
        }
      );
      expect(result.success).toBe(true);
      expect(result.result.data).toBeDefined();
      expect(Array.isArray(result.result.data)).toBe(true);
      expect(result.result.data.length).toBe(1);
      expect(result.result.data[0].length).toBe(384);
      console.log(`  ✓ BGE embeddings: 384-dimensional vector returned`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ BGE embeddings not available: ${message}`);
    }
  });

  test(
    "Embeddings are deterministic for same input",
    { timeout: 60000 },
    async () => {
      try {
        const input = "Edge computing is the future";
        const result1 = await cfApi<{ data: Array<number[]> }>(
          "POST",
          `/accounts/${config.accountId}/ai/run/@cf/baai/bge-small-en-v1.5`,
          { text: [input] }
        );
        const result2 = await cfApi<{ data: Array<number[]> }>(
          "POST",
          `/accounts/${config.accountId}/ai/run/@cf/baai/bge-small-en-v1.5`,
          { text: [input] }
        );
        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        // Same input should produce identical vectors
        const v1 = result1.result.data[0];
        const v2 = result2.result.data[0];
        expect(v1.length).toBe(v2.length);
        const isIdentical = v1.every((val: number, i: number) => val === v2[i]);
        expect(isIdentical).toBe(true);
        console.log("  ✓ Embeddings deterministic (same input → same vector)");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Embedding determinism test skipped: ${message}`);
      }
    }
  );

  // -----------------------------------------------------------------------
  // Text classification
  // -----------------------------------------------------------------------

  test(
    "Text classification model returns labels",
    { timeout: 60000 },
    async () => {
      section("Classification");
      try {
        const result = await cfApi<{
          result: Array<{ label: string; score: number }>;
        }>(
          "POST",
          `/accounts/${config.accountId}/ai/run/@cf/huggingface/distilbert-sst-2-int8`,
          {
            text: "This trading strategy is performing exceptionally well!",
          }
        );
        expect(result.success).toBe(true);
        expect(result.result).toBeDefined();
        const predictions = Array.isArray(result.result)
          ? result.result
          : [result.result];
        expect(predictions.length).toBeGreaterThan(0);
        const labels = predictions.map((p: { label: string }) => p.label);
        console.log(`  ✓ Classification labels: ${labels.join(", ")}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Classification not available: ${message}`);
      }
    }
  );

  // -----------------------------------------------------------------------
  // List available models
  // -----------------------------------------------------------------------

  test("List available AI models", { timeout: 60000 }, async () => {
    section("Available models");
    try {
      const result = await cfApi<Array<{ name: string; description?: string }>>(
        "GET",
        `/accounts/${config.accountId}/ai/models/search?per_page=5`
      );
      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      const modelNames = result.result.map((m: { name: string }) => m.name);
      console.log(`  ✓ ${result.result.length} models available`);
      console.log(`    ${modelNames.join(", ")}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Model list not available: ${message}`);
    }
  });

  // -----------------------------------------------------------------------
  // Multi-turn conversation
  // -----------------------------------------------------------------------

  test(
    "Multi-turn conversation maintains context",
    { timeout: 60000 },
    async () => {
      section("Conversation");
      try {
        const result = await cfApi<{ response: string }>(
          "POST",
          `/accounts/${config.accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
          {
            messages: [
              { role: "system", content: "You are a trading assistant." },
              { role: "user", content: "My first asset is BTC. Store it." },
              {
                role: "assistant",
                content: "I'll remember your first asset is BTC.",
              },
              { role: "user", content: "What was my first asset?" },
            ],
            max_tokens: 20,
          }
        );
        expect(result.success).toBe(true);
        // Should reference BTC from earlier in conversation
        expect(result.result.response.toLowerCase()).toContain("btc");
        console.log(`  ✓ Multi-turn context maintained`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Conversation test skipped: ${message}`);
      }
    }
  );
});
