/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TypeScript interfaces for D1 database tables
 * Based on the schema defined in workers/trade-worker/schema.sql
 */

import { z } from "zod";

// --- Zod Schemas (runtime-validated) ---

export const TradeRecordSchema = z
  .object({
    id: z.string(),
    signal_id: z.string().nullable().optional(),
    timestamp: z.number().int().positive(),
    exchange: z.string().min(1),
    symbol: z.string().min(1),
    action: z.string().min(1),
    quantity: z.number().nullable(),
    price: z.number().nullable(),
    leverage: z.number().nullable(),
    status: z.string().min(1),
    error_message: z.string().nullable().optional(),
    raw_response: z.string().nullable().optional(),
    created_at: z.number().int().optional(),
  })
  .strict();

export const PositionRecordSchema = z
  .object({
    id: z.string(),
    exchange: z.string().min(1),
    symbol: z.string().min(1),
    side: z.enum(["LONG", "SHORT"]),
    entry_price: z.number().nullable().optional(),
    mark_price: z.number().nullable().optional(),
    liquidation_price: z.number().nullable().optional(),
    leverage: z.number().nullable().optional(),
    size: z.number().nullable(),
    unrealized_pnl: z.number().nullable().optional(),
    status: z.enum(["OPEN", "CLOSED"]),
    updated_at: z.number().int(),
  })
  .strict();

export const BalanceRecordSchema = z
  .object({
    id: z.string(),
    exchange: z.string().min(1),
    asset: z.string().min(1),
    free: z.number().nullable(),
    used: z.number().nullable(),
    total: z.number().nullable(),
    timestamp: z.number().int().positive(),
  })
  .strict();

export const SystemLogRecordSchema = z
  .object({
    id: z.string(),
    timestamp: z.number().int().optional(),
    level: z.string().min(1),
    service: z.string().min(1),
    message: z.string().min(1),
    details: z.string().nullable().optional(),
  })
  .strict();

export const TradeSignalRecordSchema = z
  .object({
    signal_id: z.string(),
    timestamp: z.number().int().positive(),
    symbol: z.string().min(1),
    signal_type: z.string().min(1),
    source: z.string().nullable().optional(),
    raw_data: z.string().nullable().optional(),
    processed_at: z.number().int().optional(),
  })
  .strict();

// --- Inferred types (derived from Zod schemas) ---

export type TradeRecord = z.infer<typeof TradeRecordSchema>;
export type PositionRecord = z.infer<typeof PositionRecordSchema>;
export type BalanceRecord = z.infer<typeof BalanceRecordSchema>;
export type SystemLogRecord = z.infer<typeof SystemLogRecordSchema>;
export type TradeSignalRecord = z.infer<typeof TradeSignalRecordSchema>;

/**
 * Generic D1 query result wrapper
 */
export interface D1QueryResult<T = unknown> {
  success: boolean;
  results?: T[];
  error?: string;
  meta?: {
    last_row_id?: number;
    changes?: number;
    duration?: number;
  };
}
