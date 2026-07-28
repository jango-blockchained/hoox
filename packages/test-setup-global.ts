/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

// Global test preload to prevent accidental external binary spawns (wrangler, etc.)
// This file is injected automatically by the test runner. To allow blocked commands
// in intentional live tests, set HOOX_TEST_ALLOW_WRANGLER=1 in the env.
//
// Also imports the full test setup (fetch polyfill, cloudflare:workers mock,
// yoga-layout mock, Jest-style globals, etc.) from the shared test-utils package.

import "@hoox/test-utils/setup";
