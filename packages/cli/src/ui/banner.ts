/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hoox CLI top banner — compact HOOX wordmark only (no geometric mark).
 *
 * Small multi-line ASCII wordmark + tagline/version. On a TTY,
 * `animateBanner()` does a short type-in + shimmer, then settles.
 * Non-TTY / CI / NO_COLOR get a single static frame.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ansis from "ansis";
import { theme, stripAnsi } from "../utils/theme.js";

// ── Brand palette ─────────────────────────────────────────────────

const ORANGE = ansis.hex("#ff7f2a");
const AMBER = ansis.hex("#ffb722");
const INDIGO = ansis.hex("#818cf8");
const INDIGO_SOFT = ansis.hex("#a5b4fc");
const ZINC = ansis.hex("#a1a1aa");
const ZINC_FAINT = ansis.hex("#52525b");
const ZINC_SOFT = ansis.hex("#71717a");

const TAGLINE = "Cloudflare Workers Platform";

/**
 * Walk up from this file looking for the hoox-cli package.json.
 * Works from source (`src/ui/`) and the bundled `dist/index.js` layout.
 */
function findCliVersion(): string {
  const PKG_NAME = "@hoox-sh/hoox-cli";
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name === PKG_NAME) return pkg.version as string;
      } catch {
        // continue walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "unknown";
}

const VERSION: string = findCliVersion();

/** Disclaimer line rendered below the banner and in the menu footer. */
export const DISCLAIMER =
  "DISCLAIMER: Trading cryptocurrencies involves substantial risk of loss. Use at your own risk.";

// ── Small HOOX wordmark (4-line, no side logo) ─────────────────────
//
// Compact "small" face — much shorter/narrower than the old 6-line
// box-drawing block letters.

const WORDMARK = [
  " _   _  ___   _____  _  ",
  "| | | |/ _ \\ / _ \\ \\/ / ",
  "| |_| | (_) | (_) >  <  ",
  " \\___/ \\___/ \\___/_/\\_\\ ",
] as const;

const WORD_W = WORDMARK[0]!.length;

type PhaseMode = "assemble" | "pulse" | "static";

function colorWordmark(phase: number, mode: PhaseMode): string[] {
  return WORDMARK.map((line, row) => {
    if (mode === "assemble") {
      const local = Math.max(0, Math.min(1, phase));
      const cut = Math.floor(local * line.length);
      let out = "";
      for (let col = 0; col < line.length; col++) {
        const ch = line[col]!;
        if (ch === " ") {
          out += " ";
          continue;
        }
        if (col > cut) out += ZINC_FAINT("·");
        else if (local < 0.85) out += ZINC(ch);
        else out += theme.heading(ch);
      }
      return out;
    }

    if (mode === "pulse") {
      let out = "";
      for (let col = 0; col < line.length; col++) {
        const ch = line[col]!;
        if (ch === " ") {
          out += " ";
          continue;
        }
        const t = (phase * 1.5 + col * 0.05 + row * 0.06) % 1;
        if (t < 0.12) out += AMBER(ch);
        else if (t < 0.25) out += ORANGE(ch);
        else if (t < 0.4) out += INDIGO_SOFT(ch);
        else out += INDIGO.bold(ch);
      }
      return out;
    }

    return theme.heading(line);
  });
}

// ── Frame composition ─────────────────────────────────────────────

const PAD = " ";

function composeFrame(phase: number, mode: PhaseMode): string {
  const word = colorWordmark(phase, mode);
  const contentW = WORD_W;

  const body = word.map((line) => PAD + line);

  const rule = PAD + ZINC_FAINT("─".repeat(contentW));
  const metaInner =
    ZINC_SOFT(TAGLINE) +
    "  " +
    ZINC_FAINT("·") +
    "  " +
    INDIGO_SOFT(`v${VERSION}`);
  const metaVis = stripAnsi(metaInner).length;
  const metaPad = Math.max(0, Math.floor((contentW - metaVis) / 2));
  const meta = PAD + " ".repeat(metaPad) + metaInner;

  return [rule, ...body, rule, meta].join("\n");
}

