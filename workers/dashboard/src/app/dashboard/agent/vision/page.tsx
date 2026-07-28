/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import VisionClient from "./page.client";
export { metadata } from "./metadata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function VisionPage() {
  return <VisionClient />;
}
