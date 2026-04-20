import { describe, expect, it, vi } from 'vitest';
import {
  clearVaultConfigOverrides,
  getVaultConfigOverrides,
  makeVaultConfigKey,
  saveVaultConfigOverrides,
  type VaultConfigOverrides,
} from '../src/vault-config-store';

function createKvMock() {
  return {
    delete: vi.fn<(key: string) => Promise<void>>(async () => {}),
    get: vi.fn<(key: string, type?: 'text') => Promise<string | null>>(async () => null),
    put: vi.fn<(key: string, value: string) => Promise<void>>(async () => {}),
  };
}

describe('vault-config-store', () => {
  it('builds deterministic per-login keys', () => {
    expect(makeVaultConfigKey('Aventerica89')).toBe('vault:config:aventerica89');
  });

  it('round-trips a saved overrides record', async () => {
    const kv = createKvMock();
    const overrides: VaultConfigOverrides = {
      createFolder: 'Notes/Custom',
      sessionGroups: { clarity: 'Notes/Clarity' },
    };

    await saveVaultConfigOverrides(kv as never, 'Aventerica89', overrides);

    const payload = kv.put.mock.calls[0]?.[1];
    expect(typeof payload).toBe('string');
    kv.get.mockResolvedValueOnce(payload as string);

    const loaded = await getVaultConfigOverrides(kv as never, 'Aventerica89');
    expect(loaded).toEqual(overrides);
  });

  it('merges new overrides on top of existing values', async () => {
    const kv = createKvMock();
    kv.get.mockResolvedValueOnce(
      JSON.stringify({
        createFolder: 'Notes/Old',
        repoBranch: 'main',
      } satisfies VaultConfigOverrides),
    );

    const merged = await saveVaultConfigOverrides(kv as never, 'Aventerica89', {
      createFolder: 'Notes/New',
    });

    expect(merged).toEqual({
      createFolder: 'Notes/New',
      repoBranch: 'main',
    });

    const persisted = kv.put.mock.calls[0]?.[1];
    expect(JSON.parse(persisted as string)).toEqual(merged);
  });

  it('replaces sessionGroups wholesale when provided', async () => {
    const kv = createKvMock();
    kv.get.mockResolvedValueOnce(
      JSON.stringify({
        sessionGroups: { clarity: 'Notes/Clarity', vaporforge: 'Notes/Vaporforge' },
      } satisfies VaultConfigOverrides),
    );

    const merged = await saveVaultConfigOverrides(kv as never, 'Aventerica89', {
      sessionGroups: { newgroup: 'Notes/NewGroup' },
    });

    expect(merged.sessionGroups).toEqual({ newgroup: 'Notes/NewGroup' });
  });

  it('returns null for malformed JSON', async () => {
    const kv = createKvMock();
    kv.get.mockResolvedValueOnce('{not-json');

    const loaded = await getVaultConfigOverrides(kv as never, 'Aventerica89');
    expect(loaded).toBeNull();
  });

  it('returns null for invalid override shape', async () => {
    const kv = createKvMock();
    kv.get.mockResolvedValueOnce(JSON.stringify({ createFolder: 123 }));

    const loaded = await getVaultConfigOverrides(kv as never, 'Aventerica89');
    expect(loaded).toBeNull();
  });

  it('clears the overrides key', async () => {
    const kv = createKvMock();
    await clearVaultConfigOverrides(kv as never, 'Aventerica89');

    expect(kv.delete).toHaveBeenCalledWith('vault:config:aventerica89');
  });
});
