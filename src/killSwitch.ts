// KVNamespace is globally available from worker-configuration.d.ts
import { createLogger } from "@jango-blockchained/hoox-shared/middleware";
import { KVKeys } from "@jango-blockchained/hoox-shared/kvKeys";

const logger = createLogger({ service: "hoox", module: "killSwitch" });

// Use the canonical kill switch key from the shared registry so the
// hoox gateway reads the same key the trade-worker reads (and the
// agent-worker / telegram-worker write). Previously this was the
// "global:kill_switch" string, which meant the gateway rejected
// signals but the trade-worker kept executing them. See the
// 2026-06-27 worker audit S-1 finding.
const KV_KILL_SWITCH_KEY = KVKeys.KV_TRADE_KILL_SWITCH;

export async function checkKillSwitch(
  kv: KVNamespace | undefined
): Promise<{ enabled: boolean; error?: string }> {
  try {
    if (!kv) {
      return { enabled: false };
    }
    const killSwitchVal = await kv.get(KV_KILL_SWITCH_KEY);
    if (killSwitchVal && killSwitchVal.toLowerCase() === "true") {
      return { enabled: true };
    }
    return { enabled: false };
  } catch (error: unknown) {
    logger.error("Error reading kill switch KV", { error });
    return { enabled: false, error: String(error) };
  }
}

export async function isTradingPaused(
  kv: KVNamespace | undefined
): Promise<boolean> {
  const result = await checkKillSwitch(kv);
  return result.enabled;
}