// ── Public static API ─────────────────────────────────────────────

/** Default static banner — compact HOOX wordmark (final frame). */
export function renderBannerLogo(): string {
  return composeFrame(1, "static");
}

/** @deprecated Prefer renderBannerLogo — kept as alias for callers. */
export function renderBannerMinimal(): string {
  return renderBannerLogo();
}

// ── Alternate variants ────────────────────────────────────────────

/** Larger 6-line block letters (legacy look, still available). */
const LEGACY_LINES = [
  "██╗  ██╗ ██████╗  ██████╗ ██╗  ██╗",
  "██║  ██║██╔═══██╗██╔═══██╗╚██╗██╔╝",
  "███████║██║   ██║██║   ██║ ╚███╔╝ ",
  "██╔══██║██║   ██║██║   ██║ ██╔██╗ ",
  "██║  ██║╚██████╔╝╚██████╔╝██╔╝ ██╗",
  "╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝",
];

export function renderLegacy(): string {
  const bw = 52;
  const line = ` ${theme.box.horizontal.repeat(bw - 2)}`;
  const top = ` ${theme.box.topLeft}${line.slice(2)}${theme.box.topRight}`;
  const bottom = ` ${theme.box.bottomLeft}${line.slice(2)}${theme.box.bottomRight}`;
  const ascii = LEGACY_LINES.map((l) => ` ${theme.heading(l)}`);
  const gap = Math.floor((bw - TAGLINE.length - VERSION.length - 2) / 2);
  const tag = ` ${" ".repeat(gap)}${theme.textMuted(TAGLINE)} ${theme.textMuted(`v${VERSION}`)}`;
  return [top, ...ascii, line, tag, bottom].join("\n");
}

const HORIZON_LINES = [
  "╔═══╗ ╔═══╗ ╔═══╗ ╔═══╗",
  "║ ║ ║ ║   ║ ║   ║ ║ ║ ║",
  "║ ║ ║ ║ ║ ║ ║ ║ ║ ║ ║ ║",
  "║ ╚═╝ ║ ╚═╝ ║ ║ ║ ║ ╚═╝",
  "║     ║     ║ ╚═╝ ║     ",
  "╚═════╝ ╚═════╝ ╚═══╝ ╚═════╝",
];

export function renderBannerHorizon(): string {
  const bw = 56;
  const inner = theme.box.horizontal.repeat(bw - 2);
  const topLeft = theme.textFaint("╭");
  const topRight = theme.textFaint("╮");
  const bottomLeft = theme.textFaint("╰");
  const bottomRight = theme.textFaint("╯");
  const top = ` ${topLeft}${inner}${topRight}`;
  const bottom = ` ${bottomLeft}${inner}${bottomRight}`;
  const ascii = HORIZON_LINES.map((l) => ` ${theme.accent(l)}`);
  const gap = Math.floor((bw - TAGLINE.length - VERSION.length - 4) / 2);
  const tag = ` ${" ".repeat(gap)}${theme.textMuted(TAGLINE)} ${theme.textMuted(`v${VERSION}`)}`;
  return [
    top,
    ...ascii,
    ` ${theme.box.horizontal.repeat(bw)}`,
    tag,
    bottom,
  ].join("\n");
}

const SIGNAL_LINES = [
  "  _   _           _   _   ",
  " | | | | ___   __| | | | ",
  " | |_| |/ _ \\ / _` | | | ",
  " |  _  | (_) | (_| | | | ",
  " |_| |_|\\___/ \\__,_| |_| ",
];

