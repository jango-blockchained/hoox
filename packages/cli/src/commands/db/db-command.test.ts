/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "bun:test";
import { DbService } from "../../services/db/index.js";

describe("db command", () => {
  describe("DbService integration", () => {
    it("resolves database name from explicit arg", async () => {
      const svc = new DbService();
      const name = await svc.resolveDbName("my-test-db");
      expect(name).toBe("my-test-db");
    });

    it("parses table names from wrangler output", () => {
      const output = JSON.stringify([
        { results: [{ name: "trades" }, { name: "signals" }] },
      ]);
      const tables = DbService.parseTableNames(output);
      expect(tables).toContain("trades");
      expect(tables).toContain("signals");
    });
  });

  describe("destructive keyword detection", () => {
    const findDestructive = (sql: string): string[] => {
      const keywords = [
        "DROP",
        "TRUNCATE",
        "ALTER",
        "DELETE",
        "UPDATE",
        "REPLACE",
        "INSERT",
        "CREATE",
        "ATTACH",
        "DETACH",
        "REINDEX",
        "VACUUM",
      ];
      const upper = sql.toUpperCase();
      return keywords.filter((kw) =>
        new RegExp(`(^|[^A-Z0-9_])${kw}([^A-Z0-9_]|$)`, "g").test(upper)
      );
    };

    it("flags DROP TABLE", () => {
      expect(findDestructive("DROP TABLE users")).toContain("DROP");
    });

    it("flags DELETE FROM", () => {
      expect(findDestructive("DELETE FROM trades")).toContain("DELETE");
    });

    it("flags UPDATE", () => {
      expect(findDestructive("UPDATE trades SET price = 0")).toContain(
        "UPDATE"
      );
    });

    it("flags TRUNCATE", () => {
      expect(findDestructive("TRUNCATE TABLE logs")).toContain("TRUNCATE");
    });

    it("does not flag a plain SELECT", () => {
      expect(findDestructive("SELECT * FROM trades")).toEqual([]);
    });

    it("does not flag a subquery containing a keyword as a column name", () => {
      expect(findDestructive("SELECT * FROM updates WHERE active = 1")).toEqual(
        []
      );
    });

    it("flags ALTER TABLE", () => {
      expect(findDestructive("ALTER TABLE trades ADD COLUMN x INT")).toContain(
        "ALTER"
      );
    });

    it("flags CREATE even when inside a string literal (false positive is safer than false negative)", () => {
      expect(
        findDestructive("SELECT 'CREATE TABLE foo' AS sql FROM dual")
      ).toContain("CREATE");
    });
  });
});
