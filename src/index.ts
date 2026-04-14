import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Octokit } from 'octokit';
import { z } from 'zod';
import { getVaultConfig } from './config';
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
import { assertAllowedFolderPath, assertAllowedMarkdownPath, buildSessionLogPath } from './pathing';
import type { Props } from './utils';

type ActiveSession = {
  folder: string;
  group: string;
  logPath: string;
  startedAt: string;
};

type SessionState = {
  activeSession: ActiveSession | null;
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
    const config = getVaultConfig(this.env);
    const octokit = new Octokit({ auth: this.props!.accessToken });
    const startSession = async ({ folder_path, group }: { folder_path?: string; group: string }) => {
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
      const session: ActiveSession = {
        folder: resolved.folder,
        group: resolved.group,
        logPath: buildSessionLogPath({
          folder: config.sessionLogFolder,
          group: resolved.group,
        }),
        startedAt: new Date().toISOString(),
      };
      this.setState({ activeSession: session });
      return asText({
        active_session: session,
        folder_summary: folderSummary,
      });
    };
    const endSession = async ({ related_notes, summary }: { related_notes: string[]; summary?: string }) => {
      const activeSession = this.state?.activeSession;
      if (!activeSession) {
        throw new Error('No active session to close.');
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
      async () =>
        asText({
          append: {
            footer_rule: `Append to any existing markdown note only under ## ${config.footerSection}.`,
            section_rule: `Append to any existing markdown note only under ## ${config.appendSection}.`,
          },
          create: {
            folder: `${config.createFolder}/`,
          },
          sessions: {
            active_session: this.state?.activeSession ?? null,
            folder_root: `${config.sessionFolderRoot}/`,
            log_folder: `${config.sessionLogFolder}/`,
            notes_section: config.sessionNotesSection,
            start_command: 'start_session(group, folder_path?)',
            note_command: 'note(content, related_notes?)',
            end_command: 'end_session(summary?)',
          },
          repo: `${config.repoOwner}/${config.repoName}`,
        }),
    );

    this.server.tool(
      'list_session_groups',
      'List configured session groups and their repo folder mappings.',
      {},
      async () =>
        asText({
          active_session: this.state?.activeSession ?? null,
          groups: Object.entries(config.sessionGroups)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([group, folder]) => ({ folder, group })),
          root: `${config.sessionFolderRoot}/`,
        }),
    );

    this.server.tool(
      'start_session',
      'Start a scoped session for a project group/folder. This sets the default target for note() and end_session().',
      {
        group: z.string().min(1),
        folder_path: z.string().min(1).optional(),
      },
      startSession,
    );

    this.server.tool(
      'start',
      'Alias for start_session: start a scoped session for a project group/folder.',
      {
        group: z.string().min(1),
        folder_path: z.string().min(1).optional(),
      },
      startSession,
    );

    this.server.tool(
      'note',
      'Append a session note to the active session log note created per project group.',
      {
        content: z.string().min(1),
        related_notes: z.array(z.string()).optional().default([]),
      },
      async ({ content, related_notes }) => {
        const activeSession = this.state?.activeSession;
        if (!activeSession) {
          throw new Error('No active session. Run start_session(group, folder_path?) first.');
        }
        const result = await appendToSessionLog({
          config,
          content,
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
      },
      endSession,
    );

    this.server.tool(
      'end',
      'Alias for end_session: close the active session and append a final summary block.',
      {
        summary: z.string().optional(),
        related_notes: z.array(z.string()).optional().default([]),
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
      async ({ folder, query }) => asText(await searchNotes({ config, folder, octokit, query })),
    );

    this.server.tool(
      'get_note',
      'Read a markdown note from the Obsidian vault repo.',
      {
        path: z.string().min(1),
      },
      async ({ path }) => asText(await getNote({ config, octokit, path: assertAllowedMarkdownPath(path) })),
    );

    this.server.tool(
      'append_to_note',
      'Append a structured block to an existing note under the ChatGPT MCP section.',
      {
        path: z.string().min(1),
        content: z.string().min(1),
        related_notes: z.array(z.string()).optional().default([]),
      },
      async ({ content, path, related_notes }) =>
        asText(
          await appendToNote({
            config,
            content,
            login: this.props!.login,
            octokit,
            path,
            relatedNotes: related_notes,
          }),
        ),
    );

    this.server.tool(
      'append_footer_note',
      'Append a structured block to an existing note under the dedicated footer section.',
      {
        path: z.string().min(1),
        content: z.string().min(1),
        related_notes: z.array(z.string()).optional().default([]),
      },
      async ({ content, path, related_notes }) =>
        asText(
          await appendFooterNote({
            config,
            content,
            login: this.props!.login,
            octokit,
            path,
            relatedNotes: related_notes,
          }),
        ),
    );

    this.server.tool(
      'create_chatgpt_note',
      'Create a new reviewable note inside the ChatGPT MCP folder.',
      {
        title: z.string().min(1),
        body: z.string().min(1),
        related_notes: z.array(z.string()).optional().default([]),
        tags: z.array(z.string()).optional().default([]),
      },
      async ({ body, related_notes, tags, title }) =>
        asText(
          await createChatgptNote({
            body,
            config,
            login: this.props!.login,
            octokit,
            relatedNotes: related_notes,
            tags,
            title,
          }),
        ),
    );
  }
}

export default new OAuthProvider({
  apiHandler: ObsidianMCP.serve('/mcp'),
  apiRoute: '/mcp',
  authorizeEndpoint: '/authorize',
  clientRegistrationEndpoint: '/register',
  defaultHandler: GitHubHandler as never,
  tokenEndpoint: '/token',
});
