/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import DatabaseClient from "./page.client";
export { metadata } from "./metadata";

// nodejs runtime matches the rest of the dashboard — edge runtime is
// incompatible with OpenNext's worker build (see test-coverage.md).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function DatabasePage() {
  return <DatabaseClient />;
}
