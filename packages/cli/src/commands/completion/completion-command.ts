/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox completion` — generate a shell completion script.
 *
 * Subcommands: bash | zsh | fish
 *
 * The bash script wires up `complete -F _hoox_completion hoox`. The zsh
 * script uses `_describe` for option metadata. The fish script uses
 * `complete -c hoox` with `__fish_use_subcommand` / `__fish_seen_subcommand_from`.
 */

import type { Command } from "commander";
import { withErrorHandling } from "../../utils/error-handler.js";
import { CLIError, ExitCode } from "../../utils/errors.js";

const BASH_SCRIPT = `_hoox_completion() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  opts="--help --version --json --quiet --yes init onboard bootstrap quickstart setup clone dev deploy infra config secrets keys check db monitor repair logs test waf dashboard schema update tui disclaimer agent pyne workers trace perf doctor tunnel"
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
    'pyne:PYNE edge evaluate worker'
  )
  _describe 'hoox' opts
}
compdef _hoox hoox
`;

const FISH_SCRIPT = `# hoox fish completions — install: hoox completion fish > ~/.config/fish/completions/hoox.fish
complete -c hoox -f

# Global options
complete -c hoox -l help -d 'Show help'
complete -c hoox -l version -d 'Show version'
complete -c hoox -l json -d 'JSON output'
complete -c hoox -l quiet -d 'Minimal output'
complete -c hoox -l yes -s y -d 'Skip confirmation prompts'
complete -c hoox -l no-color -d 'Disable color output'

# Top-level commands
complete -c hoox -n '__fish_use_subcommand' -a init -d 'Interactive setup wizard (config only)'
complete -c hoox -n '__fish_use_subcommand' -a onboard -d 'One-shot full bootstrap (init + setup)'
complete -c hoox -n '__fish_use_subcommand' -a setup -d 'Auto-bootstrap infrastructure'
complete -c hoox -n '__fish_use_subcommand' -a clone -d 'Clone worker repositories'
complete -c hoox -n '__fish_use_subcommand' -a dev -d 'Local development'
complete -c hoox -n '__fish_use_subcommand' -a deploy -d 'Deploy to Cloudflare'
complete -c hoox -n '__fish_use_subcommand' -a infra -d 'Manage infrastructure'
complete -c hoox -n '__fish_use_subcommand' -a config -d 'Manage configuration'
complete -c hoox -n '__fish_use_subcommand' -a secrets -d 'Manage Cloudflare Worker secrets'
complete -c hoox -n '__fish_use_subcommand' -a keys -d 'Manage internal auth keys'
complete -c hoox -n '__fish_use_subcommand' -a check -d 'Validate and health-check'
complete -c hoox -n '__fish_use_subcommand' -a doctor -d 'Diagnose environment and setup'
complete -c hoox -n '__fish_use_subcommand' -a tunnel -d 'Cloudflare tunnel helpers'
complete -c hoox -n '__fish_use_subcommand' -a db -d 'Database operations'
complete -c hoox -n '__fish_use_subcommand' -a monitor -d 'Monitor system'
complete -c hoox -n '__fish_use_subcommand' -a repair -d 'Repair system'
complete -c hoox -n '__fish_use_subcommand' -a logs -d 'View worker logs'
complete -c hoox -n '__fish_use_subcommand' -a test -d 'Run tests'
complete -c hoox -n '__fish_use_subcommand' -a waf -d 'Manage Web Application Firewall'
complete -c hoox -n '__fish_use_subcommand' -a dashboard -d 'Dashboard operations'
complete -c hoox -n '__fish_use_subcommand' -a schema -d 'Schema operations'
complete -c hoox -n '__fish_use_subcommand' -a update -d 'Update CLI / platform'
complete -c hoox -n '__fish_use_subcommand' -a tui -d 'Interactive terminal UI'
complete -c hoox -n '__fish_use_subcommand' -a disclaimer -d 'Show legal disclaimer'
complete -c hoox -n '__fish_use_subcommand' -a agent -d 'AI agent operations'
complete -c hoox -n '__fish_use_subcommand' -a pyne -d 'PYNE edge evaluate worker'
complete -c hoox -n '__fish_use_subcommand' -a workers -d 'Worker operations'
complete -c hoox -n '__fish_use_subcommand' -a trace -d 'Query and manage Workers traces'
complete -c hoox -n '__fish_use_subcommand' -a perf -d 'Performance measurement tools'
complete -c hoox -n '__fish_use_subcommand' -a completion -d 'Generate shell completion script'

