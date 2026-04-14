import { describe, expect, it } from 'vitest';
import {
  assertAllowedFolderPath,
  assertAllowedMarkdownPath,
  buildCreatePath,
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
