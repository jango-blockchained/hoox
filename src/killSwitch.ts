// KVNamespace is globally available from worker-configuration.d.ts
import { createLogger } from "@jango-blockchained/hoox-shared/middleware";

const logger = createLogger({ service: "hoox", module: "killSwitch" });

const KV_KILL_SWITCH_KEY = "global:kill_switch";

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
