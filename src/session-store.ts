export type ActiveSessionRecord = {
  folder: string;
  group: string;
  logPath: string;
  sessionId: string;
  startedAt: string;
  title?: string;
};

const ACTIVE_SESSION_PREFIX = 'session:active:';
const ACTIVE_SESSION_TTL_SECONDS = 60 * 60 * 12;

export function makeActiveSessionKey(login: string) {
  return `${ACTIVE_SESSION_PREFIX}${login.trim().toLowerCase()}`;
}

function isActiveSessionRecord(value: unknown): value is ActiveSessionRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.folder === 'string' &&
    typeof record.group === 'string' &&
    typeof record.logPath === 'string' &&
    typeof record.sessionId === 'string' &&
    typeof record.startedAt === 'string' &&
    (typeof record.title === 'undefined' || typeof record.title === 'string')
  );
}

export async function getActiveSession(kv: KVNamespace, login: string) {
  const raw = await kv.get(makeActiveSessionKey(login), 'text');
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isActiveSessionRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveActiveSession(kv: KVNamespace, login: string, session: ActiveSessionRecord) {
  await kv.put(makeActiveSessionKey(login), JSON.stringify(session), {
    expirationTtl: ACTIVE_SESSION_TTL_SECONDS,
  });
}

export async function clearActiveSession(kv: KVNamespace, login: string) {
  await kv.delete(makeActiveSessionKey(login));
}
