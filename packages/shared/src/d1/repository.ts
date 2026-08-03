/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @deprecated D1Repository is no longer used by any worker.
 * All D1 operations are now handled directly via route handlers in workers/d1-worker.
 * This file is kept for reference but will be removed in a future cleanup pass.
 */

import type {
  D1Database,
  D1Result,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import type {
  TradeRecord,
  PositionRecord,
  BalanceRecord,
  SystemLogRecord,
  TradeSignalRecord,
  D1QueryResult,
} from "./schemas";
import { toError } from "../errors";

export interface BatchStatement {
  query: string;
  params?: unknown[];
}

/**
 * Typed D1 repository providing convenience methods for the hoox database schema.
 *
 * Tables: trades, positions, balances, system_logs, trade_signals
 */
export class D1Repository {
  constructor(private readonly db: D1Database) {}

  /**
   * Execute a SELECT query and return typed results
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<D1QueryResult<T>> {
    try {
      const stmt = this.db.prepare(sql).bind(...params);
      const result = await stmt.all<T>();
      return {
        success: result.success,
        results: result.results,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: toError(error),
      };
    }
  }

  /**
   * Execute a write query (INSERT, UPDATE, DELETE, REPLACE)
   */
  async execute(sql: string, params: unknown[] = []): Promise<D1QueryResult> {
    try {
      const stmt = this.db.prepare(sql).bind(...params);
      const result = await stmt.run();
      return {
        success: result.success,
        meta: {
          last_row_id: result.meta?.last_row_id,
          changes: result.meta?.changes,
          duration: result.meta?.duration,
        },
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: toError(error),
      };
    }
  }

  /**
   * Execute multiple statements in a batch transaction
   */
  async batch(statements: BatchStatement[]): Promise<D1QueryResult[]> {
    try {
      const prepared = statements.map((s) =>
        s.params && s.params.length > 0
          ? this.db.prepare(s.query).bind(...s.params)
          : this.db.prepare(s.query)
      );
      const results = await this.db.batch(prepared);
      return results.map((r: D1Result) => ({
        success: r.success,
        meta: r.meta
          ? { last_row_id: r.meta.last_row_id, changes: r.meta.changes }
          : undefined,
        error: r.error,
      }));
    } catch (error) {
      return statements.map(() => ({
        success: false,
        error: toError(error),
      }));
    }
  }

  /**
   * Return a raw D1PreparedStatement for complex or dynamic queries
   */
  prepare(sql: string): D1PreparedStatement {
    return this.db.prepare(sql);
  }

  // --- Typed convenience methods ---

  /**
   * Retrieve recent trades ordered by timestamp descending
   */
  async getTrades(
    limit: number = 50,
    offset: number = 0
  ): Promise<D1QueryResult<TradeRecord>> {
    return this.query<TradeRecord>(
      "SELECT * FROM trades ORDER BY timestamp DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
  }

  /**
   * Insert a new trade record
   */
  async insertTrade(
    trade: Omit<TradeRecord, "id" | "created_at"> & { id?: string }
  ): Promise<D1QueryResult> {
    return this.execute(
      `INSERT INTO trades (id, timestamp, exchange, symbol, action, quantity, price, leverage, status, raw_response) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trade.id || crypto.randomUUID(),
        trade.timestamp,
        trade.exchange,
        trade.symbol,
        trade.action,
        trade.quantity ?? null,
        trade.price ?? null,
        trade.leverage ?? null,
        trade.status,
        trade.raw_response ?? null,
      ]
    );
  }

  /**
   * Retrieve positions, optionally filtered by status
   */
  async getPositions(
    status?: "OPEN" | "CLOSED"
  ): Promise<D1QueryResult<PositionRecord>> {
    if (status) {
      return this.query<PositionRecord>(
        "SELECT * FROM positions WHERE status = ? ORDER BY updated_at DESC",
        [status]
      );
    }
    return this.query<PositionRecord>(
      "SELECT * FROM positions ORDER BY updated_at DESC"
    );
  }

  /**
   * Upsert a position record (REPLACE INTO)
   */
  async upsertPosition(position: PositionRecord): Promise<D1QueryResult> {
    return this.execute(
      `REPLACE INTO positions (id, exchange, symbol, side, entry_price, mark_price, liquidation_price, leverage, size, unrealized_pnl, status, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        position.id,
        position.exchange,
        position.symbol,
        position.side,
        position.entry_price ?? null,
        position.mark_price ?? null,
        position.liquidation_price ?? null,
        position.leverage ?? null,
        position.size,
        position.unrealized_pnl ?? null,
        position.status,
        position.updated_at,
      ]
    );
  }

  /**
   * Retrieve recent trade signals
   */
  async getTradeSignals(
    limit: number = 10
  ): Promise<D1QueryResult<TradeSignalRecord>> {
    return this.query<TradeSignalRecord>(
      `SELECT signal_id, timestamp, symbol, signal_type, source, processed_at 
       FROM trade_signals 
       ORDER BY processed_at DESC 
       LIMIT ?`,
      [limit]
    );
  }

  /**
   * Insert a new trade signal
   */
  async insertTradeSignal(signal: TradeSignalRecord): Promise<D1QueryResult> {
    return this.execute(
      `INSERT INTO trade_signals (signal_id, timestamp, symbol, signal_type, source, raw_data) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        signal.signal_id,
        signal.timestamp,
        signal.symbol,
        signal.signal_type,
        signal.source ?? null,
        signal.raw_data ?? null,
      ]
    );
  }

  /**
   * Retrieve recent system logs
   */
  async getSystemLogs(
    limit: number = 50
  ): Promise<D1QueryResult<SystemLogRecord>> {
    return this.query<SystemLogRecord>(
      "SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?",
      [limit]
    );
  }

  /**
   * Insert a new system log entry (id and timestamp are auto-generated)
   */
  async insertSystemLog(
    log: Pick<SystemLogRecord, "level" | "service" | "message"> & {
      details?: string | null;
      id?: string;
    }
  ): Promise<D1QueryResult> {
    return this.execute(
      `INSERT INTO system_logs (id, level, service, message, details) VALUES (?, ?, ?, ?, ?)`,
      [
        log.id || crypto.randomUUID(),
        log.level,
        log.service,
        log.message,
        log.details ?? null,
      ]
    );
  }

  /**
   * Retrieve the latest balance snapshot per exchange and asset
   */
  async getLatestBalances(): Promise<D1QueryResult<BalanceRecord>> {
    return this.query<BalanceRecord>(`
      SELECT b.id, b.exchange, b.asset, b.total, b.free, b.used, b.timestamp
      FROM balances b
      INNER JOIN (
        SELECT exchange, asset, MAX(timestamp) as max_time
        FROM balances
        GROUP BY exchange, asset
      ) latest ON b.exchange = latest.exchange AND b.asset = latest.asset AND b.timestamp = latest.max_time
    `);
  }

  /**
   * Quick health check — verifies the database connection is alive
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.db.prepare("SELECT 1").first();
      return true;
    } catch {
      return false;
    }
  }
}
