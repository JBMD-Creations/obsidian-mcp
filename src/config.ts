export type VaultConfig = {
  allowedGithubUsername: string;
  appendSection: string;
  createFolder: string;
  repoBranch: string;
  repoName: string;
  repoOwner: string;
};

function requireEnv(value: string | undefined, key: string) {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

export function getVaultConfig(env: Env): VaultConfig {
  return {
    allowedGithubUsername: requireEnv(env.ALLOWED_GITHUB_USERNAME, 'ALLOWED_GITHUB_USERNAME'),
    appendSection: requireEnv(env.CHATGPT_MCP_SECTION, 'CHATGPT_MCP_SECTION'),
    createFolder: requireEnv(env.CHATGPT_MCP_FOLDER, 'CHATGPT_MCP_FOLDER'),
    repoBranch: requireEnv(env.VAULT_REPO_BRANCH, 'VAULT_REPO_BRANCH'),
    repoName: requireEnv(env.VAULT_REPO_NAME, 'VAULT_REPO_NAME'),
    repoOwner: requireEnv(env.VAULT_REPO_OWNER, 'VAULT_REPO_OWNER'),
  };
}
