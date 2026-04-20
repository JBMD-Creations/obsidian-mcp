import { describe, expect, it, vi } from 'vitest';
import {
  clearActiveSession,
  getActiveSession,
  makeActiveSessionKey,
  saveActiveSession,
  type ActiveSessionRecord,
} from '../src/session-store';

function createKvMock() {
  return {
    delete: vi.fn<(key: string) => Promise<void>>(async () => {}),
    get: vi.fn<(key: string, type?: 'text') => Promise<string | null>>(async () => null),
    put: vi.fn<(key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>>(async () => {}),
  };
}

describe('session-store', () => {
  it('builds deterministic per-login keys', () => {
    expect(makeActiveSessionKey('Aventerica89')).toBe('session:active:aventerica89');
  });

  it('round-trips a saved session record', async () => {
    const kv = createKvMock();
    const record: ActiveSessionRecord = {
      folder: 'John Notes/App Dev/Agency Ops',
      group: 'agency-ops',
      logPath: 'ChatGPT MCP/Session Logs/agency-ops-session-log.md',
      sessionId: '11111111-1111-4111-8111-111111111111',
      startedAt: '2026-04-14T10:00:00.000Z',
      title: 'Session Test',
    };

    await saveActiveSession(kv as never, 'Aventerica89', record);

    const payload = kv.put.mock.calls[0]?.[1];
    expect(typeof payload).toBe('string');
    kv.get.mockResolvedValueOnce(payload as string);

    const loaded = await getActiveSession(kv as never, 'Aventerica89');
    expect(loaded).toEqual(record);
  });

  it('returns null for malformed JSON instead of throwing', async () => {
    const kv = createKvMock();
    kv.get.mockResolvedValueOnce('{not-json');

    const loaded = await getActiveSession(kv as never, 'Aventerica89');
    expect(loaded).toBeNull();
  });

  it('returns null for invalid record shape', async () => {
    const kv = createKvMock();
    kv.get.mockResolvedValueOnce(JSON.stringify({ foo: 'bar' }));

    const loaded = await getActiveSession(kv as never, 'Aventerica89');
    expect(loaded).toBeNull();
  });

  it('clears the active session key', async () => {
    const kv = createKvMock();
    await clearActiveSession(kv as never, 'Aventerica89');

    expect(kv.delete).toHaveBeenCalledWith('session:active:aventerica89');
  });
});
