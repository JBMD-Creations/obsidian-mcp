import { toWikiLink } from './pathing';

const FRONTMATTER_REGEX = /^---\n[\s\S]*?\n---\n*/;

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, '\n');
}

function quoteYaml(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

export function stripFrontmatter(markdown: string) {
  return normalizeMarkdown(markdown).replace(FRONTMATTER_REGEX, '');
}

export function extractTitle(markdown: string, path: string) {
  const normalized = normalizeMarkdown(markdown);
  const frontmatterMatch = normalized.match(FRONTMATTER_REGEX);
  if (frontmatterMatch) {
    const titleMatch = frontmatterMatch[0].match(/^title:\s*(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }

  const headingMatch = stripFrontmatter(normalized).match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

export function buildPreview(markdown: string) {
  return stripFrontmatter(markdown)
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function buildAppendBlock({
  content,
  login,
  now,
  relatedNotes,
}: {
  content: string;
  login: string;
  now: Date;
  relatedNotes: string[];
}) {
  const lines = [
    `### ${now.toISOString()}`,
    '- source: chatgpt-mcp',
    `- actor: ${login}`,
    '- needs_review: true',
  ];

  if (relatedNotes.length > 0) {
    lines.push(`- related_notes: ${relatedNotes.map(toWikiLink).join(', ')}`);
  }

  return `${lines.join('\n')}\n\n${content.trim()}\n`;
}

export function appendUnderSection({
  block,
  markdown,
  sectionHeading,
}: {
  block: string;
  markdown: string;
  sectionHeading: string;
}) {
  const sectionLine = `## ${sectionHeading}`;
  const lines = normalizeMarkdown(markdown).trimEnd().split('\n');
  const sectionIndex = lines.findIndex((line) => line.trim() === sectionLine);
  const blockLines = ['', ...block.trimEnd().split('\n'), ''];

  if (sectionIndex === -1) {
    return `${lines.join('\n')}\n\n${sectionLine}\n${blockLines.join('\n')}`.trimEnd() + '\n';
  }

  let insertIndex = lines.length;
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    if (/^#{1,2}\s+/.test(lines[index])) {
      insertIndex = index;
      break;
    }
  }

  const nextLines = [...lines.slice(0, insertIndex), ...blockLines, ...lines.slice(insertIndex)];
  return `${nextLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

export function buildCreatedNote({
  body,
  createdAt,
  login,
  relatedNotes,
  tags,
  title,
}: {
  body: string;
  createdAt: Date;
  login: string;
  relatedNotes: string[];
  tags: string[];
  title: string;
}) {
  const frontmatter = [
    '---',
    `title: ${quoteYaml(title)}`,
    'created_by: chatgpt-mcp',
    `created_at: ${createdAt.toISOString()}`,
    `actor: ${quoteYaml(login)}`,
    'needs_review: true',
  ];

  const dedupedTags = Array.from(new Set(['chatgpt-mcp', ...tags]));
  if (relatedNotes.length > 0) {
    frontmatter.push('related_notes:');
    for (const note of relatedNotes) {
      frontmatter.push(`  - ${quoteYaml(note)}`);
    }
  }
  if (dedupedTags.length > 0) {
    frontmatter.push('tags:');
    for (const tag of dedupedTags) {
      frontmatter.push(`  - ${quoteYaml(tag)}`);
    }
  }
  frontmatter.push('---', '');

  return `${frontmatter.join('\n')}# ${title}\n\n${body.trim()}\n`;
}

export function buildSessionLogNote({
  createdAt,
  folder,
  group,
  login,
  sectionHeading,
}: {
  createdAt: Date;
  folder: string;
  group: string;
  login: string;
  sectionHeading: string;
}) {
  const title = `${group} Session Log`;
  const frontmatter = [
    '---',
    `title: ${quoteYaml(title)}`,
    'created_by: chatgpt-mcp',
    `created_at: ${createdAt.toISOString()}`,
    `actor: ${quoteYaml(login)}`,
    `session_group: ${quoteYaml(group)}`,
    `session_folder: ${quoteYaml(folder)}`,
    'needs_review: true',
    'tags:',
    `  - ${quoteYaml('chatgpt-mcp')}`,
    `  - ${quoteYaml('session-log')}`,
    `  - ${quoteYaml(group.toLowerCase())}`,
    '---',
    '',
  ];

  return [
    ...frontmatter,
    `# ${title}`,
    '',
    `- Session scope folder: \`${folder}\``,
    '',
    `## ${sectionHeading}`,
    '',
  ].join('\n');
}
