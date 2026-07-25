/**
 * `hoox completion` — generate a shell completion script.
 *
 * Subcommands: bash | zsh | fish
 *
 * The bash script wires up `complete -F _hoox_completion hoox`. The zsh
 * script uses `_describe` for option metadata. Fish is not yet supported
 * and falls through with a clear error.
 */

import type { Command } from "commander";
import { withErrorHandling } from "../../utils/error-handler.js";
import { CLIError, ExitCode } from "../../utils/errors.js";

const BASH_SCRIPT = `_hoox_completion() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
    opts="--help --version --json --quiet --yes init onboard bootstrap quickstart setup clone dev deploy infra config secrets keys check db monitor repair logs test waf dashboard schema update tui disclaimer agent workers trace perf doctor tunnel"
  COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
  return 0
}
complete -F _hoox_completion hoox
`;

const ZSH_SCRIPT = `#compdef hoox
_hoox() {
  local -a opts
  opts=(
    '--help:Show help'
    '--version:Show version'
    '--json:JSON output'
    '--quiet:Minimal output'
    'init:Interactive setup wizard (config only)'
    'onboard:One-shot full bootstrap (init + setup)'
    'setup:Auto-bootstrap infrastructure'
    'secrets:Manage Cloudflare Worker secrets'
    'keys:Manage internal auth keys'
    'clone:Clone worker repositories'
    'dev:Local development'
    'deploy:Deploy to Cloudflare'
    'infra:Manage infrastructure'
    'config:Manage configuration'
    'check:Validate and health-check'
    'db:Database operations'
    'monitor:Monitor system'
    'repair:Repair system'
    'logs:View worker logs'
    'test:Run tests'
    'waf:Manage Web Application Firewall'
    'dashboard:Dashboard operations'
    'workers:Worker operations',
    'trace:Query and manage Workers traces'
    'perf:Performance measurement tools'
    'agent:AI agent operations'
  )
  _describe 'hoox' opts
}
compdef _hoox hoox
`;

const SUPPORTED_SHELLS = ["bash", "zsh"] as const;
type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

function isSupportedShell(s: string): s is SupportedShell {
  return (SUPPORTED_SHELLS as readonly string[]).includes(s);
}

/**
 * Register the `hoox completion` command on the given program.
 */
export function registerCompletionCommand(program: Command): void {
  program
    .command("completion")
    .description("Generate shell completion script")
    .argument("[shell]", "Shell type (bash, zsh, fish)")
    .action(
      withErrorHandling(async (shell?: string) => {
        if (!shell) {
          process.stdout.write(
            `Usage: hoox completion <${SUPPORTED_SHELLS.join("|")}>\n`
          );
          return;
        }

        if (!isSupportedShell(shell)) {
          throw new CLIError(
            `Unsupported shell "${shell}". Supported: ${SUPPORTED_SHELLS.join(", ")}.`,
            ExitCode.INVALID_USAGE
          );
        }

        if (shell === "bash") {
          process.stdout.write(BASH_SCRIPT);
        } else if (shell === "zsh") {
          process.stdout.write(ZSH_SCRIPT);
        }
      })
    );
}
