import { describe, expect, it } from 'vitest';
import { getVaultConfig } from '../src/config';

describe('getVaultConfig', () => {
  const baseEnv = {
    ALLOWED_GITHUB_USERNAME: 'Aventerica89',
    CHATGPT_MCP_FOLDER: 'ChatGPT MCP',
    CHATGPT_MCP_SECTION: 'ChatGPT MCP',
    VAULT_REPO_BRANCH: 'main',
    VAULT_REPO_NAME: 'Obsidian-Claude',
    VAULT_REPO_OWNER: 'Aventerica89',
  } as Env;

  it('defaults session groups to an empty map when env is omitted', () => {
    const config = getVaultConfig(baseEnv);

    expect(config.sessionGroups).toEqual({});
  });

  it('fully overrides default session groups when env is provided', () => {
    const config = getVaultConfig({
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
