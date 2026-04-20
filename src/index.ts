import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Octokit } from 'octokit';
import { z } from 'zod';
import { diffOverrides, getVaultDefaults, loadVaultConfig, normalizeSessionGroups, type VaultConfig } from './config';
import { GitHubHandler } from './github-handler';
import {
  appendFooterNote,
  appendToNote,
  appendToSessionLog,
  createChatgptNote,
  getNote,
  listNotesInFolder,
  searchNotes,
} from './github-vault';
import {
  assertAllowedCreateLocation,
  assertAllowedFolderPath,
  assertAllowedMarkdownPath,
  buildGithubBlobUrl,
  buildSessionLogPath,
} from './pathing';
import { clearActiveSession, getActiveSession, saveActiveSession, type ActiveSessionRecord } from './session-store';
import { normalizeNoteContent, resolveSessionId } from './session-tools';
import {
  clearVaultConfigOverrides,
  getVaultConfigOverrides,
  saveVaultConfigOverrides,
  type VaultConfigOverrides,
} from './vault-config-store';
import type { Props } from './utils';

type SessionState = {
  activeSession: ActiveSessionRecord | null;
};

function asText(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function describeVaultConfig(config: VaultConfig) {
  return {
    allowed_github_username: config.allowedGithubUsername,
    append_section: config.appendSection,
    create_folder: config.createFolder,
    footer_section: config.footerSection,
    repo_branch: config.repoBranch,
    repo_name: config.repoName,
    repo_owner: config.repoOwner,
    session_folder_root: config.sessionFolderRoot,
    session_groups: config.sessionGroups,
    session_log_folder: config.sessionLogFolder,
    session_notes_section: config.sessionNotesSection,
  };
}

function isFolderInScope(folder: string, root: string) {
  return folder === root || folder.startsWith(`${root}/`);
}

function resolveSessionFolder({
  folderPath,
  group,
  sessionFolderRoot,
  sessionGroups,
}: {
  folderPath?: string;
  group: string;
  sessionFolderRoot: string;
  sessionGroups: Record<string, string>;
}) {
  const trimmedGroup = group.trim();
  const normalizedGroup = trimmedGroup.toLowerCase();
  const folderCandidate = folderPath ? folderPath : sessionGroups[normalizedGroup];

  if (!folderCandidate) {
    const known = Object.keys(sessionGroups).sort();
    throw new Error(`Unknown session group "${trimmedGroup}". Known groups: ${known.join(', ')}.`);
  }

  const normalizedFolder = assertAllowedFolderPath(folderCandidate);
  const normalizedRoot = assertAllowedFolderPath(sessionFolderRoot);
  if (!isFolderInScope(normalizedFolder, normalizedRoot)) {
    throw new Error(`Folder must be inside ${normalizedRoot}/.`);
  }

  return {
    folder: normalizedFolder,
    group: trimmedGroup,
  };
}

export class ObsidianMCP extends McpAgent<Env, SessionState, Props> {
  initialState: SessionState = {
    activeSession: null,
  };

  server = new McpServer({
    name: 'Obsidian MCP',
    version: '0.2.0',
  });

  async init() {
    const octokit = new Octokit({ auth: this.props!.accessToken });

    const loadConfig = () =>
      loadVaultConfig({
        env: this.env,
        kv: this.env.OAUTH_KV,
        login: this.props!.login,
      });

    const loadActiveSession = async () => getActiveSession(this.env.OAUTH_KV, this.props!.login);

    const startSession = async ({
      folder_path,
      group,
      title,
    }: {
      folder_path?: string;
      group: string;
      title?: string;
    }) => {
      const config = await loadConfig();
      const resolved = resolveSessionFolder({
        folderPath: folder_path,
        group,
        sessionFolderRoot: config.sessionFolderRoot,
        sessionGroups: config.sessionGroups,
      });
      const folderSummary = await listNotesInFolder({
        config,
        folder: resolved.folder,
        limit: 20,
        octokit,
      });

      const session: ActiveSessionRecord = {
        folder: resolved.folder,
        group: resolved.group,
        logPath: buildSessionLogPath({
          folder: config.sessionLogFolder,
          group: resolved.group,
        }),
        sessionId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        title: title?.trim().length ? title.trim() : undefined,
      };

      await saveActiveSession(this.env.OAUTH_KV, this.props!.login, session);
      this.setState({ activeSession: session });

      return asText({
        active_session: session,
        folder_summary: folderSummary,
        usage: {
          end: `end_session(summary: \"...\", session_id: \"${session.sessionId}\")`,
          note: `note(text: \"...\", session_id: \"${session.sessionId}\")`,
        },
      });
    };

    const endSession = async ({
      related_notes,
      session_id,
      summary,
    }: {
      related_notes: string[];
      session_id?: string;
      summary?: string;
    }) => {
      const config = await loadConfig();
      const activeSession = await loadActiveSession();
      if (!activeSession) {
        throw new Error('No active session to close.');
      }

      const resolvedSessionId = resolveSessionId({
        session_id,
        storedSessionId: activeSession.sessionId,
      });
      if (!resolvedSessionId || resolvedSessionId !== activeSession.sessionId) {
        throw new Error('Session mismatch. Run start_session(group, folder_path?) again.');
      }

      const finalSummary = summary?.trim().length ? summary.trim() : 'Session ended.';
      const result = await appendToSessionLog({
        config,
        content: finalSummary,
        folder: activeSession.folder,
        group: activeSession.group,
        login: this.props!.login,
        octokit,
        relatedNotes: related_notes,
        sessionEvent: 'end',
      });

      await clearActiveSession(this.env.OAUTH_KV, this.props!.login);
      this.setState({ activeSession: null });

      return asText({
        closed_session: activeSession,
        updated_note: result,
      });
    };

    this.server.tool(
      'list_allowed_destinations',
      'Describe where ChatGPT is allowed to create notes and how appends are constrained.',
      {},
      async () => {
        const config = await loadConfig();
        const activeSession = await loadActiveSession();

        return asText({
          append: {
            footer_rule: `Append to any existing markdown note only under ## ${config.footerSection}.`,
            section_rule: `Append to any existing markdown note only under ## ${config.appendSection}.`,
          },
          create: {
            folder: `${config.createFolder}/`,
          },
          sessions: {
            active_session: activeSession,
            folder_root: `${config.sessionFolderRoot}/`,
            log_folder: `${config.sessionLogFolder}/`,
            notes_section: config.sessionNotesSection,
            start_command: 'start_session(group, folder_path?, title?)',
            note_command: 'note(content?, text?, related_notes?, session_id?)',
            end_command: 'end_session(summary?, related_notes?, session_id?)',
          },
          repo: `${config.repoOwner}/${config.repoName}`,
        });
      },
    );

    this.server.tool(
      'list_session_groups',
      'List configured session groups and their repo folder mappings.',
      {},
      async () => {
        const config = await loadConfig();
        const activeSession = await loadActiveSession();

        return asText({
          active_session: activeSession,
          groups: Object.entries(config.sessionGroups)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([group, folder]) => ({ folder, group })),
          root: `${config.sessionFolderRoot}/`,
        });
      },
    );

    this.server.tool(
      'start_session',
      'Start a scoped session for a project group/folder. This sets the default target for note() and end_session().',
      {
        group: z.string().min(1),
        folder_path: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
      },
      startSession,
    );

    this.server.tool(
      'start',
      'Alias for start_session: start a scoped session for a project group/folder.',
      {
        group: z.string().min(1),
        folder_path: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
      },
      startSession,
    );

    this.server.tool(
      'note',
      'Append a session note to the active session log note created per project group.',
      {
        content: z.string().min(1).optional(),
        text: z.string().min(1).optional(),
        related_notes: z.array(z.string()).optional().default([]),
        session_id: z.string().optional(),
      },
      async ({ content, related_notes, session_id, text }) => {
        const config = await loadConfig();
        const activeSession = await loadActiveSession();
        if (!activeSession) {
          throw new Error('No active session. Run start_session(group, folder_path?) first.');
        }

        const resolvedSessionId = resolveSessionId({
          session_id,
          storedSessionId: activeSession.sessionId,
        });
        if (!resolvedSessionId || resolvedSessionId !== activeSession.sessionId) {
          throw new Error('Session mismatch. Run start_session(group, folder_path?) again.');
        }

        const normalizedContent = normalizeNoteContent({ content, text });

        const result = await appendToSessionLog({
          config,
          content: normalizedContent,
          folder: activeSession.folder,
          group: activeSession.group,
          login: this.props!.login,
          octokit,
          relatedNotes: related_notes,
          sessionEvent: 'note',
        });

        return asText({
          active_session: activeSession,
          updated_note: result,
        });
      },
    );

    this.server.tool(
      'end_session',
      'Close the active session and append a final summary block to the session log note.',
      {
        summary: z.string().optional(),
        related_notes: z.array(z.string()).optional().default([]),
        session_id: z.string().optional(),
      },
      endSession,
    );

    this.server.tool(
      'end',
      'Alias for end_session: close the active session and append a final summary block.',
      {
        summary: z.string().optional(),
        related_notes: z.array(z.string()).optional().default([]),
        session_id: z.string().optional(),
      },
      endSession,
    );

    this.server.tool(
      'search_notes',
      'Find likely markdown notes by path/title and return short previews.',
      {
        query: z.string().min(1),
        folder: z.string().optional(),
      },
      async ({ folder, query }) => {
        const config = await loadConfig();
        return asText(await searchNotes({ config, folder, octokit, query }));
      },
    );

    this.server.tool(
      'get_note',
      'Read a markdown note from the Obsidian vault repo.',
      {
        path: z.string().min(1),
      },
      async ({ path }) => {
        const config = await loadConfig();
        return asText(await getNote({ config, octokit, path: assertAllowedMarkdownPath(path) }));
      },
    );

    this.server.tool(
      'search',
      'ChatGPT connector compatibility: search vault notes by query and return ids for fetch().',
      {
        query: z.string().min(1),
      },
      async ({ query }) => {
        const config = await loadConfig();
        const matches = await searchNotes({ config, octokit, query });
        const results = matches.map((result) => ({
          id: result.path,
          title: result.title,
          url: buildGithubBlobUrl({
            branch: config.repoBranch,
            owner: config.repoOwner,
            path: result.path,
            repo: config.repoName,
          }),
        }));
        return asText({ results });
      },
    );

    this.server.tool(
      'fetch',
      'ChatGPT connector compatibility: fetch the full text of a vault note by id (from search()).',
      {
        id: z.string().min(1),
      },
      async ({ id }) => {
        const config = await loadConfig();
        const path = assertAllowedMarkdownPath(id);
        const note = await getNote({ config, octokit, path });
        const url = buildGithubBlobUrl({
          branch: config.repoBranch,
          owner: config.repoOwner,
          path: note.path,
          repo: config.repoName,
        });
        return asText({
          id: note.path,
          title: note.title,
          text: note.content,
          url,
          metadata: {
            branch: config.repoBranch,
            path: note.path,
            repo: `${config.repoOwner}/${config.repoName}`,
          },
        });
      },
    );

    this.server.tool(
      'append_to_note',
      'Append a structured block to an existing note under the ChatGPT MCP section.',
      {
        path: z.string().min(1),
        content: z.string().min(1),
        related_notes: z.array(z.string()).optional().default([]),
      },
      async ({ content, path, related_notes }) => {
        const config = await loadConfig();
        return asText(
          await appendToNote({
            config,
            content,
            login: this.props!.login,
            octokit,
            path,
            relatedNotes: related_notes,
          }),
        );
      },
    );

    this.server.tool(
      'append_footer_note',
      'Append a structured block to an existing note under the dedicated footer section.',
      {
        path: z.string().min(1),
        content: z.string().min(1),
        related_notes: z.array(z.string()).optional().default([]),
      },
      async ({ content, path, related_notes }) => {
        const config = await loadConfig();
        return asText(
          await appendFooterNote({
            config,
            content,
            login: this.props!.login,
            octokit,
            path,
            relatedNotes: related_notes,
          }),
        );
      },
    );

    this.server.tool(
      'create_chatgpt_note',
      'Create a new reviewable note. Defaults to the ChatGPT MCP folder; pass folder to target any project folder under the session root.',
      {
        title: z.string().min(1),
        body: z.string().min(1),
        folder: z.string().min(1).optional(),
        related_notes: z.array(z.string()).optional().default([]),
        tags: z.array(z.string()).optional().default([]),
      },
      async ({ body, folder, related_notes, tags, title }) => {
        const config = await loadConfig();
        const targetFolder = folder
          ? assertAllowedCreateLocation(folder, {
              createFolder: config.createFolder,
              sessionFolderRoot: config.sessionFolderRoot,
            })
          : undefined;
        return asText(
          await createChatgptNote({
            body,
            config,
            folder: targetFolder,
            login: this.props!.login,
            octokit,
            relatedNotes: related_notes,
            tags,
            title,
          }),
        );
      },
    );

    this.server.tool(
      'get_vault_config',
      'Return the current effective vault config plus which fields were overridden via set_vault_config.',
      {},
      async () => {
        const defaults = getVaultDefaults(this.env);
        const overrides = await getVaultConfigOverrides(this.env.OAUTH_KV, this.props!.login);
        const effective = await loadConfig();
        return asText({
          effective: describeVaultConfig(effective),
          defaults: describeVaultConfig(defaults),
          overridden_fields: diffOverrides(defaults, effective),
          has_overrides: Boolean(overrides),
        });
      },
    );

    this.server.tool(
      'set_vault_config',
      'Store per-user vault config overrides in KV. Any field omitted keeps its prior value. Changes take effect on the next tool call.',
      {
        repo_owner: z.string().min(1).optional(),
        repo_name: z.string().min(1).optional(),
        repo_branch: z.string().min(1).optional(),
        create_folder: z.string().min(1).optional(),
        append_section: z.string().min(1).optional(),
        footer_section: z.string().min(1).optional(),
        session_folder_root: z.string().min(1).optional(),
        session_log_folder: z.string().min(1).optional(),
        session_notes_section: z.string().min(1).optional(),
        session_groups: z.record(z.string(), z.string()).optional(),
      },
      async (input) => {
        const update: VaultConfigOverrides = {};
        if (input.repo_owner) update.repoOwner = input.repo_owner.trim();
        if (input.repo_name) update.repoName = input.repo_name.trim();
        if (input.repo_branch) update.repoBranch = input.repo_branch.trim();
        if (input.create_folder) update.createFolder = assertAllowedFolderPath(input.create_folder);
        if (input.append_section) update.appendSection = input.append_section.trim();
        if (input.footer_section) update.footerSection = input.footer_section.trim();
        if (input.session_folder_root) update.sessionFolderRoot = assertAllowedFolderPath(input.session_folder_root);
        if (input.session_log_folder) update.sessionLogFolder = assertAllowedFolderPath(input.session_log_folder);
        if (input.session_notes_section) update.sessionNotesSection = input.session_notes_section.trim();
        if (input.session_groups) update.sessionGroups = normalizeSessionGroups(input.session_groups, 'session_groups');

        if (Object.keys(update).length === 0) {
          throw new Error('No overrides supplied. Pass at least one field, or call reset_vault_config to clear.');
        }

        await saveVaultConfigOverrides(this.env.OAUTH_KV, this.props!.login, update);
        const effective = await loadConfig();
        const defaults = getVaultDefaults(this.env);
        return asText({
          effective: describeVaultConfig(effective),
          overridden_fields: diffOverrides(defaults, effective),
        });
      },
    );

    this.server.tool(
      'reset_vault_config',
      'Delete the per-user vault config override record so the Worker env defaults apply again.',
      {},
      async () => {
        await clearVaultConfigOverrides(this.env.OAUTH_KV, this.props!.login);
        const effective = await loadConfig();
        return asText({
          cleared: true,
          effective: describeVaultConfig(effective),
        });
      },
    );
  }
}

export default new OAuthProvider({
  apiHandlers: {
    '/mcp': ObsidianMCP.serve('/mcp'),
    '/sse': ObsidianMCP.serveSSE('/sse'),
  },
  authorizeEndpoint: '/authorize',
  clientRegistrationEndpoint: '/register',
  defaultHandler: GitHubHandler as never,
  tokenEndpoint: '/token',
});
