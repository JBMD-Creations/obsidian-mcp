import { describe, expect, it } from 'vitest';
import {
  assertAllowedFolderPath,
  assertAllowedMarkdownPath,
  buildCreatePath,
  buildGithubBlobUrl,
  buildSessionLogPath,
  slugifyTitle,
} from '../src/pathing';

describe('assertAllowedMarkdownPath', () => {
  it('accepts normal markdown paths', () => {
    expect(assertAllowedMarkdownPath('Taxes/2026/Q1/Quarterly Tax Review.md')).toBe(
      'Taxes/2026/Q1/Quarterly Tax Review.md',
    );
  });

  it('rejects traversal and hidden paths', () => {
    expect(() => assertAllowedMarkdownPath('../secret.md')).toThrow();
    expect(() => assertAllowedMarkdownPath('.obsidian/config.md')).toThrow();
    expect(() => assertAllowedMarkdownPath('Taxes/file.pdf')).toThrow();
  });
});

describe('buildCreatePath', () => {
  it('creates a unique note path in the ChatGPT MCP folder', () => {
    const path = buildCreatePath({
      date: '2026-04-13',
      existingPaths: new Set(['ChatGPT MCP/2026-04-13-new-note.md']),
      folder: 'ChatGPT MCP',
      title: 'New Note',
    });

    expect(path).toBe('ChatGPT MCP/2026-04-13-new-note-2.md');
  });

  it('slugifies titles predictably', () => {
    expect(slugifyTitle('  Tax Verification Update  ')).toBe('tax-verification-update');
  });
});

describe('assertAllowedFolderPath', () => {
  it('accepts normal folder paths', () => {
    expect(assertAllowedFolderPath('John Notes/App Dev/VaporForge')).toBe('John Notes/App Dev/VaporForge');
  });

  it('rejects traversal and hidden folders', () => {
    expect(() => assertAllowedFolderPath('../etc')).toThrow();
    expect(() => assertAllowedFolderPath('.obsidian/plugins')).toThrow();
  });
});

describe('buildSessionLogPath', () => {
  it('builds a deterministic group log path', () => {
    expect(buildSessionLogPath({ folder: 'ChatGPT MCP/Session Logs', group: 'VaporForge' })).toBe(
      'ChatGPT MCP/Session Logs/vaporforge-session-log.md',
    );
  });
});

describe('buildGithubBlobUrl', () => {
  const base = { branch: 'main', owner: 'Aventerica89', repo: 'Obsidian-Claude' };

  it('encodes a plain markdown path', () => {
    expect(buildGithubBlobUrl({ ...base, path: 'Notes/foo.md' })).toBe(
      'https://github.com/Aventerica89/Obsidian-Claude/blob/main/Notes/foo.md',
    );
  });

  it('percent-encodes spaces per segment', () => {
    expect(buildGithubBlobUrl({ ...base, path: 'John Notes/My File.md' })).toBe(
      'https://github.com/Aventerica89/Obsidian-Claude/blob/main/John%20Notes/My%20File.md',
    );
  });

  it('percent-encodes non-ASCII filenames', () => {
    expect(buildGithubBlobUrl({ ...base, path: 'Notes/résumé.md' })).toBe(
      'https://github.com/Aventerica89/Obsidian-Claude/blob/main/Notes/r%C3%A9sum%C3%A9.md',
    );
  });

  it('percent-encodes # and ? in filenames', () => {
    expect(buildGithubBlobUrl({ ...base, path: 'Notes/what#then?.md' })).toBe(
      'https://github.com/Aventerica89/Obsidian-Claude/blob/main/Notes/what%23then%3F.md',
    );
  });

  it('preserves slashes in branch names but encodes each segment', () => {
    expect(buildGithubBlobUrl({ ...base, branch: 'release/v1 beta', path: 'Notes/foo.md' })).toBe(
      'https://github.com/Aventerica89/Obsidian-Claude/blob/release/v1%20beta/Notes/foo.md',
    );
  });

  it('rejects disallowed paths', () => {
    expect(() => buildGithubBlobUrl({ ...base, path: '.obsidian/foo.md' })).toThrow();
    expect(() => buildGithubBlobUrl({ ...base, path: '../escape.md' })).toThrow();
    expect(() => buildGithubBlobUrl({ ...base, path: 'Notes/foo.pdf' })).toThrow();
  });
});