export function renderBannerSignal(): string {
  const bw = 54;
  const line = theme.box.horizontal.repeat(bw);
  const top = ` ${theme.box.topLeft}${line.slice(2)}${theme.box.topRight}`;
  const bottom = ` ${theme.box.bottomLeft}${line.slice(2)}${theme.box.bottomRight}`;

  const wordmark = SIGNAL_LINES.map((l) => {
    return ` ${theme.heading(l.slice(0, 26))}${theme.textFaint(l.slice(26))}`;
  });

  const wave = ` ${theme.accent("~~")}${theme.textFaint("~")}${theme.accent("_")}${theme.textFaint(".")}${theme.accent("/\\")}${theme.textFaint("~")}${theme.accent("\\/")}${theme.textFaint("..")}${theme.accent("/~~\\")}${theme.textFaint("~")}  ${theme.textMuted(TAGLINE)} ${theme.textMuted(`v${VERSION}`)}`;

  return [
    top,
    ...wordmark,
    ` ${theme.box.horizontal.repeat(bw)}`,
    wave,
    bottom,
  ].join("\n");
}

export const BANNER_VARIANTS = {
  logo: renderBannerLogo,
  minimal: renderBannerLogo,
  legacy: renderLegacy,
  horizon: renderBannerHorizon,
  signal: renderBannerSignal,
} as const;

export type BannerVariant = keyof typeof BANNER_VARIANTS;

/** Default banner — compact HOOX wordmark (static final frame). */
export function renderBanner(variant?: BannerVariant): string {
  return variant ? BANNER_VARIANTS[variant]() : renderBannerLogo();
}

/** Compact one-line banner for inline display. */
export function renderCompactBanner(): string {
  return `${ORANGE("◆")} ${theme.heading("Hoox CLI")} ${theme.textMuted(`v${VERSION}`)}`;
}

// ── Animation ─────────────────────────────────────────────────────

function canAnimate(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.TERM === "dumb") return false;
  if (process.env.CI === "true" || process.env.CI === "1") return false;
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Play the banner animation on a TTY (type-in → pulse → settle).
 * Falls back to a single static print when animation is not available.
 *
 * @returns number of lines written
 */
export async function animateBanner(options?: {
  /** Total animation budget in ms (default ~800). */
  durationMs?: number;
  /** Force static even on TTY. */
  static?: boolean;
}): Promise<number> {
  const staticOnly = options?.static === true || !canAnimate();
  const finalFrame = composeFrame(1, "static");
  const lineCount = finalFrame.split("\n").length;

  if (staticOnly) {
    process.stdout.write(finalFrame + "\n");
    return lineCount;
  }

  const durationMs = options?.durationMs ?? 800;
  const assembleMs = Math.floor(durationMs * 0.55);
  const pulseMs = durationMs - assembleMs;
  const fps = 28;
  const assembleFrames = Math.max(6, Math.round((assembleMs / 1000) * fps));
  const pulseFrames = Math.max(4, Math.round((pulseMs / 1000) * fps));

  let wroteLines = 0;
  const writeFrame = (frame: string) => {
    const lines = frame.split("\n");
    if (wroteLines > 0) {
      process.stdout.write(`\x1b[${wroteLines}A`);
    }
    for (let i = 0; i < lines.length; i++) {
      process.stdout.write(`\x1b[2K${lines[i]}\n`);
    }
    for (let i = lines.length; i < wroteLines; i++) {
      process.stdout.write(`\x1b[2K\n`);
    }
    if (wroteLines > lines.length) {
      process.stdout.write(`\x1b[${wroteLines - lines.length}A`);
    }
    wroteLines = lines.length;
  };

  process.stdout.write("\x1b[?25l");
  try {
    for (let i = 0; i < assembleFrames; i++) {
      const phase = i / Math.max(1, assembleFrames - 1);
      writeFrame(composeFrame(phase, "assemble"));
      await sleep(assembleMs / assembleFrames);
    }
    for (let i = 0; i < pulseFrames; i++) {
      const phase = i / Math.max(1, pulseFrames - 1);
      writeFrame(composeFrame(phase, "pulse"));
      await sleep(pulseMs / pulseFrames);
    }
    writeFrame(finalFrame);
  } finally {
    process.stdout.write("\x1b[?25h");
  }

  return wroteLines;
}
