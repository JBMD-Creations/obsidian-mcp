export type VaultConfigOverrides = {
  appendSection?: string;
  createFolder?: string;
  footerSection?: string;
  repoBranch?: string;
  repoName?: string;
  repoOwner?: string;
  sessionFolderRoot?: string;
  sessionGroups?: Record<string, string>;
  sessionLogFolder?: string;
  sessionNotesSection?: string;
};

const VAULT_CONFIG_PREFIX = 'vault:config:';

const STRING_FIELDS = [
  'appendSection',
  'createFolder',
  'footerSection',
  'repoBranch',
  'repoName',
  'repoOwner',
  'sessionFolderRoot',
  'sessionLogFolder',
  'sessionNotesSection',
] as const satisfies ReadonlyArray<keyof VaultConfigOverrides>;

export function makeVaultConfigKey(login: string) {
  return `${VAULT_CONFIG_PREFIX}${login.trim().toLowerCase()}`;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'string');
}

function isVaultConfigOverrides(value: unknown): value is VaultConfigOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  for (const field of STRING_FIELDS) {
    if (record[field] !== undefined && typeof record[field] !== 'string') {
      return false;
    }
  }
  if (record.sessionGroups !== undefined && !isStringRecord(record.sessionGroups)) {
    return false;
  }
  return true;
}

export async function getVaultConfigOverrides(kv: KVNamespace, login: string) {
  const raw = await kv.get(makeVaultConfigKey(login), 'text');
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isVaultConfigOverrides(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveVaultConfigOverrides(
  kv: KVNamespace,
  login: string,
  overrides: VaultConfigOverrides,
) {
  const existing = (await getVaultConfigOverrides(kv, login)) ?? {};
  const merged: VaultConfigOverrides = { ...existing, ...overrides };
  if (overrides.sessionGroups) {
    merged.sessionGroups = overrides.sessionGroups;
  }
  await kv.put(makeVaultConfigKey(login), JSON.stringify(merged));
  return merged;
}

export async function clearVaultConfigOverrides(kv: KVNamespace, login: string) {
  await kv.delete(makeVaultConfigKey(login));
}
