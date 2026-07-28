/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for validateReadOnlySql — the client-side read-only SQL validator.
 *
 * Validates the security guarantees of the db-query view:
 *   - SELECT / WITH / EXPLAIN are allowed
 *   - INSERT / UPDATE / DELETE / DROP / CREATE / ALTER / TRUNCATE / PRAGMA
 *     / ATTACH / DETACH / VACUUM / REINDEX are rejected
 *   - Multi-statement payloads (semicolons with content after) are rejected
 *   - Empty/whitespace-only input is rejected
 *   - Comment-only input is rejected
 *   - Mixed-case variants are handled case-insensitively
 *   - String literals and comments are stripped before keyword check
 */
import { describe, it, expect } from "bun:test";
import { validateReadOnlySql, type SqlValidationResult } from "./cli-bridge";

// ─── Helper ───────────────────────────────────────────────────────────────────

function isValid(sql: string): boolean {
  return validateReadOnlySql(sql).readonly;
}

function rejectReason(sql: string): string {
  const result = validateReadOnlySql(sql);
  return result.readonly ? "" : (result as { reason: string }).reason;
}

// ─── Allowed entry points ─────────────────────────────────────────────────────

describe("validateReadOnlySql — allowed entry points", () => {
  it("accepts simple SELECT", () => {
    expect(isValid("SELECT * FROM users")).toBe(true);
  });

  it("accepts SELECT with WHERE clause", () => {
    expect(isValid("SELECT id, name FROM users WHERE active = 1")).toBe(true);
  });

  it("accepts SELECT with JOIN", () => {
    expect(
      isValid(
        "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id"
      )
    ).toBe(true);
  });

  it("accepts SELECT with subquery", () => {
    expect(
      isValid(
        "SELECT * FROM (SELECT id, name FROM users WHERE active = 1) AS active_users"
      )
    ).toBe(true);
  });

  it("accepts WITH ... SELECT (CTE)", () => {
    expect(
      isValid(
        "WITH active_users AS (SELECT * FROM users WHERE active = 1) SELECT * FROM active_users"
      )
    ).toBe(true);
  });

  it("accepts EXPLAIN SELECT", () => {
    expect(isValid("EXPLAIN SELECT * FROM users")).toBe(true);
  });

  it("accepts EXPLAIN QUERY PLAN", () => {
    expect(isValid("EXPLAIN QUERY PLAN SELECT * FROM users")).toBe(true);
  });

  it("accepts SELECT with LIMIT", () => {
    expect(isValid("SELECT * FROM migrations ORDER BY id DESC LIMIT 5")).toBe(
      true
    );
  });

  it("accepts SELECT from sqlite_master", () => {
    expect(
      isValid(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
    ).toBe(true);
  });
});

// ─── Forbidden keywords ────────────────────────────────────────────────────────

describe("validateReadOnlySql — forbidden keywords", () => {
  // INSERT
  it("rejects INSERT", () => {
    expect(isValid("INSERT INTO users (name) VALUES ('test')")).toBe(false);
  });
  it("rejects INSERT as first token (uppercase)", () => {
    expect(isValid("INSERT INTO users VALUES (1)")).toBe(false);
  });
  it("rejects insert (lowercase)", () => {
    expect(isValid("insert into users values (1)")).toBe(false);
  });

  // UPDATE
  it("rejects UPDATE", () => {
    expect(isValid("UPDATE users SET name = 'test' WHERE id = 1")).toBe(false);
  });
  it("rejects update (lowercase)", () => {
    expect(isValid("update users set name = 'test' where id = 1")).toBe(false);
  });

  // DELETE
  it("rejects DELETE", () => {
    expect(isValid("DELETE FROM users WHERE id = 1")).toBe(false);
  });
  it("rejects delete (lowercase)", () => {
    expect(isValid("delete from users where id = 1")).toBe(false);
  });

  // REPLACE
  it("rejects REPLACE", () => {
    expect(isValid("REPLACE INTO users (id, name) VALUES (1, 'test')")).toBe(
      false
    );
  });

  // DROP
  it("rejects DROP TABLE", () => {
    expect(isValid("DROP TABLE users")).toBe(false);
  });
  it("rejects DROP INDEX", () => {
    expect(isValid("DROP INDEX idx_users")).toBe(false);
  });

  // CREATE
  it("rejects CREATE TABLE", () => {
    expect(isValid("CREATE TABLE test (id INTEGER PRIMARY KEY)")).toBe(false);
  });
  it("rejects CREATE INDEX", () => {
    expect(isValid("CREATE INDEX idx ON users(name)")).toBe(false);
  });
  it("rejects CREATE VIEW", () => {
    expect(isValid("CREATE VIEW v AS SELECT * FROM users")).toBe(false);
  });

  // ALTER
  it("rejects ALTER TABLE", () => {
    expect(isValid("ALTER TABLE users ADD COLUMN email TEXT")).toBe(false);
  });

  // TRUNCATE
  it("rejects TRUNCATE", () => {
    expect(isValid("TRUNCATE TABLE users")).toBe(false);
  });

  // PRAGMA
  it("rejects PRAGMA", () => {
    expect(isValid("PRAGMA journal_mode=WAL")).toBe(false);
  });
  it("rejects pragma (lowercase)", () => {
    expect(isValid("pragma journal_mode")).toBe(false);
  });

  // ATTACH
  it("rejects ATTACH", () => {
    expect(isValid("ATTACH DATABASE '/tmp/test.db' AS test")).toBe(false);
  });

  // DETACH
  it("rejects DETACH", () => {
    expect(isValid("DETACH DATABASE test")).toBe(false);
  });

  // VACUUM
  it("rejects VACUUM", () => {
    expect(isValid("VACUUM")).toBe(false);
  });

  // REINDEX
  it("rejects REINDEX", () => {
    expect(isValid("REINDEX")).toBe(false);
  });

  // Forbidden keyword mixed into a valid-looking SELECT (injection attempt)
  it("rejects SELECT with DROP in string literal", () => {
    // The validator strips string literals before checking, so embedded
    // keywords in string literals should not trigger rejection.
    // However, the whole-statement check should still reject if the
    // keyword appears outside strings/comments.
    expect(isValid("SELECT 'DROP TABLE users'")).toBe(true); // keyword is inside string
  });

  it("rejects SELECT with forbidden keyword after string literal", () => {
    // Keyword outside string → must be rejected
    expect(isValid("SELECT 'hello' FROM users; DROP TABLE users")).toBe(false);
  });
});

// ─── Comment stripping ────────────────────────────────────────────────────────

describe("validateReadOnlySql — comment stripping", () => {
  it("accepts SELECT with trailing line comment", () => {
    expect(isValid("SELECT * FROM users -- this is a comment")).toBe(true);
  });

  it("accepts SELECT with inline line comment", () => {
    expect(isValid("SELECT * FROM users -- comment\nWHERE id = 1")).toBe(true);
  });

  it("accepts SELECT with block comment", () => {
    expect(isValid("SELECT /* comment */ * FROM users")).toBe(true);
  });

  it("rejects INSERT hidden in block comment prefix", () => {
    // The first significant token is read from the stripped+string-stripped
    // input. Block comments are stripped first, so "INSERT /* ... */ INTO"
    // should still be caught.
    // Actual behaviour: "INSERT" is the first token after block comment
    // stripping → rejected. This tests the defence-in-depth property.
    expect(isValid("INSERT /* comment */ INTO users VALUES (1)")).toBe(false);
  });

  it("rejects comment-only input", () => {
    expect(isValid("-- just a comment")).toBe(false);
    expect(isValid("/* block comment */")).toBe(false);
  });
});

// ─── String literal stripping ──────────────────────────────────────────────────

describe("validateReadOnlySql — string literal stripping", () => {
  it("accepts SELECT with string literal containing keyword", () => {
    // Keywords inside single-quoted strings should be stripped and not
    // cause false positives.
    expect(isValid("SELECT 'INSERT' FROM users")).toBe(true);
  });

  it("accepts SELECT with double-quoted identifier containing keyword", () => {
    expect(isValid('SELECT "DROP" FROM users')).toBe(true);
  });

  it("rejects keyword that appears after string literal end", () => {
    expect(isValid("SELECT 'x' FROM users; DROP TABLE users")).toBe(false);
  });
});

// ─── Multi-statement rejection ─────────────────────────────────────────────────

describe("validateReadOnlySql — multi-statement rejection", () => {
  it("rejects two SELECTs with semicolon", () => {
    expect(isValid("SELECT 1; SELECT 2")).toBe(false);
  });

  it("rejects SELECT then DROP with semicolon", () => {
    expect(isValid("SELECT * FROM users; DROP TABLE users")).toBe(false);
  });

  it("rejects SELECT with trailing semicolon (allowed)", () => {
    expect(isValid("SELECT * FROM users;")).toBe(true);
  });

  it("rejects SELECT with semicolon and trailing whitespace (allowed)", () => {
    expect(isValid("SELECT * FROM users;   ")).toBe(true);
  });

  it("rejects SELECT with semicolon and extra statement after", () => {
    expect(isValid("SELECT * FROM users; SELECT 2")).toBe(false);
  });

  it("rejects multiple semicolons", () => {
    expect(isValid("SELECT 1;; SELECT 2")).toBe(false);
  });
});

// ─── Empty / whitespace input ─────────────────────────────────────────────────

describe("validateReadOnlySql — empty and whitespace input", () => {
  it("rejects empty string", () => {
    expect(isValid("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(isValid("   ")).toBe(false);
    expect(isValid("\t\n")).toBe(false);
  });

  it("rejects newlines only", () => {
    expect(isValid("\n\n")).toBe(false);
  });
});

// ─── Result shape ─────────────────────────────────────────────────────────────

describe("validateReadOnlySql — result shape", () => {
  it("returns {readonly: true} for valid SQL", () => {
    const result = validateReadOnlySql("SELECT * FROM users");
    expect(result.readonly).toBe(true);
  });

  it("returns {readonly: false, reason: string} for invalid SQL", () => {
    const result = validateReadOnlySql("DROP TABLE users");
    expect(result.readonly).toBe(false);
    expect(typeof (result as { reason: string }).reason).toBe("string");
    expect((result as { reason: string }).reason.length).toBeGreaterThan(0);
  });

  it("returns a non-empty reason for forbidden keyword", () => {
    const result = validateReadOnlySql("INSERT INTO users VALUES (1)");
    expect(result.readonly).toBe(false);
    expect((result as { reason: string }).reason).toContain("INSERT");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("validateReadOnlySql — edge cases", () => {
  it("handles SQL with leading whitespace", () => {
    expect(isValid("   SELECT * FROM users")).toBe(true);
  });

  it("handles SQL with leading parenthesis", () => {
    expect(isValid("(SELECT * FROM users)")).toBe(true);
  });

  it("handles long valid SQL without issues", () => {
    const longSql =
      "SELECT u.id, u.name, o.total, o.created_at " +
      "FROM users u " +
      "JOIN orders o ON u.id = o.user_id " +
      "WHERE u.active = 1 AND o.total > 100 " +
      "ORDER BY o.created_at DESC LIMIT 50";
    expect(isValid(longSql)).toBe(true);
  });

  it("handles unicode in SQL (emoji in string)", () => {
    expect(isValid("SELECT '🚀' FROM users")).toBe(true);
  });

  it("handles backslash in string literal", () => {
    expect(isValid("SELECT 'C:\\Users\\test' FROM users")).toBe(true);
  });

  it("handles escaped single quote in string", () => {
    expect(isValid("SELECT name FROM users WHERE name = 'O''Brien'")).toBe(
      true
    );
  });

  it("handles doubled single quotes (SQL standard escape)", () => {
    expect(isValid("SELECT 'it''s fine' FROM users")).toBe(true);
  });
});