# pyne
complete -c hoox -n '__fish_seen_subcommand_from pyne' -a health -d 'Probe GET /health'
complete -c hoox -n '__fish_seen_subcommand_from pyne' -a run -d 'Evaluate a Pine script'
complete -c hoox -n '__fish_seen_subcommand_from pyne' -a scripts -d 'Manage deployed scripts'
complete -c hoox -n '__fish_seen_subcommand_from pyne' -a cron -d 'Bar-close cron jobs'
complete -c hoox -n '__fish_seen_subcommand_from pyne' -a feed -d 'Market feed helpers'
complete -c hoox -n '__fish_seen_subcommand_from pyne' -a ingest -d 'Fetch OHLCV data'
complete -c hoox -n '__fish_seen_subcommand_from pyne' -a sync-vendor -d 'Sync pynescript for deploy'
complete -c hoox -n '__fish_seen_subcommand_from pyne' -a deploy -d 'Deploy pyne-worker'

# secrets
complete -c hoox -n '__fish_seen_subcommand_from secrets' -a list -d 'List secrets for a worker'
complete -c hoox -n '__fish_seen_subcommand_from secrets' -a set -d 'Set a secret'
complete -c hoox -n '__fish_seen_subcommand_from secrets' -a delete -d 'Delete a secret'
complete -c hoox -n '__fish_seen_subcommand_from secrets' -a sync -d 'Sync local .dev.vars to Cloudflare'

# keys
complete -c hoox -n '__fish_seen_subcommand_from keys' -a generate -d 'Generate new internal keys'
complete -c hoox -n '__fish_seen_subcommand_from keys' -a list -d 'List existing keys'

# deploy
complete -c hoox -n '__fish_seen_subcommand_from deploy' -a all -d 'Deploy everything'
complete -c hoox -n '__fish_seen_subcommand_from deploy' -a workers -d 'Deploy workers'
complete -c hoox -n '__fish_seen_subcommand_from deploy' -a worker -d 'Deploy a single worker'
complete -c hoox -n '__fish_seen_subcommand_from deploy' -a dashboard -d 'Deploy dashboard'
complete -c hoox -n '__fish_seen_subcommand_from deploy' -a telegram-webhook -d 'Deploy telegram webhook'
complete -c hoox -n '__fish_seen_subcommand_from deploy' -a update-internal-urls -d 'Update internal URLs'
complete -c hoox -n '__fish_seen_subcommand_from deploy' -a kv-config -d 'Deploy KV config'
complete -c hoox -n '__fish_seen_subcommand_from deploy' -a history -d 'Deployment history'
complete -c hoox -n '__fish_seen_subcommand_from deploy' -a rollback -d 'Rollback a worker'

# infra
complete -c hoox -n '__fish_seen_subcommand_from infra' -a provision -d 'Provision infrastructure'
complete -c hoox -n '__fish_seen_subcommand_from infra' -a d1 -d 'Manage D1 databases'
complete -c hoox -n '__fish_seen_subcommand_from infra' -a kv -d 'Manage KV namespaces'
complete -c hoox -n '__fish_seen_subcommand_from infra' -a r2 -d 'Manage R2 buckets'
complete -c hoox -n '__fish_seen_subcommand_from infra' -a queues -d 'Manage Queues'
complete -c hoox -n '__fish_seen_subcommand_from infra' -a vectorize -d 'Manage Vectorize indexes'
complete -c hoox -n '__fish_seen_subcommand_from infra' -a analytics -d 'Manage Analytics Engine'

