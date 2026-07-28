/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { Errors } from "@jango-blockchained/hoox-shared/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  try {
    const templates = [
      "trading-analyst",
      "risk-assessor",
      "market-scanner",
      "sentiment-analyzer",
      "position-advisor",
    ];

    return NextResponse.json({ success: true, prompts: templates });
  } catch (e) {
    return Errors.internal(String(e));
  }
}
