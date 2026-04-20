import { describe, expect, it, vi } from 'vitest';
import { applyOverrides, diffOverrides, getVaultDefaults, loadVaultConfig, normalizeSessionGroups } from '../src/config';
import type { VaultConfigOverrides } from '../src/vault-config-store';

const baseEnv = {
  ALLOWED_GITHUB_USERNAME: 'Aventerica89',
  CHATGPT_MCP_FOLDER: 'ChatGPT MCP',
  CHATGPT_MCP_SECTION: 'ChatGPT MCP',
  VAULT_REPO_BRANCH: 'main',
  VAULT_REPO_NAME: 'Obsidian-Claude',
  VAULT_REPO_OWNER: 'Aventerica89',
} as Env;

function kvReturning(value: string | null) {
  return {
    delete: vi.fn(async () => {}),
    get: vi.fn(async () => value),
    put: vi.fn(async () => {}),
  } as unknown as KVNamespace;
}

describe('getVaultDefaults', () => {
  it('defaults session groups to an empty map when env is omitted', () => {
    const config = getVaultDefaults(baseEnv);

    expect(config.sessionGroups).toEqual({});
  });

  it('fully overrides default session groups when env is provided', () => {
    const config = getVaultDefaults({
      ...baseEnv,
      CHATGPT_MCP_SESSION_GROUPS: JSON.stringify({
        clarity: 'John Notes/App Dev/Clarity',
      }),
    } as Env);

    expect(config.sessionGroups).toEqual({
      clarity: 'John Notes/App Dev/Clarity',
    });
  });
});

describe('normalizeSessionGroups', () => {
  it('lowercases keys and trims folders', () => {
    expect(normalizeSessionGroups({ Clarity: '  Notes/Clarity  ' })).toEqual({
      clarity: 'Notes/Clarity',
    });
  });

  it('rejects non-object input', () => {
    expect(() => normalizeSessionGroups([], 'session_groups')).toThrow(/Invalid session_groups/);
  });

  it('rejects empty folder values', () => {
    expect(() => normalizeSessionGroups({ clarity: '' }, 'session_groups')).toThrow(/Invalid session_groups/);
  });
});

describe('applyOverrides', () => {
  it('returns defaults untouched when overrides are null', () => {
    const defaults = getVaultDefaults(baseEnv);
    expect(applyOverrides(defaults, null)).toEqual(defaults);
  });

  it('merges scalar fields on top of defaults', () => {
    const defaults = getVaultDefaults(baseEnv);
    const merged = applyOverrides(defaults, {
      createFolder: 'Custom/Folder',
      repoBranch: 'develop',
    });

    expect(merged.createFolder).toBe('Custom/Folder');
    expect(merged.repoBranch).toBe('develop');
    expect(merged.repoOwner).toBe('Aventerica89');
    expect(merged.allowedGithubUsername).toBe('Aventerica89');
  });

  it('replaces sessionGroups wholesale when overridden', () => {
    const defaults = getVaultDefaults({
      ...baseEnv,
      CHATGPT_MCP_SESSION_GROUPS: JSON.stringify({
        clarity: 'Notes/Clarity',
        vaporforge: 'Notes/Vaporforge',
      }),
    } as Env);
    const merged = applyOverrides(defaults, {
      sessionGroups: { newgroup: 'Notes/NewGroup' },
    });

    expect(merged.sessionGroups).toEqual({ newgroup: 'Notes/NewGroup' });
  });

  it('keeps default sessionGroups when override omits them', () => {
    const defaults = getVaultDefaults({
      ...baseEnv,
      CHATGPT_MCP_SESSION_GROUPS: JSON.stringify({ clarity: 'Notes/Clarity' }),
    } as Env);
    const merged = applyOverrides(defaults, { createFolder: 'Other' });

    expect(merged.sessionGroups).toEqual({ clarity: 'Notes/Clarity' });
  });
});

describe('loadVaultConfig', () => {
  it('falls back to defaults when KV has no override', async () => {
    const defaults = getVaultDefaults(baseEnv);
    const kv = kvReturning(null);

    const loaded = await loadVaultConfig({ env: baseEnv, kv, login: 'Aventerica89' });

    expect(loaded).toEqual(defaults);
  });

  it('applies KV overrides on top of defaults', async () => {
    const overrides: VaultConfigOverrides = {
      createFolder: 'KV/Folder',
      sessionGroups: { kvgroup: 'Notes/KVGroup' },
    };
    const kv = kvReturning(JSON.stringify(overrides));

    const loaded = await loadVaultConfig({ env: baseEnv, kv, login: 'Aventerica89' });

    expect(loaded.createFolder).toBe('KV/Folder');
    expect(loaded.sessionGroups).toEqual({ kvgroup: 'Notes/KVGroup' });
    expect(loaded.repoOwner).toBe('Aventerica89');
  });
});

describe('diffOverrides', () => {
  it('lists only the fields that differ from defaults', () => {
    const defaults = getVaultDefaults(baseEnv);
    const effective = applyOverrides(defaults, {
      createFolder: 'Other',
      sessionGroups: { g: 'Notes/G' },
    });

    expect(diffOverrides(defaults, effective).sort()).toEqual(['createFolder', 'sessionGroups']);
  });

  it('returns an empty list when nothing is overridden', () => {
    const defaults = getVaultDefaults(baseEnv);
    expect(diffOverrides(defaults, defaults)).toEqual([]);
  });
});