# check
complete -c hoox -n '__fish_seen_subcommand_from check' -a setup -d 'Check setup'
complete -c hoox -n '__fish_seen_subcommand_from check' -a health -d 'Health check'
complete -c hoox -n '__fish_seen_subcommand_from check' -a fix -d 'Fix issues'
complete -c hoox -n '__fish_seen_subcommand_from check' -a prerequisites -d 'Check prerequisites'
complete -c hoox -n '__fish_seen_subcommand_from check' -a submodule-gitignore -d 'Check submodule gitignore'

# repair
complete -c hoox -n '__fish_seen_subcommand_from repair' -a check -d 'Check what needs repair'
complete -c hoox -n '__fish_seen_subcommand_from repair' -a worker -d 'Repair a worker'
complete -c hoox -n '__fish_seen_subcommand_from repair' -a infra -d 'Repair infrastructure'
complete -c hoox -n '__fish_seen_subcommand_from repair' -a secrets -d 'Repair secrets'
complete -c hoox -n '__fish_seen_subcommand_from repair' -a kv -d 'Repair KV'
complete -c hoox -n '__fish_seen_subcommand_from repair' -a db -d 'Repair database'
complete -c hoox -n '__fish_seen_subcommand_from repair' -a rebuild -d 'Rebuild'

# tunnel
complete -c hoox -n '__fish_seen_subcommand_from tunnel' -a check -d 'Check tunnel status'

# dev
complete -c hoox -n '__fish_seen_subcommand_from dev' -a start -d 'Start local development'
complete -c hoox -n '__fish_seen_subcommand_from dev' -a worker -d 'Dev a single worker'
complete -c hoox -n '__fish_seen_subcommand_from dev' -a dashboard -d 'Dev dashboard'

# config
complete -c hoox -n '__fish_seen_subcommand_from config' -a show -d 'Show configuration'
complete -c hoox -n '__fish_seen_subcommand_from config' -a set -d 'Set a config value'
complete -c hoox -n '__fish_seen_subcommand_from config' -a secrets -d 'Manage secrets'
complete -c hoox -n '__fish_seen_subcommand_from config' -a keys -d 'Manage keys'
complete -c hoox -n '__fish_seen_subcommand_from config' -a transport -d 'Transport settings'
complete -c hoox -n '__fish_seen_subcommand_from config' -a env -d 'Environment files'
complete -c hoox -n '__fish_seen_subcommand_from config' -a kv -d 'KV config'

# workers
complete -c hoox -n '__fish_seen_subcommand_from workers' -a list -d 'List workers'
complete -c hoox -n '__fish_seen_subcommand_from workers' -a dev -d 'Dev a worker'
complete -c hoox -n '__fish_seen_subcommand_from workers' -a logs -d 'Worker logs'

# db
complete -c hoox -n '__fish_seen_subcommand_from db' -a apply -d 'Apply migrations'
complete -c hoox -n '__fish_seen_subcommand_from db' -a migrate -d 'Run migrations'
complete -c hoox -n '__fish_seen_subcommand_from db' -a list -d 'List databases'
complete -c hoox -n '__fish_seen_subcommand_from db' -a query -d 'Run a SQL query'
complete -c hoox -n '__fish_seen_subcommand_from db' -a export -d 'Export database'
complete -c hoox -n '__fish_seen_subcommand_from db' -a reset -d 'Reset database'

# completion
complete -c hoox -n '__fish_seen_subcommand_from completion' -a bash -d 'Bash completion script'
complete -c hoox -n '__fish_seen_subcommand_from completion' -a zsh -d 'Zsh completion script'
complete -c hoox -n '__fish_seen_subcommand_from completion' -a fish -d 'Fish completion script'
`;

const SUPPORTED_SHELLS = ["bash", "zsh", "fish"] as const;
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
    .argument("[shell]", "Shell type (bash, zsh, or fish)")
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
            ExitCode.INVALID_USAGE,
            undefined,
            true,
            `Try: hoox completion bash  or  hoox completion zsh  or  hoox completion fish`
          );
        }

        if (shell === "bash") {
          process.stdout.write(BASH_SCRIPT);
        } else if (shell === "zsh") {
          process.stdout.write(ZSH_SCRIPT);
        } else if (shell === "fish") {
          process.stdout.write(FISH_SCRIPT);
        }
      })
    );
}
