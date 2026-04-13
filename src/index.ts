import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Octokit } from 'octokit';
import { z } from 'zod';
import { getVaultConfig } from './config';
import { GitHubHandler } from './github-handler';
import { appendToNote, createChatgptNote, getNote, searchNotes } from './github-vault';
import { assertAllowedMarkdownPath } from './pathing';
import type { Props } from './utils';

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

export class ObsidianMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: 'Obsidian MCP',
    version: '0.1.0',
  });

  async init() {
    const config = getVaultConfig(this.env);
    const octokit = new Octokit({ auth: this.props!.accessToken });

    this.server.tool(
      'list_allowed_destinations',
      'Describe where ChatGPT is allowed to create notes and how appends are constrained.',
      {},
      async () =>
        asText({
          append: {
            rule: `Append only under ## ${config.appendSection} in existing markdown notes.`,
          },
          create: {
            folder: `${config.createFolder}/`,
          },
          repo: `${config.repoOwner}/${config.repoName}`,
        }),
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
