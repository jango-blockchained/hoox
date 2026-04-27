import type { KVNamespace } from "@cloudflare/workers-types";

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
  } catch (e) {
    console.error("KV Session Error:", e);
    return { sessionId: id, isNew: !sessionId };
  }
}

export async function updateSession(
  kv: KVNamespace | undefined,
  sessionId: string
): Promise<void> {
  if (!kv) return;

  try {
    await kv.put(
      sessionId,
      JSON.stringify({ lastSeen: new Date().toISOString() }),
      {
        expirationTtl: SESSION_TTL,
      }
    );
  } catch (e) {
    console.error("KV Session Error:", e);
  }
}
