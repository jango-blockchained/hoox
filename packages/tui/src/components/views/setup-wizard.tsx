/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Setup Wizard — Prerequisites dashboard + 6-step onboarding.
 *
 * Step 0: Prerequisites — system checks (wrangler, Docker, Cloudflare auth, etc.)
 * Steps 1-6: API Keys, Exchanges, AI Providers, Strategies, Notifications, Deploy
 *
 * Runs system checks on mount via Bun.spawn and displays results with
 * status indicators matching the landing page's HUD-style status display.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import { Colors, useServiceStore } from "@jango-blockchained/hoox-shared";
import { useConfigStore } from "@jango-blockchained/hoox-shared";
import { useUIStore } from "@jango-blockchained/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { ViewHeader } from "../shared/view-header";
import { showConfirm } from "../ui/dialog";
import type { DialogHandle } from "../ui/dialog";
import { cliBridge } from "../../services/cli-bridge";
import { resolveTuiStatePath } from "../../services/hoox-path-service";

// ─── Prerequisite Check Types ───────────────────────────────────────────────

interface PrereqCheck {
  name: string;
  status: "pass" | "warn" | "fail" | "checking";
  version: string;
  required: string;
  hint?: string;
}

interface PrereqGroup {
  label: string;
  checks: PrereqCheck[];
}

// ─── System Check Runner ────────────────────────────────────────────────────

