/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interactive TUI loop for the Hoox CLI.
 *
 * When `hoox` is called with no arguments, this module takes over:
 * shows the ASCII banner, an interactive clack menu, dispatches to
 * the appropriate Commander action, and returns to the menu.
 */

import { Command } from "commander";
import {
  intro,
  outro,
  select,
  text,
  confirm,
  log,
  isCancel,
  cancel,
} from "@clack/prompts";
import { animateBanner, DISCLAIMER } from "./banner.js";
import { CLIError } from "../utils/errors.js";
import { formatError } from "../utils/formatters.js";
import { theme } from "../utils/theme.js";

/** Commands that block the interactive loop until the process exits. */
const LONG_RUNNING = new Set([
  "tui",
  "dev start",
  "dashboard dev",
  "logs",
  "logs all",
]);

function isLongRunning(commandStr: string): boolean {
  const normalized = commandStr.trim();
  if (LONG_RUNNING.has(normalized)) return true;
  // `logs worker X` / `workers logs X` / `workers dev X` / `dev worker X`
  if (/^(logs|workers logs|workers dev|dev worker)\b/.test(normalized)) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Run the interactive TUI loop.
 * - Shows the (animated when TTY) banner once
 * - Shows a category-selection menu
 * - Each category leads to sub-actions
 * - After each action, returns to the menu
 * - Exit or Ctrl+C to quit
 */
export async function runInteractiveTUI(program: Command): Promise<void> {
  // Compact HOOX wordmark (animates on TTY, static otherwise)
  await animateBanner();
  process.stdout.write("\n");
  intro("hoox");

  while (true) {
    const category = await showMainMenu();
    if (category === "__exit") break;

    const result = await handleCategory(category, program);
    if (result === "exit") break;
    // "back" or "continue" → loop back to main menu
  }

  // Legal footer
  process.stdout.write(
    theme.dim("─".repeat(50)) + "\n" + theme.muted(DISCLAIMER) + "\n"
  );
  outro("See you later!");
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

const MAIN_CATEGORIES = [
  {
    value: "setup",
    label: "⚡ Setup",
    hint: "onboard, init, setup, doctor",
  },
  { value: "deploy", label: "Deploy", hint: "workers, dashboard" },
  {
    value: "manage",
    label: "Manage",
    hint: "infrastructure, config, secrets, repair",
  },
  {
    value: "monitor",
    label: "Monitor",
    hint: "diagnostics, health, logs, tests",
  },
  {
    value: "tools",
    label: "Tools",
    hint: "TUI, clone, dashboard, WAF, agent, pyne",
  },
  { value: "develop", label: "Develop", hint: "dev server, start project" },
  { value: "__exit", label: "Exit" },
] as const;

async function showMainMenu(): Promise<string> {
  const choice = await select({
    message: "What would you like to do?",
    options: [...MAIN_CATEGORIES],
  });

  if (isCancel(choice)) {
    cancel("Operation cancelled.");
    return "__exit";
  }

  return choice;
}

// ---------------------------------------------------------------------------
// Category handlers
// ---------------------------------------------------------------------------

/**
 * Handle a selected category. Returns "back", "exit", or "continue".
 */
async function handleCategory(
  category: string,
  program: Command
): Promise<"back" | "exit" | "continue"> {
  switch (category) {
    case "setup":
      return showSetupMenu(program);
    case "deploy":
      return showDeployMenu(program);
    case "develop":
      return showDevelopMenu(program);
    case "manage":
      return showManageMenu(program);
    case "monitor":
      return showMonitorMenu(program);
    case "tools":
      return showToolsMenu(program);
    default:
      return "back";
  }
}

// ---------------------------------------------------------------------------
// Setup sub-menu
// ---------------------------------------------------------------------------

async function showSetupMenu(
  program: Command
): Promise<"back" | "exit" | "continue"> {
  while (true) {
    const choice = await select({
      message: "Setup",
      options: [
        {
          value: "onboard",
          label: "Onboard (recommended)",
          hint: "init + setup end-to-end",
        },
        {
          value: "init",
          label: "Init only",
          hint: "write wrangler.jsonc + collect secrets",
        },
        {
          value: "setup",
          label: "Setup only",
          hint: "keys, D1 schema, secrets, dashboard",
        },
        {
          value: "doctor",
          label: "Doctor",
          hint: "paths, TUI entry, security hygiene",
        },
        { value: "__back", label: "◀ Back to main menu" },
      ],
    });

    if (isCancel(choice)) return "back";
    if (choice === "__back") return "continue";

    await runCommand(program, choice);
  }
}

// ---------------------------------------------------------------------------
// Deploy sub-menu
// ---------------------------------------------------------------------------

async function showDeployMenu(
  program: Command
): Promise<"back" | "exit" | "continue"> {
  while (true) {
    const choice = await select({
      message: "Deploy",
      options: [
        { value: "all", label: "All workers + dashboard", hint: "recommended" },
        { value: "workers", label: "Workers only" },
        { value: "single", label: "Single worker..." },
        { value: "dashboard", label: "Dashboard only" },
        { value: "__back", label: "◀ Back to main menu" },
      ],
    });

    if (isCancel(choice)) return "back";
    if (choice === "__back") return "continue";

    if (choice === "single") {
      const name = await text({
        message: "Which worker?",
        placeholder: "e.g. hoox, trade-worker, d1-worker",
        validate: (v) =>
          v === undefined || v.length === 0
            ? "Worker name is required"
            : undefined,
      });
      if (isCancel(name)) continue;
      if (!name) continue;
      await runCommand(program, `deploy worker ${name}`);
    } else {
      const cmd = choice === "all" ? "deploy all" : `deploy ${choice}`;
      await runCommand(program, cmd);
    }
  }
}

// ---------------------------------------------------------------------------
// Develop sub-menu
// ---------------------------------------------------------------------------

async function showDevelopMenu(
  program: Command
): Promise<"back" | "exit" | "continue"> {
  while (true) {
    const choice = await select({
      message: "Develop",
      options: [
        {
          value: "dev start",
          label: "Start dev server",
          hint: "runs all workers locally",
        },
        { value: "__back", label: "◀ Back to main menu" },
      ],
    });

    if (isCancel(choice)) return "back";
    if (choice === "__back") return "continue";

    await runCommand(program, choice);
  }
}

// ---------------------------------------------------------------------------
// Manage sub-menu
// ---------------------------------------------------------------------------

async function showManageMenu(
  program: Command
): Promise<"back" | "exit" | "continue"> {
  while (true) {
    const choice = await select({
      message: "Manage",
      options: [
        {
          value: "infra provision",
          label: "Infrastructure",
          hint: "provision D1, R2, KV, Queues",
        },
        {
          value: "config",
          label: "Configuration",
          hint: "show / set wrangler.jsonc",
        },
        { value: "secrets", label: "Secrets", hint: "list, set, sync" },
        { value: "keys", label: "Auth keys", hint: "generate, list" },
        {
          value: "repair check",
          label: "Repair check",
          hint: "diagnose workers / infra / secrets",
        },
        {
          value: "db list",
          label: "Database",
          hint: "list tables (use CLI for apply/migrate)",
        },
        { value: "__back", label: "◀ Back to main menu" },
      ],
    });

    if (isCancel(choice)) return "back";
    if (choice === "__back") return "continue";

    switch (choice) {
      case "infra provision":
        await runCommand(program, "infra provision");
        break;
      case "config":
        await showConfigSubMenu(program);
        break;
      case "secrets":
        await showSecretsSubMenu(program);
        break;
      case "keys":
        await showKeysSubMenu(program);
        break;
      case "repair check":
        await runCommand(program, "repair check");
        break;
      case "db list":
        await runCommand(program, "db list");
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Config sub-sub-menu
// ---------------------------------------------------------------------------

async function showConfigSubMenu(program: Command): Promise<void> {
  const choice = await select({
    message: "Configuration",
    options: [
      { value: "show", label: "Show config", hint: "display wrangler.jsonc" },
      { value: "set", label: "Set a value..." },
      { value: "__back", label: "◀ Back to Manage" },
    ],
  });

  if (isCancel(choice) || choice === "__back") return;

  if (choice === "set") {
    const key = await text({
      message: "Config key (dot-separated path)",
      placeholder: "e.g. global.cloudflare_account_id",
      validate: (v) =>
        v === undefined || v.length === 0 ? "Key is required" : undefined,
    });
    if (isCancel(key) || !key) return;

    const value = await text({
      message: `Value for "${key}"`,
      placeholder: "enter value",
    });
    if (isCancel(value) || value === undefined) return;

    await runCommand(program, `config set ${key} ${value ?? ""}`);
  } else {
    await runCommand(program, "config show");
  }
}

// ---------------------------------------------------------------------------
// Secrets sub-sub-menu
// ---------------------------------------------------------------------------

async function showSecretsSubMenu(program: Command): Promise<void> {
  const choice = await select({
    message: "Secrets",
    options: [
      { value: "list", label: "List secrets" },
      { value: "set", label: "Set a secret..." },
      { value: "sync", label: "Sync to Cloudflare" },
      { value: "__back", label: "◀ Back to Manage" },
    ],
  });

  if (isCancel(choice) || choice === "__back") return;

  switch (choice) {
    case "list":
      await runCommand(program, "secrets list");
      break;
    case "set": {
      const worker = await text({
        message: "Worker name",
        placeholder: "e.g. hoox, trade-worker",
        validate: (v) =>
          v === undefined || v.length === 0
            ? "Worker name is required"
            : undefined,
      });
      if (isCancel(worker) || !worker) return;

      const secretName = await text({
        message: "Secret name",
        placeholder: "e.g. API_KEY, DATABASE_URL",
        validate: (v) =>
          v === undefined || v.length === 0
            ? "Secret name is required"
            : undefined,
      });
      if (isCancel(secretName) || !secretName) return;

      await runCommand(program, `secrets set ${worker} ${secretName}`);
      break;
    }
    case "sync":
      await runCommand(program, "secrets sync --system");
      break;
  }
}

// ---------------------------------------------------------------------------
// Keys sub-sub-menu
// ---------------------------------------------------------------------------

async function showKeysSubMenu(program: Command): Promise<void> {
  const choice = await select({
    message: "Auth Keys",
    options: [
      { value: "generate", label: "Generate new keys" },
      { value: "list", label: "List existing keys" },
      { value: "__back", label: "◀ Back to Manage" },
    ],
  });

  if (isCancel(choice) || choice === "__back") return;

  if (choice === "generate") {
    const proceed = await confirm({
      message:
        "Generate new internal auth keys? This will create .keys/*.env files.",
      initialValue: false,
    });
    if (isCancel(proceed) || !proceed) return;
  }

  await runCommand(program, `keys ${choice}`);
}

// ---------------------------------------------------------------------------
// Monitor sub-menu
// ---------------------------------------------------------------------------

async function showMonitorMenu(
  program: Command
): Promise<"back" | "exit" | "continue"> {
  while (true) {
    const choice = await select({
      message: "Monitor",
      options: [
        {
          value: "check setup",
          label: "Run diagnostics",
          hint: "full system validation",
        },
        {
          value: "check health",
          label: "Health check",
          hint: "worker connectivity",
        },
        { value: "check fix", label: "Auto-repair", hint: "fix common issues" },
        { value: "__logs", label: "View logs", hint: "real-time log tailing" },
        { value: "test", label: "Run tests" },
        { value: "__back", label: "◀ Back to main menu" },
      ],
    });

    if (isCancel(choice)) return "back";
    if (choice === "__back") return "continue";

    if (choice === "__logs") {
      const target = await select({
        message: "Tail logs for",
        options: [
          { value: "all", label: "All workers" },
          { value: "single", label: "A specific worker..." },
          { value: "__back", label: "◀ Back" },
        ],
      });
      if (isCancel(target) || target === "__back") continue;
      if (target === "single") {
        const name = await text({
          message: "Worker name",
          placeholder: "e.g. hoox, trade-worker, d1-worker",
        });
        if (isCancel(name) || !name) continue;
        await runCommand(program, `logs worker ${name}`);
      } else {
        await runCommand(program, "logs all");
      }
      continue;
    }

    await runCommand(program, choice);
  }
}

// ---------------------------------------------------------------------------
// Tools sub-menu
// ---------------------------------------------------------------------------

async function showToolsMenu(
  program: Command
): Promise<"back" | "exit" | "continue"> {
  while (true) {
    const choice = await select({
      message: "Tools",
      options: [
        {
          value: "tui",
          label: "Launch TUI Dashboard",
          hint: "blocks until exit",
        },
        {
          value: "clone",
          label: "Clone worker",
          hint: "git submodule checkout",
        },
        {
          value: "dashboard deploy",
          label: "Deploy dashboard",
          hint: "build & deploy web dashboard",
        },
        {
          value: "dashboard dev",
          label: "Dashboard dev server",
          hint: "blocks until exit",
        },
        {
          value: "waf status",
          label: "WAF status",
          hint: "current mode and rules summary",
        },
        {
          value: "agent health",
          label: "Agent health",
          hint: "AI provider key check",
        },
        {
          value: "pyne health",
          label: "PYNE health",
          hint: "pyne-worker GET /health",
        },
        {
          value: "pyne sync-vendor",
          label: "PYNE sync-vendor",
          hint: "vendor pynescript for deploy",
        },
        {
          value: "pyne deploy",
          label: "PYNE deploy",
          hint: "sync-vendor + wrangler deploy",
        },
        { value: "__back", label: "◀ Back to main menu" },
      ],
    });

    if (isCancel(choice)) return "back";
    if (choice === "__back") return "continue";

    await runCommand(program, choice);
  }
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

/**
 * Run a Commander command string inside the TUI loop.
 *
 * Delegates to `program.parseAsync()` with the given arguments.
 * Wraps in try-catch so errors don't terminate the loop.
 * Long-running commands (dev, tui, logs) require confirmation so the
 * menu does not appear "hung".
 */
async function runCommand(program: Command, commandStr: string): Promise<void> {
  if (isLongRunning(commandStr)) {
    const proceed = await confirm({
      message: `"${commandStr}" runs until you stop it. Leave the menu?`,
      initialValue: true,
    });
    if (isCancel(proceed) || !proceed) {
      log.info("Cancelled.");
      return;
    }
  }

  const args = commandStr.split(" ").filter(Boolean);

  try {
    // from: "user" means Commander expects raw user arguments only —
    // NOT [node, script, ...args] format. So just pass the args directly.
    await program.parseAsync(args, {
      from: "user",
    });
  } catch (err) {
    // Check if it's a Commander informational exit (help/version)
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "commander.helpDisplayed"
    ) {
      return;
    }

    if (err instanceof CLIError) {
      formatError(err, { inCard: false });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      formatError(new CLIError(message, undefined, undefined, true), {
        inCard: false,
      });
    }
  }
}
