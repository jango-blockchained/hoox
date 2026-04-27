import type { KVNamespace } from "@cloudflare/workers-types";

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
  } catch (e) {
    console.error("Error reading kill switch KV:", e);
    return { enabled: false, error: String(e) };
  }
}

export async function isTradingPaused(
  kv: KVNamespace | undefined
): Promise<boolean> {
  const result = await checkKillSwitch(kv);
  return result.enabled;
}
