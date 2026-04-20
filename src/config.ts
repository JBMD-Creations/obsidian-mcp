import { getVaultConfigOverrides, type VaultConfigOverrides } from './vault-config-store';

export type VaultConfig = {
  allowedGithubUsername: string;
  appendSection: string;
  createFolder: string;
  footerSection: string;
  repoBranch: string;
  repoName: string;
  repoOwner: string;
  sessionFolderRoot: string;
  sessionGroups: Record<string, string>;
  sessionLogFolder: string;
  sessionNotesSection: string;
};

export type VaultConfigField = Exclude<keyof VaultConfig, 'allowedGithubUsername'>;

const DEFAULT_FOOTER_SECTION = 'ChatGPT MCP Footer';
const DEFAULT_SESSION_FOLDER_ROOT = 'Notes';
const DEFAULT_SESSION_LOG_FOLDER = 'ChatGPT MCP/Session Logs';
const DEFAULT_SESSION_NOTES_SECTION = 'Session Notes';
const DEFAULT_SESSION_GROUPS: Record<string, string> = {};

function requireEnv(value: string | undefined, key: string) {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optionalEnv(value: string | undefined, fallback: string) {
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function parseSessionGroups(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    return { ...DEFAULT_SESSION_GROUPS };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `Invalid CHATGPT_MCP_SESSION_GROUPS JSON: ${error instanceof Error ? error.message : 'Unknown JSON parse error'}`,
    );
  }

  return normalizeSessionGroups(parsed, 'CHATGPT_MCP_SESSION_GROUPS');
}

export function normalizeSessionGroups(value: unknown, label = 'session_groups') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object map of group->folder.`);
  }

  const groups: Record<string, string> = {};
  for (const [key, folder] of Object.entries(value as Record<string, unknown>)) {
    if (!key || typeof folder !== 'string' || folder.trim().length === 0) {
      throw new Error(`Invalid ${label} entry for "${key}".`);
    }
    groups[key.trim().toLowerCase()] = folder.trim();
  }

  return groups;
}

export function getVaultDefaults(env: Env): VaultConfig {
  const optional = env as unknown as Record<string, string | undefined>;
  return {
    allowedGithubUsername: requireEnv(env.ALLOWED_GITHUB_USERNAME, 'ALLOWED_GITHUB_USERNAME'),
    appendSection: requireEnv(env.CHATGPT_MCP_SECTION, 'CHATGPT_MCP_SECTION'),
    createFolder: requireEnv(env.CHATGPT_MCP_FOLDER, 'CHATGPT_MCP_FOLDER'),
    footerSection: optionalEnv(optional.CHATGPT_MCP_FOOTER_SECTION, DEFAULT_FOOTER_SECTION),
    repoBranch: requireEnv(env.VAULT_REPO_BRANCH, 'VAULT_REPO_BRANCH'),
    repoName: requireEnv(env.VAULT_REPO_NAME, 'VAULT_REPO_NAME'),
    repoOwner: requireEnv(env.VAULT_REPO_OWNER, 'VAULT_REPO_OWNER'),
    sessionFolderRoot: optionalEnv(optional.CHATGPT_MCP_SESSION_FOLDER_ROOT, DEFAULT_SESSION_FOLDER_ROOT),
    sessionGroups: parseSessionGroups(optional.CHATGPT_MCP_SESSION_GROUPS),
    sessionLogFolder: optionalEnv(optional.CHATGPT_MCP_SESSION_LOG_FOLDER, DEFAULT_SESSION_LOG_FOLDER),
    sessionNotesSection: optionalEnv(optional.CHATGPT_MCP_SESSION_NOTES_SECTION, DEFAULT_SESSION_NOTES_SECTION),
  };
}

export function applyOverrides(defaults: VaultConfig, overrides: VaultConfigOverrides | null): VaultConfig {
  if (!overrides) {
    return defaults;
  }
  return {
    ...defaults,
    ...overrides,
    sessionGroups: overrides.sessionGroups ?? defaults.sessionGroups,
  };
}

export async function loadVaultConfig({
  env,
  kv,
  login,
}: {
  env: Env;
  kv: KVNamespace;
  login: string;
}): Promise<VaultConfig> {
  const defaults = getVaultDefaults(env);
  const overrides = await getVaultConfigOverrides(kv, login);
  return applyOverrides(defaults, overrides);
}

export function diffOverrides(defaults: VaultConfig, effective: VaultConfig): VaultConfigField[] {
  const fields: VaultConfigField[] = [
    'appendSection',
    'createFolder',
    'footerSection',
    'repoBranch',
    'repoName',
    'repoOwner',
    'sessionFolderRoot',
    'sessionLogFolder',
    'sessionNotesSection',
  ];
  const changed = fields.filter((field) => defaults[field] !== effective[field]);
  if (JSON.stringify(defaults.sessionGroups) !== JSON.stringify(effective.sessionGroups)) {
    changed.push('sessionGroups');
  }
  return changed;
}
