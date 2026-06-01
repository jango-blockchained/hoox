// KVNamespace is globally available from worker-configuration.d.ts
import { createLogger } from "@jango-blockchained/hoox-shared/middleware";

const logger = createLogger({ service: "hoox", module: "sessionManager" });

const SESSION_TTL = 3600;

export interface SessionData {
  lastSeen: string;
}

export async function getOrCreateSession(
  kv: KVNamespace | undefined,
  sessionId?: string | null
): Promise<{ sessionId: string; isNew: boolean }> {
  const id = sessionId || crypto.randomUUID();

  if (!kv) {
    return { sessionId: id, isNew: !sessionId };
  }

  try {
    const existing = await kv.get(id);
    const isNew = !existing;

    if (isNew || existing) {
      await kv.put(id, JSON.stringify({ lastSeen: new Date().toISOString() }), {
        expirationTtl: SESSION_TTL,
      });
    }

    return { sessionId: id, isNew };
  } catch (error: unknown) {
    logger.error("KV Session Error", { error });
    return { sessionId: id, isNew: !sessionId };
  }
}
