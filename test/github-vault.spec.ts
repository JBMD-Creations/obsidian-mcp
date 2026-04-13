import { describe, expect, it, vi } from 'vitest';
import { appendToNote, createChatgptNote, getNote, searchNotes } from '../src/github-vault';

const config = {
  allowedGithubUsername: 'Aventerica89',
  appendSection: 'ChatGPT MCP',
  createFolder: 'ChatGPT MCP',
  repoBranch: 'main',
  repoName: 'Obsidian-Claude',
  repoOwner: 'Aventerica89',
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
