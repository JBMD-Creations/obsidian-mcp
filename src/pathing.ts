const MARKDOWN_EXTENSION = /\.md$/i;
const DISALLOWED_PREFIXES = ['.git/', '.obsidian/'];

function collapseSlashes(value: string) {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function normalizeNotePath(input: string) {
  const normalized = collapseSlashes(input.trim()).replace(/^\/+/, '');
  if (normalized.length === 0) {
    throw new Error('Path is required.');
  }
  if (normalized.includes('..')) {
    throw new Error('Path traversal is not allowed.');
  }
  return normalized;
}

function assertAllowedPathSegments(path: string) {
  if (DISALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    throw new Error('That path is not allowed.');
  }
  if (path.split('/').some((segment) => segment.startsWith('.'))) {
    throw new Error('Hidden paths are not allowed.');
  }
}

export function assertAllowedFolderPath(input: string) {
  const path = normalizeNotePath(input).replace(/\/+$/, '');
  if (path.length === 0) {
    throw new Error('Folder path is required.');
  }
  assertAllowedPathSegments(path);
  return path;
}

export function assertAllowedMarkdownPath(input: string) {
  const path = normalizeNotePath(input);
  if (!MARKDOWN_EXTENSION.test(path)) {
    throw new Error('Only Markdown notes are allowed.');
  }
  assertAllowedPathSegments(path);
  return path;
}

export function slugifyTitle(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'untitled-note';
}

export function toWikiLink(path: string) {
  return `[[${path.replace(/\.md$/i, '')}]]`;
}

export function buildCreatePath({
  date,
  existingPaths,
  folder,
  title,
}: {
  date: string;
  existingPaths: Set<string>;
  folder: string;
  title: string;
}) {
  const normalizedFolder = assertAllowedFolderPath(folder);
  const slug = slugifyTitle(title);

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const candidate = `${normalizedFolder}/${date}-${slug}${suffix}.md`;
    if (!existingPaths.has(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not generate a unique note path.');
}

export function buildSessionLogPath({ folder, group }: { folder: string; group: string }) {
  const normalizedFolder = assertAllowedFolderPath(folder);
  const slug = slugifyTitle(group);
  return `${normalizedFolder}/${slug}-session-log.md`;
}
