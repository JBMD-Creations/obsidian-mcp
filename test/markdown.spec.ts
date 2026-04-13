import { describe, expect, it } from 'vitest';
import { appendUnderSection, buildAppendBlock, extractTitle } from '../src/markdown';

describe('extractTitle', () => {
  it('prefers frontmatter title', () => {
    const markdown = `---\ntitle: Test Note\n---\n\n# Ignored\n`;
    expect(extractTitle(markdown, 'Folder/Test Note.md')).toBe('Test Note');
  });

  it('falls back to h1 and filename', () => {
    expect(extractTitle('# Heading\n', 'Folder/Fallback.md')).toBe('Heading');
    expect(extractTitle('No heading\n', 'Folder/Fallback.md')).toBe('Fallback');
  });
});

describe('appendUnderSection', () => {
  it('creates the chatgpt section when missing', () => {
    const appended = appendUnderSection({
      block: buildAppendBlock({
        content: 'Added context',
        login: 'Aventerica89',
        now: new Date('2026-04-13T09:00:00.000Z'),
        relatedNotes: [],
      }),
      markdown: '# Existing Note\n\nOriginal content.\n',
      sectionHeading: 'ChatGPT MCP',
    });

    expect(appended).toContain('## ChatGPT MCP');
    expect(appended).toContain('Added context');
  });

  it('appends inside the section before the next h2', () => {
    const appended = appendUnderSection({
      block: '### 2026-04-13T09:00:00.000Z\n\nAdded context\n',
      markdown: '# Existing Note\n\n## ChatGPT MCP\n\nOld block\n\n## Next Section\n\nKeep this here.\n',
      sectionHeading: 'ChatGPT MCP',
    });

    expect(appended.indexOf('Added context')).toBeLessThan(appended.indexOf('## Next Section'));
  });
});
