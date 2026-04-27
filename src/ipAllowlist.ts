import type { KVNamespace } from "@cloudflare/workers-types";

const TRADINGVIEW_ALLOWED_IPS = new Set([
  "52.89.214.238",
  "34.212.75.30",
  "54.218.53.128",
  "52.32.178.7",
]);

const KV_IP_CHECK_ENABLED_KEY = "webhook:tradingview:ip_check_enabled";
const KV_ALLOWED_IPS_KEY = "webhook:tradingview:allowed_ips";

export interface IpCheckConfig {
  enabled: boolean;
  allowedIps: Set<string>;
}

export async function checkIpAllowlist(
  kv: KVNamespace | undefined,
  clientIp: string | null | undefined
): Promise<{
  allowed: boolean;
  reason?: string;
  config: IpCheckConfig;
}> {
  const defaultConfig: IpCheckConfig = {
    enabled: true,
    allowedIps: TRADINGVIEW_ALLOWED_IPS,
  };

  if (!clientIp) {
    return {
      allowed: false,
      reason: "No client IP provided",
      config: defaultConfig,
    };
  }

  try {
    const config = await loadIpConfig(kv);
    if (!config.enabled) {
      return { allowed: true, config };
    }

    if (config.allowedIps.has(clientIp)) {
      return { allowed: true, config };
    }

    return {
      allowed: false,
      reason: `IP ${clientIp} not in allowlist`,
      config,
    };
  } catch (e) {
    console.error("Error checking IP allowlist:", e);
    return {
      allowed: false,
      reason: String(e),
      config: defaultConfig,
    };
  }
}

export async function loadIpConfig(
  kv: KVNamespace | undefined
): Promise<IpCheckConfig> {
  let ipCheckEnabled = true;
  let allowedIps = new Set(TRADINGVIEW_ALLOWED_IPS);

  if (!kv) {
    return { enabled: ipCheckEnabled, allowedIps };
  }

  try {
    const kvValue = await kv.get(KV_IP_CHECK_ENABLED_KEY);
    if (kvValue !== null && kvValue !== undefined) {
      ipCheckEnabled = kvValue.toLowerCase() === "true";
    }

    const customIpsStr = await kv.get(KV_ALLOWED_IPS_KEY);
    if (customIpsStr) {
      const customIps = JSON.parse(customIpsStr);
      if (Array.isArray(customIps) && customIps.length > 0) {
        allowedIps = new Set(customIps);
      }
    }
  } catch (e) {
    console.error("Error loading IP config from KV:", e);
  }

  return { enabled: ipCheckEnabled, allowedIps };
}

export function getDefaultAllowedIps(): Set<string> {
  return new Set(TRADINGVIEW_ALLOWED_IPS);
}