async function spawnVersion(
  cmd: string[],
  flag: string
): Promise<string | null> {
  try {
    const proc = Bun.spawn([...cmd, flag], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    return out.trim();
  } catch {
    return null;
  }
}

function extractSemver(raw: string): string {
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : raw;
}

async function checkBun(): Promise<PrereqCheck> {
  const raw = await spawnVersion(["bun"], "--version");
  if (!raw)
    return {
      name: "Bun",
      status: "fail",
      version: "not found",
      required: ">=1.2",
      hint: "curl -fsSL https://bun.sh | bash",
    };
  const [major, minor] = raw.split(".").map(Number);
  const ok = (major ?? 0) >= 1 && (minor ?? 0) >= 2;
  return {
    name: "Bun",
    status: ok ? "pass" : "warn",
    version: raw,
    required: ">=1.2",
    hint: ok ? undefined : "Update: curl -fsSL https://bun.sh | bash",
  };
}

async function checkGit(): Promise<PrereqCheck> {
  const raw = await spawnVersion(["git"], "--version");
  if (!raw)
    return {
      name: "Git",
      status: "fail",
      version: "not found",
      required: ">=2.40",
      hint: "apt install git",
    };
  const m = raw.match(/(\d+\.\d+)/);
  const ver = m ? m[1] : "unknown";
  const [major, minor] = ver.split(".").map(Number);
  const ok = (major ?? 0) >= 2 && (minor ?? 0) >= 40;
  return {
    name: "Git",
    status: ok ? "pass" : "warn",
    version: ver,
    required: ">=2.40",
    hint: ok ? undefined : "Update: apt install git",
  };
}

async function checkWrangler(): Promise<PrereqCheck> {
  const raw = await spawnVersion(["wrangler"], "--version");
  if (!raw)
    return {
      name: "Wrangler CLI",
      status: "fail",
      version: "not found",
      required: ">=3.88.0",
      hint: "bun add -g wrangler",
    };
  const ver = extractSemver(raw);
  const parts = ver.split(".").map(Number);
  const ok = (parts[0] ?? 0) >= 3 && (parts[1] ?? 0) >= 88;
  return {
    name: "Wrangler CLI",
    status: ok ? "pass" : "warn",
    version: ver,
    required: ">=3.88.0",
    hint: ok ? undefined : `bun add -g wrangler@latest (${ver} < 3.88.0)`,
  };
}

async function checkDocker(): Promise<PrereqCheck> {
  const raw = await spawnVersion(["docker"], "--version");
  if (!raw)
    return {
      name: "Docker",
      status: "pass",
      version: "not installed",
      required: "optional",
      hint: "Optional — used for Docker dev runtime",
    };
  const ver = raw.replace(/^Docker version /, "").replace(/,.*$/, "");
  let composeOk = false;
  try {
    const cp = Bun.spawn(["docker", "compose", "version"], { stdout: "pipe" });
    const co = await new Response(cp.stdout).text();
    composeOk = co.trim().length > 0;
  } catch {
    /* ok */
  }
  const version = ver + (composeOk ? " (compose ✓)" : "");
  return { name: "Docker", status: "pass", version, required: "optional" };
}

async function checkCfAuth(): Promise<PrereqCheck> {
  const raw = await spawnVersion(["wrangler"], "whoami");
  if (!raw || raw.includes("not authenticated")) {
    return {
      name: "Cloudflare Auth",
      status: "fail",
      version: "not authenticated",
      required: "wrangler login",
      hint: "wrangler login",
    };
  }
  const email = raw.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? "authenticated";
  return {
    name: "Cloudflare Auth",
    status: "pass",
    version: email,
    required: "wrangler whoami",
  };
}

async function checkCfAccountId(): Promise<PrereqCheck> {
  try {
    const file = Bun.file("wrangler.jsonc");
    const exists = await file.exists();
    if (!exists) {
      return {
        name: "Cloudflare Account",
        status: "warn",
        version: "not detected",
        required: "wrangler.jsonc",
        hint: "Run: wrangler init or hoox init",
      };
    }
    const text = await file.text();
    const m = text.match(
      /(?:account_id|accountId)\s*["']?\s*:\s*["']([^"']+)["']/
    );
    if (m)
      return {
        name: "Cloudflare Account",
        status: "pass",
        version: m[1].slice(0, 12) + "…",
        required: "wrangler.jsonc",
      };
    return {
      name: "Cloudflare Account",
      status: "warn",
      version: "not in wrangler.jsonc",
      required: "account_id field",
      hint: "Add account_id to wrangler.jsonc",
    };
  } catch {
    return {
      name: "Cloudflare Account",
      status: "fail",
      version: "read error",
      required: "wrangler.jsonc",
    };
  }
}

async function checkRepository(): Promise<PrereqCheck> {
  try {
    const wExists = await Bun.file("wrangler.jsonc").exists();
    const envExists =
      (await Bun.file(".env.local").exists()) ||
      (await Bun.file(".env.example").exists());
    if (!wExists)
      return {
        name: "Repository",
        status: "fail",
        version: "wrangler.jsonc missing",
        required: "valid",
        hint: "hoox init",
      };
    if (!envExists)
      return {
        name: "Repository",
        status: "warn",
        version: "no .env found",
        required: "valid",
        hint: "Copy .env.example to .env.local",
      };
    return {
      name: "Repository",
      status: "pass",
      version: "OK",
      required: "valid",
    };
  } catch {
    return {
      name: "Repository",
      status: "fail",
      version: "check failed",
      required: "valid",
    };
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SETUP_STEPS = [
  "PREREQUISITES",
  "API KEYS",
  "EXCHANGES",
  "AI PROVIDERS",
  "STRATEGIES",
  "NOTIFICATIONS",
  "DEPLOY",
] as const;

const TOTAL_SETUP_STEPS = SETUP_STEPS.length;

/** Exchanges supported by the wizard */
const EXCHANGES = ["Binance", "Bybit", "MEXC"] as const;

/** Strategy types available */
const STRATEGIES = ["grid", "macd", "scalping"] as const;

type StrategyType = (typeof STRATEGIES)[number];

// ─── Form Data Shape ────────────────────────────────────────────────────────

interface ApiKeyEntry {
  key: string;
  secret: string;
}

interface WizardFormData {
  apiKeys: Record<string, ApiKeyEntry>;
  exchanges: Record<string, boolean>;
  ai: { providerUrl: string; apiKey: string; model: string };
  strategy: { type: StrategyType; params: Record<string, string> };
  notifications: {
    email: { enabled: boolean; address: string };
    telegram: { enabled: boolean; botToken: string; chatId: string };
    discord: { enabled: boolean; webhookUrl: string };
  };
}

/** Validation result: null = unchecked, true = valid, false = invalid */
type ValidationState = null | boolean;

// ─── Default Form Data ──────────────────────────────────────────────────────

const defaultFormData = (): WizardFormData => ({
  apiKeys: {
    binance: { key: "", secret: "" },
    bybit: { key: "", secret: "" },
    mexc: { key: "", secret: "" },
  },
  exchanges: { binance: false, bybit: false, mexc: false },
  ai: { providerUrl: "", apiKey: "", model: "default" },
  strategy: { type: "grid", params: {} },
  notifications: {
    email: { enabled: false, address: "" },
    telegram: { enabled: false, botToken: "", chatId: "" },
    discord: { enabled: false, webhookUrl: "" },
  },
});

/**
 * Session persistence file path for wizard state.
 * Survives TUI close/restart so users can resume where they left off.
 * Uses the shared getHooxHome() utility for cross-OS home directory resolution
 * and stores wizard sessions in $HOME/.hoox/.tui-state/.
 */
const WIZARD_SESSION_PATH = resolveTuiStatePath(".wizard-session.json");

// ─── Validation Helpers ─────────────────────────────────────────────────────

/** Basic format check for exchange API keys (non-empty, no whitespace at ends) */
function validateApiKey(value: string): boolean {
  return value.trim().length >= 16 && value === value.trim();
}

/** Basic email format check */
function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Basic URL format check */
function validateUrl(value: string): boolean {
  return /^https?:\/\/.+/.test(value);
}

/** Mask a secret string: show first 4 and last 4 chars, fill middle with •••• */
function maskSecret(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length || 4);
  return value.slice(0, 4) + "••••" + value.slice(-4);
}

// ─── Session Persistence Helpers ─────────────────────────────────────────────

/**
 * Strip secrets / tokens from wizard form data before any disk write.
 * Session resume keeps step + non-secret preferences only.
 *
 * Cleared fields: exchange API keys/secrets, AI apiKey, Telegram bot token,
 * Discord webhook URL. Non-secret toggles, emails, chat IDs, and strategy
 * choices are preserved.
 */
export function redactWizardSecrets(data: WizardFormData): WizardFormData {
  const next = structuredClone(data);
  for (const exchange of Object.keys(next.apiKeys)) {
    next.apiKeys[exchange] = { key: "", secret: "" };
  }
  next.ai = { ...next.ai, apiKey: "" };
  next.notifications = {
    email: { ...next.notifications.email },
    telegram: {
      ...next.notifications.telegram,
      botToken: "",
    },
    discord: {
      ...next.notifications.discord,
      webhookUrl: "",
    },
  };
  return next;
}

/**
 * Persist wizard step + form data + validation state to disk.
 * Fire-and-forget; failures are non-fatal.
 * Secrets are never written to disk (see {@link redactWizardSecrets}).
 */
function persistSession(
  step: number,
  data: WizardFormData,
  validation: Record<string, ValidationState>
) {
  Bun.write(
    WIZARD_SESSION_PATH,
    JSON.stringify({
      step,
      data: redactWizardSecrets(data),
      validation,
    })
  ).catch(() => {});
}

/** Clear saved wizard session (called after successful deploy). */
function clearSessionFile() {
  Bun.write(WIZARD_SESSION_PATH, "").catch(() => {});
}

// ─── Component Props ────────────────────────────────────────────────────────

export interface SetupWizardProps {
  /** Dialog handle for deploy confirmation (injected by parent or default) */
  dialog?: DialogHandle;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SetupWizard({ dialog }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardFormData>(defaultFormData);
  const [validation, setValidation] = useState<Record<string, ValidationState>>(
    {}
  );
  const [prereqs, setPrereqs] = useState<PrereqGroup[]>([]);
  const [prereqsRunning, setPrereqsRunning] = useState(true);
  const [cfAccountId, setCfAccountId] = useState("");
  const [cfApiToken, setCfApiToken] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployLog, setDeployLog] = useState("");

  const updateConfig = useConfigStore((s) => s.updateConfig);
  const setView = useUIStore((s) => s.setView);
  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "setup-wizard";
  const addAlert = useServiceStore((s) => s.addAlert);
  const loadedRef = useRef(false);

  // ── Run system checks on mount ──────────────────────────────────────────
  const runChecks = useCallback(async () => {
    setPrereqsRunning(true);
    setPrereqs([
      { label: "RUNTIME", checks: [await checkBun(), await checkGit()] },
      { label: "TOOLS", checks: [await checkWrangler(), await checkDocker()] },
      {
        label: "CLOUDFLARE",
        checks: [await checkCfAuth(), await checkCfAccountId()],
      },
      { label: "REPOSITORY", checks: [await checkRepository()] },
    ]);
    setPrereqsRunning(false);
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  // ── Detect Cloudflare account ID from wrangler.jsonc ────────────────────
  useEffect(() => {
    (async () => {
      try {
        const file = Bun.file("wrangler.jsonc");
        if (await file.exists()) {
          const text = await file.text();
          const m = text.match(
            /(?:account_id|accountId)\s*["']?\s*:\s*["']([^"']+)["']/
          );
          if (m) setCfAccountId(m[1]);
        }
        const cfgFile = Bun.file(
          `${process.env.HOME ?? "~"}/.hoox/config.json`
        );
        if (await cfgFile.exists()) {
          const cfg = JSON.parse(await cfgFile.text());
          if (cfg.apiToken) setCfApiToken(cfg.apiToken);
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  // ── Restore wizard session from disk on mount ───────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const f = Bun.file(WIZARD_SESSION_PATH);
        if (!(await f.exists())) return;
        const raw = await f.text();
        if (!raw) return;
        const session = JSON.parse(raw);
        if (typeof session.step !== "number" || !session.data) return;
        // Merge saved data with defaults to handle any schema additions
        const merged: WizardFormData = {
          ...defaultFormData(),
          ...session.data,
          apiKeys: { ...defaultFormData().apiKeys, ...session.data.apiKeys },
          exchanges: {
            ...defaultFormData().exchanges,
            ...session.data.exchanges,
          },
          ai: { ...defaultFormData().ai, ...session.data.ai },
          strategy: { ...defaultFormData().strategy, ...session.data.strategy },
          notifications: {
            ...defaultFormData().notifications,
            ...session.data.notifications,
          },
        };
        setStep(session.step);
        // Drop any secrets that older sessions may have written cleartext.
        const safe = redactWizardSecrets(merged);
        setData(safe);
        if (session.validation) setValidation(session.validation);
        // Rewrite session without secrets so disk is cleaned on resume.
        persistSession(session.step, safe, session.validation ?? {});
      } catch {
        /* no saved session or corrupt file */
      }
      loadedRef.current = true;
    })();
  }, []);

  /**
   * Update a field in the form data (deep path via dot notation, e.g. "apiKeys.binance.key")
   * Resets any existing validation for that field.
   */
  const updateField = (path: string, value: string | boolean) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let obj: Record<string, unknown> = next as unknown as Record<
        string,
        unknown
      >;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (key === "__proto__" || key === "constructor" || key === "prototype")
          return prev;
        obj = obj[key] as Record<string, unknown>;
      }
      const lastKey = keys[keys.length - 1];
      if (
        lastKey === "__proto__" ||
        lastKey === "constructor" ||
        lastKey === "prototype"
      )
        return prev;
      obj[lastKey] = value;
      return next;
    });
    setValidation((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  };

  /** Validate the current step's fields */
  const validateStep = (): boolean => {
    const results: Record<string, ValidationState> = {};
    let allValid = true;

    if (step === 1) {
      for (const exchange of EXCHANGES) {
        const e = exchange.toLowerCase();
        const keyPath = `apiKeys.${e}.key`;
        const secretPath = `apiKeys.${e}.secret`;
        const key = data.apiKeys[e].key;
        const secret = data.apiKeys[e].secret;
        if (key) {
          results[keyPath] = validateApiKey(key);
          if (!results[keyPath]) allValid = false;
        }
        if (secret) {
          results[secretPath] = validateApiKey(secret);
          if (!results[secretPath]) allValid = false;
        }
      }
    } else if (step === 5) {
      if (data.notifications.email.enabled) {
        results["notifications.email.address"] = data.notifications.email
          .address
          ? validateEmail(data.notifications.email.address)
          : false;
        if (!results["notifications.email.address"]) allValid = false;
      }
      if (data.notifications.telegram.enabled) {
        results["notifications.telegram.botToken"] = data.notifications.telegram
          .botToken
          ? data.notifications.telegram.botToken.trim().length > 0
          : false;
        if (!results["notifications.telegram.botToken"]) allValid = false;
      }
      if (data.notifications.discord.enabled) {
        results["notifications.discord.webhookUrl"] = data.notifications.discord
          .webhookUrl
          ? validateUrl(data.notifications.discord.webhookUrl)
          : false;
        if (!results["notifications.discord.webhookUrl"]) allValid = false;
      }
    }

    setValidation((prev) => ({ ...prev, ...results }));
    return allValid;
  };

  /** Advance to next step */
  const handleNext = () => {
    if (step === 0) {
      if (!prereqsRunning) {
        const next = 1;
        setStep(next);
        persistSession(next, data, validation);
      }
      return;
    }
    if (validateStep() && step < TOTAL_SETUP_STEPS - 1) {
      const next = step + 1;
      setStep(next);
      persistSession(next, data, validation);
    }
  };

  /** Go back to previous step */
  const handleBack = () => {
    if (step > 0) {
      const prev = step - 1;
      setStep(prev);
      persistSession(prev, data, validation);
    }
  };

  /** Skip current step (optional steps only) */
  const handleSkip = () => {
    if (step < TOTAL_SETUP_STEPS - 1) {
      if (step === 2 || step === 4) {
        const next = step + 1;
        setStep(next);
        persistSession(next, data, validation);
      }
    }
  };

  /** Deploy: write config, run hoox deploy all, navigate on success */
  const handleDeploy = async () => {
    try {
      const activeExchanges = Object.entries(data.exchanges)
        .filter(([, v]) => v)
        .map(([k]) => k);

      updateConfig({ activeExchanges });

      // Fail closed: never deploy without an interactive confirm surface.
      if (!dialog) {
        addAlert({
          id: `deploy-noconfirm-${Date.now()}`,
          type: "deploy",
          severity: "warning",
          message: "Deploy blocked: confirmation dialog unavailable",
          timestamp: Date.now(),
          acknowledged: false,
          source: "SetupWizard",
        });
        return;
      }
      const confirmed = await showConfirm(dialog, {
        title: "Deploy Configuration",
        message: "Save setup and apply configuration to Cloudflare?",
        confirmLabel: "Deploy",
        cancelLabel: "Cancel",
      });
      if (!confirmed) return;

      setDeploying(true);
      setDeployLog("");

      const result = await cliBridge.deployAll((chunk) => {
        setDeployLog((prev) => prev + chunk);
      });

      if (result.success) {
        addAlert({
          id: `deploy-${Date.now()}`,
          type: "deploy",
          severity: "info",
          message: "Deployment completed successfully",
          timestamp: Date.now(),
          acknowledged: false,
          source: "SetupWizard",
        });
        clearSessionFile();
        setView("dashboard");
      } else {
        setDeployLog(
          (prev) =>
            prev + `\nDeploy failed: ${result.stderr || "Unknown error"}\n`
        );
      }
    } catch (err) {
      setDeployLog(
        (prev) => prev + `\nDeploy error: ${(err as Error).message}\n`
      );
    } finally {
      setDeploying(false);
    }
  };

  // ── Keyboard navigation (only when Setup Wizard is active) ──────────────
  useKeyboard((key) => {
    if (!isActive) return;
    if (key.name === "right" || (key.ctrl && key.name === "n")) handleNext();
    if (key.name === "left" || (key.ctrl && key.name === "p")) handleBack();
    if (key.name === "escape") handleBack();
    if (key.name === "tab" && key.shift) handleBack();
    if (key.name === "r" && step === 0) runChecks();
  });

  // ── Validation indicator for a field ─────────────────────────────────────
  const ValidationIcon = ({ fieldPath }: { fieldPath: string }) => {
    const state = validation[fieldPath];
    if (state === null) return null;
    return (
      <text fg={state ? Colors.success : Colors.error}>
        {state ? " ✓" : " ✗"}
      </text>
    );
  };

  // ── Masked input for secrets ────────────────────────────────────────────
  const SecretField = ({
    label,
    value,
    path,
    width,
  }: {
    label: string;
    value: string;
    path: string;
    width?: number;
  }) => (
    <box flexDirection="row" gap={1}>
      <text fg={Colors.muted} width={16}>
        {label}
      </text>
      <text fg={value ? Colors.muted : Colors.dim} width={width ?? 24}>
        {value ? maskSecret(value) : "(not set)"}
      </text>
      <ValidationIcon fieldPath={path} />
    </box>
  );

  // ── Checkbox toggle ─────────────────────────────────────────────────────
  const Checkbox = ({
    label,
    checked,
    path,
  }: {
    label: string;
    checked: boolean;
    path: string;
  }) => (
    <box flexDirection="row" gap={1}>
      <text
        fg={checked ? Colors.accent : Colors.muted}
        onMouseUp={() => updateField(path, !checked)}
      >
        {checked ? "[x]" : "[ ]"}
      </text>
      <text fg={Colors.foreground}>{label}</text>
    </box>
  );

  // ── Status Icon helper ──────────────────────────────────────────────────
  const StatusIcon = ({ status }: { status: PrereqCheck["status"] }) => {
    if (status === "checking") return <text fg={Colors.muted}>⋯</text>;
    if (status === "pass") return <text fg={Colors.success}>█</text>;
    if (status === "warn") return <text fg={Colors.warning}>▌</text>;
    return (
      <text fg={Colors.error} dim>
        ░
      </text>
    );
  };

  // ── Step Content: PREREQUISITES (step 0) ────────────────────────────────
  const StepPrerequisites = () => {
    const allPassed = prereqs.every((g) =>
      g.checks.every((c) => c.status === "pass")
    );
    return (
      <box flexDirection="column" gap={1}>
        {/* System checks grid */}
        {prereqs.map((group) => (
          <box flexDirection="column" gap={0}>
            <text bold fg={Colors["muted-foreground"]} dim>
              ┌ {group.label} ┐
            </text>
            {group.checks.map((c) => (
              <box flexDirection="row" gap={2} paddingLeft={2}>
                <StatusIcon status={c.status} />
                <text fg={Colors.foreground} width={20}>
                  {c.name}
                </text>
                <text
                  fg={
                    c.status === "pass"
                      ? Colors.success
                      : c.status === "warn"
                        ? Colors.warning
                        : Colors.error
                  }
                >
                  {c.status === "checking"
                    ? "CHECKING"
                    : c.status === "pass"
                      ? "PASS"
                      : c.status === "warn"
                        ? "WARN"
                        : "FAIL"}
                </text>
                <text fg={Colors.muted}>{c.version}</text>
                {c.hint && (
                  <text fg={Colors.dim} dim>
                    — {c.hint}
                  </text>
                )}
              </box>
            ))}
          </box>
        ))}

        {/* Cloudflare config card */}
        <box flexDirection="column" gap={0} paddingTop={1}>
          <text bold fg={Colors["muted-foreground"]} dim>
            ┌ CLOUDFLARE CONFIG ┐
          </text>
          <box flexDirection="column" gap={0} paddingLeft={2}>
            <box flexDirection="row" gap={2}>
              <text fg={Colors.muted} width={14}>
                Account ID:
              </text>
              <text fg={cfAccountId ? Colors.success : Colors.warning}>
                {cfAccountId || "(auto-detect)"}
              </text>
              {cfAccountId && <text fg={Colors.success}> ✓</text>}
            </box>
            <box flexDirection="row" gap={2}>
              <text fg={Colors.muted} width={14}>
                API Token:
              </text>
              <text fg={cfApiToken ? Colors.success : Colors.dim}>
                {cfApiToken ? maskSecret(cfApiToken) : "(not set)"}
              </text>
              {cfApiToken && <text fg={Colors.success}> ✓</text>}
            </box>
          </box>
        </box>

        {/* Overall status */}
        <box paddingTop={1} paddingLeft={2}>
          <text fg={allPassed ? Colors.success : Colors.warning} bold>
            {prereqsRunning
              ? "RUNNING CHECKS…"
              : allPassed
                ? "ALL CHECKS PASSED"
                : "SOME CHECKS NEED ATTENTION"}
          </text>
        </box>
      </box>
    );
  };

  // ── Step Content Renderers (shifted: old step N is now step N+1) ────────

  /** Step 1: API Keys */
  const StepApiKeys = () => (
    <box flexDirection="column" gap={0}>
      <text bold fg={Colors.accent}>
        Exchange API Keys
      </text>
      <text dim fg={Colors.muted}>
        Enter your exchange API credentials. Secrets are stored encrypted.
      </text>
      <box flexDirection="column" gap={1} paddingTop={1}>
        {EXCHANGES.map((name) => {
          const e = name.toLowerCase();
          return (
            <box flexDirection="column" gap={0}>
              <text bold fg={Colors.foreground}>
                {name}
              </text>
              <SecretField
                label="  API Key"
                value={data.apiKeys[e].key}
                path={`apiKeys.${e}.key`}
              />
              <SecretField
                label="  API Secret"
                value={data.apiKeys[e].secret}
                path={`apiKeys.${e}.secret`}
              />
            </box>
          );
        })}
      </box>
    </box>
  );

  /** Step 2: Exchanges */
  const StepExchanges = () => (
    <box flexDirection="column" gap={0}>
      <text bold fg={Colors.accent}>
        Active Exchanges
      </text>
      <text dim fg={Colors.muted}>
        Enable the exchanges you want to trade on.
      </text>
      <box flexDirection="column" gap={0} paddingTop={1}>
        {EXCHANGES.map((name) => (
          <Checkbox
            label={name}
            checked={data.exchanges[name.toLowerCase()]}
            path={`exchanges.${name.toLowerCase()}`}
          />
        ))}
      </box>
    </box>
  );

  /** Step 3: AI Providers */
  const StepAiProviders = () => (
    <box flexDirection="column" gap={0}>
      <text bold fg={Colors.accent}>
        AI Provider
      </text>
      <text dim fg={Colors.muted}>
        Configure the AI endpoint for strategy generation.
      </text>
      <box flexDirection="column" gap={1} paddingTop={1}>
        <box flexDirection="row" gap={1}>
          <text fg={Colors.muted} width={12}>
            Provider URL
          </text>
          <text fg={data.ai.providerUrl ? Colors.foreground : Colors.dim}>
            {data.ai.providerUrl || "(not set)"}
          </text>
        </box>
        <SecretField label="API Key" value={data.ai.apiKey} path="ai.apiKey" />
        <box flexDirection="row" gap={1}>
          <text fg={Colors.muted} width={12}>
            Model
          </text>
          <text fg={Colors.foreground}>{data.ai.model}</text>
        </box>
      </box>
    </box>
  );

  /** Step 4: Strategies */
  const StepStrategies = () => (
    <box flexDirection="column" gap={0}>
      <text bold fg={Colors.accent}>
        Trading Strategy
      </text>
      <text dim fg={Colors.muted}>
        Select your primary trading strategy.
      </text>
      <box flexDirection="column" gap={0} paddingTop={1}>
        {STRATEGIES.map((s) => (
          <box flexDirection="row" gap={1}>
            <text
              fg={data.strategy.type === s ? Colors.accent : Colors.muted}
              onMouseUp={() => {
                setData((prev) => ({
                  ...prev,
                  strategy: { ...prev.strategy, type: s },
                }));
              }}
            >
              {data.strategy.type === s ? "(•) " : "( ) "}
            </text>
            <text fg={Colors.foreground}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </text>
          </box>
        ))}
      </box>
    </box>
  );

  /** Step 5: Notifications */
  const StepNotifications = () => (
    <box flexDirection="column" gap={0}>
      <text bold fg={Colors.accent}>
        Notifications
      </text>
      <text dim fg={Colors.muted}>
        Configure alert channels for trade events and system status.
      </text>
      <box flexDirection="column" gap={1} paddingTop={1}>
        <box flexDirection="column" gap={0}>
          <Checkbox
            label="Email"
            checked={data.notifications.email.enabled}
            path="notifications.email.enabled"
          />
          {data.notifications.email.enabled && (
            <box flexDirection="row" gap={1} paddingLeft={3}>
              <text fg={Colors.muted} width={10}>
                Address
              </text>
              <text fg={Colors.foreground}>
                {data.notifications.email.address || "(enter address)"}
              </text>
              <ValidationIcon fieldPath="notifications.email.address" />
            </box>
          )}
        </box>

        <box flexDirection="column" gap={0}>
          <Checkbox
            label="Telegram"
            checked={data.notifications.telegram.enabled}
            path="notifications.telegram.enabled"
          />
          {data.notifications.telegram.enabled && (
            <box flexDirection="column" gap={0} paddingLeft={3}>
              <SecretField
                label="Bot Token"
                value={data.notifications.telegram.botToken}
                path="notifications.telegram.botToken"
              />
              <ValidationIcon fieldPath="notifications.telegram.botToken" />
              <box flexDirection="row" gap={1}>
                <text fg={Colors.muted} width={10}>
                  Chat ID
                </text>
                <text fg={Colors.foreground}>
                  {data.notifications.telegram.chatId || "(enter ID)"}
                </text>
              </box>
            </box>
          )}
        </box>

        <box flexDirection="column" gap={0}>
          <Checkbox
            label="Discord"
            checked={data.notifications.discord.enabled}
            path="notifications.discord.enabled"
          />
          {data.notifications.discord.enabled && (
            <box flexDirection="row" gap={1} paddingLeft={3}>
              <text fg={Colors.muted} width={12}>
                Webhook URL
              </text>
              <text
                fg={
                  data.notifications.discord.webhookUrl
                    ? Colors.foreground
                    : Colors.dim
                }
              >
                {data.notifications.discord.webhookUrl
                  ? maskSecret(data.notifications.discord.webhookUrl)
                  : "(enter URL)"}
              </text>
              <ValidationIcon fieldPath="notifications.discord.webhookUrl" />
            </box>
          )}
        </box>
      </box>
    </box>
  );

  /** Step 6: Deploy — Summary view */
  const StepDeploy = () => {
    const activeCount = Object.values(data.exchanges).filter(Boolean).length;
    const apiKeysConfigured = Object.values(data.apiKeys).filter(
      (e) => e.key || e.secret
    ).length;
    const notifCount = [
      data.notifications.email.enabled,
      data.notifications.telegram.enabled,
      data.notifications.discord.enabled,
    ].filter(Boolean).length;

    return (
      <box flexDirection="column" gap={0}>
        {deploying ? (
          <>
            <text bold fg={Colors.accent}>
              Deploying…
            </text>
            <text dim fg={Colors.muted}>
              Running hoox deploy all — this may take a few minutes.
            </text>
            <box
              flexDirection="column"
              gap={0}
              paddingTop={1}
              height={10}
              overflow="hidden"
            >
              <scrollbox border={false} flexGrow={1}>
                <text fg={Colors.foreground}>{deployLog || "Starting…\n"}</text>
              </scrollbox>
            </box>
            <box paddingTop={1}>
              <text dim fg={Colors.muted}>
                Deploying workers, please wait…
              </text>
            </box>
          </>
        ) : deployLog ? (
          <>
            <text bold fg={Colors.error}>
              Deploy Failed
            </text>
            <box
              flexDirection="column"
              gap={0}
              paddingTop={1}
              height={8}
              overflow="hidden"
            >
              <scrollbox border={false} flexGrow={1}>
                <text fg={Colors.error}>{deployLog}</text>
              </scrollbox>
            </box>
            <box paddingTop={2} justifyContent="center">
              <text
                fg={Colors.accent}
                bg={Colors.card}
                bold
                onMouseUp={() => {
                  setDeployLog("");
                  handleDeploy();
                }}
              >
                {"  [ Retry Deploy ]  "}
              </text>
            </box>
          </>
        ) : (
          <>
            <text bold fg={Colors.accent}>
              Ready to Deploy
            </text>
            <text dim fg={Colors.muted}>
              Review your configuration before deploying.
            </text>
            <box flexDirection="column" gap={0} paddingTop={1}>
              <text fg={Colors.foreground}>
                Exchanges: {activeCount} active (
                {data.exchanges.binance ? "Binance " : ""}
                {data.exchanges.bybit ? "Bybit " : ""}
                {data.exchanges.mexc ? "MEXC" : ""}
                {activeCount === 0 ? "none" : ""})
              </text>
              <text fg={Colors.foreground}>
                API Keys: {apiKeysConfigured}/3 configured
              </text>
              <text fg={Colors.foreground}>
                AI Provider:{" "}
                {data.ai.providerUrl ? data.ai.model : "not configured"}
              </text>
              <text fg={Colors.foreground}>Strategy: {data.strategy.type}</text>
              <text fg={Colors.foreground}>
                Notifications: {notifCount} channels
                {data.notifications.email.enabled ? " Email" : ""}
                {data.notifications.telegram.enabled ? " Telegram" : ""}
                {data.notifications.discord.enabled ? " Discord" : ""}
                {notifCount === 0 ? " none" : ""}
              </text>
            </box>
            <box paddingTop={2} justifyContent="center">
              <text
                fg={deploying ? Colors.dim : Colors.accent}
                bg={deploying ? Colors.border : Colors.card}
                bold
                onMouseUp={deploying ? undefined : handleDeploy}
              >
                {"  [ Deploy Now ]  "}
              </text>
            </box>
          </>
        )}
      </box>
    );
  };

  // ─── Progress Indicator ─────────────────────────────────────────────────

  const progressLine = SETUP_STEPS.map((label, i) => {
    const isFilled = i <= step;
    const isCurrent = i === step;
    return (
      <text
        fg={isCurrent ? Colors.accent : isFilled ? Colors.success : Colors.dim}
        bold={isCurrent}
      >
        {isFilled ? "█" : "░"} {label}
        {"  "}
      </text>
    );
  });

  // ─── Current Step Content ────────────────────────────────────────────────

  const stepContent = (() => {
    switch (step) {
      case 0:
        return <StepPrerequisites />;
      case 1:
        return <StepApiKeys />;
      case 2:
        return <StepExchanges />;
      case 3:
        return <StepAiProviders />;
      case 4:
        return <StepStrategies />;
      case 5:
        return <StepNotifications />;
      case 6:
        return <StepDeploy />;
      default:
        return <text>Unknown step</text>;
    }
  })();

  const isFirstStep = step === 0;
  const isLastStep = step === TOTAL_SETUP_STEPS - 1;
  const canSkip = step === 2 || step === 4;

  return (
    <ErrorBoundary viewName="Setup Wizard">
      <box flexDirection="column" flexGrow={1} padding={2} gap={1}>
        <ViewHeader
          title={`SETUP — STEP ${step + 1}/${TOTAL_SETUP_STEPS}`}
          showDivider={false}
          meta={
            <text fg={Colors.muted} dim>
              {SETUP_STEPS[step]}
            </text>
          }
        />

        {/* Progress Indicator */}
        <box flexDirection="row" gap={0} paddingBottom={1}>
          {progressLine}
        </box>

        {/* Separator */}
        <text fg={Colors.border} dim>
          {"─".repeat(TOTAL_SETUP_STEPS * 16)}
        </text>

        {/* Step Content (scrollbox for overflow) */}
        <scrollbox flexGrow={1} border={false}>
          {stepContent}
        </scrollbox>

        {/* Navigation Bar */}
        <box flexDirection="row" justifyContent="space-between" paddingTop={1}>
          <text
            fg={isFirstStep ? Colors.dim : Colors.muted}
            onMouseUp={isFirstStep ? undefined : handleBack}
          >
            {isFirstStep ? "            " : "[← BACK]"}
          </text>

          <text
            fg={canSkip && !isLastStep ? Colors.muted : Colors.dim}
            onMouseUp={canSkip && !isLastStep ? handleSkip : undefined}
          >
            {canSkip && !isLastStep ? "[SKIP]" : ""}
          </text>

          <text
            fg={isLastStep ? Colors.dim : Colors.accent}
            bold={!isLastStep}
            onMouseUp={isLastStep ? undefined : handleNext}
          >
            {isLastStep ? "" : "[NEXT →]"}
          </text>
        </box>

        {/* Keybindings hint */}
        <text dim fg={Colors.dim}>
          ← → NAVIGATE · ESC BACK · R RE-RUN CHECKS · OPTIONAL STEPS SKIPPABLE
        </text>
      </box>
    </ErrorBoundary>
  );
}
