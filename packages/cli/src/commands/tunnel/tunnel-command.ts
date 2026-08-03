/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox tunnel` — private-ingress helpers for operator management paths.
 *
 * Subcommands:
 *   check   Detect cloudflared and smoke-test management API reachability
 */
import { Command } from "commander";
import {
  resolveOperatorTransportProfile,
  type OperatorTransportEnv,
} from "@hoox-sh/hoox-shared";
import { theme, icons } from "../../utils/theme.js";
import { formatJson, getFormatOptions } from "../../utils/formatters.js";
import { ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import {
  detectCloudflared,
  probeOperatorManagement,
} from "../../services/operator-security/index.js";

function severityIcon(ok: boolean, warn = false): string {
  if (ok) return theme.success(icons.success);
  if (warn) return theme.warning(icons.warning);
  return theme.error(icons.error);
}

export function registerTunnelCommand(program: Command): void {
  const tunnel = program
    .command("tunnel")
    .summary("Private ingress helpers (cloudflared / Access)")
    .description(
      `Helpers for private operator ingress (Cloudflare Tunnel + Access).

Tunnel is optional — many deployments only need Access on a mgmt hostname.
Use 'tunnel check' to verify cloudflared is installed and to smoke-test
reachability of the management API (/v1/health).

EXAMPLES:
  hoox tunnel check
  hoox tunnel check --api-url https://mgmt.example.com
  HOOX_API_TOKEN=… hoox tunnel check --probe`
    );

  tunnel
    .command("check")
    .summary("Detect cloudflared and optionally probe management API")
    .description(
      `Detect cloudflared on PATH and print private-ingress guidance.

With --probe (or when HOOX_API_URL / --api-url is set), also GETs /v1/health
anonymously and with credentials to classify Access vs public exposure.`
    )
    .option(
      "--api-url <url>",
      "Management API base URL (sets HOOX_API_URL for probe)"
    )
    .option(
      "--probe",
      "Always probe /v1/health (default: probe when URL known)"
    )
    .option("--no-probe", "Skip network probe")
    .action(
      withErrorHandling(
        async (
          options: {
            apiUrl?: string;
            probe?: boolean;
          },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          const env = { ...process.env } as OperatorTransportEnv;
          if (options.apiUrl) {
            env.HOOX_API_URL = options.apiUrl;
          }
          const profile = resolveOperatorTransportProfile(env);
          const cf = await detectCloudflared();

          // Default: probe when we have a non-local URL or --probe
          const isLocal =
            profile.apiBase.includes("localhost") ||
            profile.apiBase.includes("127.0.0.1");
          const shouldProbe =
            options.probe === true || (options.probe !== false && !isLocal);

          const report: Record<string, unknown> = {
            cloudflared: cf,
            transport: profile.transport,
            apiBase: profile.apiBase,
          };

          if (fmt.json) {
            if (shouldProbe) {
              const anonymous = await probeOperatorManagement({
                profile,
                anonymous: true,
              });
              const authed = await probeOperatorManagement({ profile });
              report.probe = { anonymous, authed };
            }
            formatJson(report, fmt);
            process.exitCode =
              cf.installed || shouldProbe ? ExitCode.SUCCESS : ExitCode.ERROR;
            return;
          }

          process.stdout.write(theme.heading("\nHoox tunnel check\n\n"));
          process.stdout.write(
            `${severityIcon(cf.installed, true)} cloudflared\n` +
              `   ${theme.dim(cf.detail)}\n`
          );
          process.stdout.write(
            `${theme.dim("·")} transport ${profile.transport} · API ${profile.apiBase}\n\n`
          );

          if (!cf.installed) {
            process.stdout.write(
              theme.dim(
                "Install cloudflared only if you need a private origin tunnel.\n" +
                  "Many setups only need Cloudflare Access on the mgmt hostname.\n\n"
              )
            );
          } else {
            process.stdout.write(
              theme.dim(
                "Typical private path:\n" +
                  "  1. cloudflared tunnel create hoox-mgmt\n" +
                  "  2. Route DNS mgmt.example.com → tunnel\n" +
                  "  3. Access application on mgmt.example.com (service token for CLI)\n" +
                  "  4. OPERATOR_API_KEY on Worker + HOOX_API_TOKEN on laptop\n\n"
              )
            );
          }

          if (shouldProbe) {
            process.stdout.write(theme.heading("Management probe\n"));
            const anonymous = await probeOperatorManagement({
              profile,
              anonymous: true,
            });
            const authed = await probeOperatorManagement({ profile });

            const anonOk =
              anonymous.classification === "access_gate" ||
              anonymous.classification === "auth_required";
            process.stdout.write(
              `${severityIcon(anonOk, anonymous.classification === "ok")} anonymous: ${anonymous.detail}\n`
            );
            if (anonymous.classification === "ok") {
              process.stdout.write(
                `   ${theme.warning("⚠  management plane answered without auth — lock with Access / OPERATOR_API_KEY")}\n`
              );
            }
            process.stdout.write(
              `${severityIcon(authed.healthy, true)} authenticated: ${authed.detail}\n\n`
            );

            process.stdout.write(
              theme.dim(
                "Docs: docs/devops/deployment/zero-trust.mdx · private-ingress.mdx\n\n"
              )
            );
          } else {
            process.stdout.write(
              theme.dim(
                "Probe skipped (local default). Use --probe or --api-url https://mgmt…\n\n"
              )
            );
          }

          // Missing cloudflared is warn-only when Access-only is fine
          process.exitCode = ExitCode.SUCCESS;
        },
        { service: "tunnel" }
      )
    );
}
