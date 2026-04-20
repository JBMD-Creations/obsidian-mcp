import { describe, expect, it, vi } from 'vitest';
import {
  appendFooterNote,
  appendToNote,
  appendToSessionLog,
  createChatgptNote,
  getNote,
  searchNotes,
} from '../src/github-vault';

const config = {
  allowedGithubUsername: 'Aventerica89',
  appendSection: 'ChatGPT MCP',
  createFolder: 'ChatGPT MCP',
  footerSection: 'ChatGPT MCP Footer',
  repoBranch: 'main',
  repoName: 'Obsidian-Claude',
  repoOwner: 'Aventerica89',
  sessionFolderRoot: 'John Notes/App Dev',
  sessionGroups: {
    vaporforge: 'John Notes/App Dev/VaporForge',
  },
  sessionLogFolder: 'ChatGPT MCP/Session Logs',
  sessionNotesSection: 'Session Notes',
};

function createOctokitMock() {
  return {
    request: vi.fn(),
  };
}

describe('getNote', () => {
  it('wraps GitHub API errors with note context', async () => {
    const octokit = createOctokitMock();
    octokit.request.mockRejectedValueOnce({
      response: { data: { message: 'Not Found' }, status: 404 },
    });

    await expect(
      getNote({
        config,
        octokit: octokit as never,
        path: 'Taxes/2026/Q1/Quarterly Tax Review.md',
      }),
    ).rejects.toThrow('Loading note Taxes/2026/Q1/Quarterly Tax Review.md failed (404): Not Found');
  });
});


describe('appendToSessionLog', () => {
  it('creates a group log note if one does not exist', async () => {
    const octokit = createOctokitMock();
    octokit.request
      .mockRejectedValueOnce({
        response: { data: { message: 'Not Found' }, status: 404 },
      })
      .mockResolvedValueOnce({
        data: { content: { sha: 'new-sha' } },
      });

    const result = await appendToSessionLog({
      config,
      content: 'Captured an idea',
      folder: 'John Notes/App Dev/VaporForge',
      group: 'vaporforge',
      login: 'Aventerica89',
      octokit: octokit as never,
      relatedNotes: [],
      sessionEvent: 'note',
    });

    expect(result.path).toBe('ChatGPT MCP/Session Logs/vaporforge-session-log.md');
    const commitCall = octokit.request.mock.calls[1];
    expect(commitCall?.[1]?.path).toBe('ChatGPT MCP/Session Logs/vaporforge-session-log.md');
    const committedMarkdown = Buffer.from(commitCall?.[1]?.content, 'base64').toString('utf8');
    expect(committedMarkdown).toContain('## Session Notes');
    expect(committedMarkdown).toContain('session_event: note');
  });

  it('treats wrapped 404 errors as missing logs by reading attached status metadata', async () => {
    const octokit = createOctokitMock();
    const wrapped404 = new Error(
      'Loading note ChatGPT MCP/Session Logs/vaporforge-session-log.md failed (404): Not Found',
    ) as Error & { status?: number };
    wrapped404.status = 404;
    octokit.request.mockReset();
    octokit.request
      .mockRejectedValueOnce(wrapped404)
      .mockResolvedValueOnce({
        data: { content: { sha: 'new-sha' } },
      });

    const result = await appendToSessionLog({
      config,
      content: 'Recovered from wrapped 404',
      folder: 'John Notes/App Dev/VaporForge',
      group: 'vaporforge',
      login: 'Aventerica89',
      octokit: octokit as never,
      relatedNotes: [],
      sessionEvent: 'note',
    });

    expect(result.path).toBe('ChatGPT MCP/Session Logs/vaporforge-session-log.md');
    expect(octokit.request).toHaveBeenCalledTimes(2);
  });
});

describe('searchNotes', () => {
  it('skips unreadable files instead of failing the whole search', async () => {
    const octokit = createOctokitMock();
    octokit.request
      .mockResolvedValueOnce({ data: { object: { sha: 'commit-sha' } } })
      .mockResolvedValueOnce({ data: { tree: { sha: 'tree-sha' } } })
      .mockResolvedValueOnce({
        data: {
          tree: [
            { path: 'Taxes/2026/Q1/Quarterly Tax Review.md', type: 'blob' },
            { path: 'Taxes/2026/Q2/Quarterly Tax Review.md', type: 'blob' },
          ],
        },
      })
      .mockRejectedValueOnce({
        response: { data: { message: 'Not Found' }, status: 404 },
      })
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from('# Q2 Review\n\nAll good.').toString('base64'),
          sha: 'file-sha',
        },
      });

    const results = await searchNotes({
      config,
      octokit: octokit as never,
      query: 'quarterly',
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe('Taxes/2026/Q2/Quarterly Tax Review.md');
  });
});

describe('appendToNote', () => {
  it('wraps commit failures with note context', async () => {
    const octokit = createOctokitMock();
    octokit.request
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from('# Existing Note\n').toString('base64'),
          sha: 'existing-sha',
        },
      })
      .mockRejectedValueOnce({
        response: { data: { message: 'Conflict' }, status: 409 },
      });

    await expect(
      appendToNote({
        config,
        content: 'Added context',
        login: 'Aventerica89',
        octokit: octokit as never,
        path: 'Taxes/2026/Q1/Quarterly Tax Review.md',
        relatedNotes: [],
      }),
    ).rejects.toThrow('Committing note Taxes/2026/Q1/Quarterly Tax Review.md failed (409): Conflict');
  });
});

describe('createChatgptNote', () => {
  it('wraps tree lookup failures with repo context', async () => {
    const octokit = createOctokitMock();
    octokit.request.mockRejectedValueOnce({
      response: { data: { message: 'Bad credentials' }, status: 401 },
    });

    await expect(
      createChatgptNote({
        body: 'Body',
        config,
        login: 'Aventerica89',
        octokit: octokit as never,
        relatedNotes: [],
        tags: [],
        title: 'Tax Capture',
      }),
    ).rejects.toThrow('Loading git tree for Aventerica89/Obsidian-Claude@main failed (401): Bad credentials');
  });
});

describe('appendFooterNote', () => {
  it('appends under the footer section', async () => {
    const octokit = createOctokitMock();
    octokit.request
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from('# Existing Note\n').toString('base64'),
          sha: 'existing-sha',
        },
      })
      .mockResolvedValueOnce({
        data: { content: { sha: 'new-sha' } },
      });

    const result = await appendFooterNote({
      config,
      content: 'Footer context',
      login: 'Aventerica89',
      octokit: octokit as never,
      path: 'Taxes/2026/Q1/Quarterly Tax Review.md',
      relatedNotes: [],
    });

    expect(result.path).toBe('Taxes/2026/Q1/Quarterly Tax Review.md');
    const commitCall = octokit.request.mock.calls[1];
    expect(commitCall?.[1]?.path).toBe('Taxes/2026/Q1/Quarterly Tax Review.md');
    expect(Buffer.from(commitCall?.[1]?.content, 'base64').toString('utf8')).toContain('## ChatGPT MCP Footer');
  });
});
