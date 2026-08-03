/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";

export default [
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/.next/",
      "*.bak",
      "**/.wrangler/",
      "*.md",
      "*.d.ts",
      "bun.lock",
      "bun.lockb",
      "worker-configuration.d.ts",
      ".opencode/",
      "examples/",
      ".tmp/",
      "**/dist.bak/",
      ".agents/",
      ".worktrees/",
      "packages/shared/scripts/",
      "papers/scripts/",
    ],
  },
  js.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    files: [
      "**/*.js",
      "**/*.jsx",
      "**/*.mjs",
      "**/*.cjs",
      "**/*.ts",
      "**/*.tsx",
      "**/*.mts",
      "**/*.cts",
    ],
    languageOptions: {
      globals: {
        ...globals.es2021,
        ...globals.node,
        ...globals.jest,
        Bun: "readonly",
        // k6 load testing globals
        __ENV: "readonly",
        __ITER: "readonly",
        __VU: "readonly",
      },
    },
    rules: {
      "prettier/prettier": "warn",
      "no-console": "off",
      "no-empty": "warn",
      "no-control-regex": "warn",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        projectService: true,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript handles this more accurately; disable to avoid false
      // positives from Cloudflare Workers types (Fetcher, KVNamespace, etc.)
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "error",
    },
  },
  {
    files: [
      "packages/cli/src/commands/housekeeping/index.ts",
      "packages/cli/src/commands/waf/waf-command.ts",
      "workers/dashboard/src/lib/settings/loader.ts",
      "workers/dashboard/src/lib/api.ts",
      "workers/dashboard/src/components/dashboard/settings-form.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "never",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSAnyKeyword",
          message:
            "Avoid `as any` in critical modules. Use runtime narrowing or concrete interfaces.",
        },
      ],
    },
  },
  {
    files: [
      "workers/dashboard/src/components/dashboard/setup-checklist.tsx",
      "workers/dashboard/src/app/api/settings/route.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
  },
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "workers/*/test/**",
      "packages/*/test/**",
      "packages/*/tests/**",
      "tests/live/**",
    ],
    languageOptions: {
      parserOptions: {
        project: null,
        projectService: false,
      },
    },
    rules: {
      // Test files intentionally use `any` for mocks/fixtures and may have
      // unused parameters across AAA phases. AGENTS.md: "ESLint relaxes
      // rules in test files". The `argsIgnorePattern: "^_"` from the main
      // rule config still applies if these rules are re-enabled later.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-empty": "warn",
    },
  },
];
