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

const DEFAULT_FOOTER_SECTION = 'ChatGPT MCP Footer';
const DEFAULT_SESSION_FOLDER_ROOT = 'John Notes/App Dev';
const DEFAULT_SESSION_LOG_FOLDER = 'ChatGPT MCP/Session Logs';
const DEFAULT_SESSION_NOTES_SECTION = 'Session Notes';
const DEFAULT_SESSION_GROUPS: Record<string, string> = {
  'agency-ops': 'John Notes/App Dev/Agency Ops',
  vaporforge: 'John Notes/App Dev/VaporForge',
};

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

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid CHATGPT_MCP_SESSION_GROUPS JSON: expected an object map of group->folder.');
  }

  const groups = { ...DEFAULT_SESSION_GROUPS };
  for (const [key, folder] of Object.entries(parsed)) {
    if (!key || typeof folder !== 'string' || folder.trim().length === 0) {
      throw new Error(`Invalid CHATGPT_MCP_SESSION_GROUPS entry for "${key}".`);
    }
    groups[key.trim().toLowerCase()] = folder.trim();
  }

  return groups;
}

export function getVaultConfig(env: Env): VaultConfig {
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
