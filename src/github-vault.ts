import { Octokit } from 'octokit';
import type { VaultConfig } from './config';
import {
  appendUnderSection,
  buildAppendBlock,
  buildCreatedNote,
  buildPreview,
  extractTitle,
} from './markdown';
import { assertAllowedMarkdownPath, buildCreatePath } from './pathing';

export type SearchResult = {
  path: string;
  preview: string;
  title: string;
};

export type NoteRecord = {
  content: string;
  path: string;
  title: string;
};

type RepoFile = {
  content?: string;
  path: string;
  sha: string;
};

function toBase64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function fromBase64(value: string) {
  return Buffer.from(value, 'base64').toString('utf8');
}

async function getTreeSha(octokit: Octokit, config: VaultConfig) {
  const ref = await octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{ref}', {
    owner: config.repoOwner,
    repo: config.repoName,
    ref: config.repoBranch,
  });

  const commit = await octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
    owner: config.repoOwner,
    repo: config.repoName,
    commit_sha: ref.data.object.sha,
  });

  return commit.data.tree.sha;
}

async function listMarkdownPaths(octokit: Octokit, config: VaultConfig, folder?: string) {
  const treeSha = await getTreeSha(octokit, config);
  const tree = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
    owner: config.repoOwner,
    repo: config.repoName,
    tree_sha: treeSha,
    recursive: '1',
  });

  const prefix = folder ? `${assertAllowedMarkdownPath(`${folder}/placeholder.md`).replace(/\/placeholder\.md$/,'')}/` : '';

  return tree.data.tree
    .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string' && entry.path.endsWith('.md'))
    .map((entry) => entry.path as string)
    .filter((path) => !path.startsWith('.git/') && !path.startsWith('.obsidian/'))
    .filter((path) => (prefix ? path.startsWith(prefix) : true));
}

async function getFile(octokit: Octokit, config: VaultConfig, path: string): Promise<RepoFile> {
  const normalizedPath = assertAllowedMarkdownPath(path);
  const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
    owner: config.repoOwner,
    repo: config.repoName,
    path: normalizedPath,
    ref: config.repoBranch,
  });

  if (Array.isArray(response.data) || !('content' in response.data) || !response.data.content) {
    throw new Error(`Could not load note at ${normalizedPath}`);
  }

  return {
    content: fromBase64(response.data.content.replace(/\n/g, '')),
    path: normalizedPath,
    sha: response.data.sha,
  };
}

async function commitFile({
  config,
  content,
  message,
  octokit,
  path,
  sha,
}: {
  config: VaultConfig;
  content: string;
  message: string;
  octokit: Octokit;
  path: string;
  sha?: string;
}) {
  await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
    owner: config.repoOwner,
    repo: config.repoName,
    path,
    branch: config.repoBranch,
    message,
    content: toBase64(content),
    sha,
  });
}

function scorePath(path: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const lowerPath = path.toLowerCase();
  const basename = lowerPath.split('/').pop() ?? lowerPath;
  let score = 0;

  if (basename.includes(normalizedQuery)) {
    score += 10;
  }
  if (lowerPath.includes(normalizedQuery)) {
    score += 6;
  }

  for (const term of terms) {
    if (basename.includes(term)) {
      score += 4;
    }
    if (lowerPath.includes(term)) {
      score += 2;
    }
  }

  return score;
}

export async function searchNotes({
  config,
  folder,
  octokit,
  query,
}: {
  config: VaultConfig;
  folder?: string;
  octokit: Octokit;
  query: string;
}): Promise<SearchResult[]> {
  const paths = await listMarkdownPaths(octokit, config, folder);
  const ranked = paths
    .map((path) => ({ path, score: scorePath(path, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, 5);

  const results: SearchResult[] = [];
  for (const entry of ranked) {
    const file = await getFile(octokit, config, entry.path);
    results.push({
      path: file.path,
      preview: buildPreview(file.content ?? ''),
      title: extractTitle(file.content ?? '', file.path),
    });
  }

  return results;
}

export async function getNote({
  config,
  octokit,
  path,
}: {
  config: VaultConfig;
  octokit: Octokit;
  path: string;
}): Promise<NoteRecord> {
  const file = await getFile(octokit, config, path);
  return {
    content: file.content ?? '',
    path: file.path,
    title: extractTitle(file.content ?? '', file.path),
  };
}

export async function appendToNote({
  config,
  content,
  login,
  octokit,
  path,
  relatedNotes,
}: {
  config: VaultConfig;
  content: string;
  login: string;
  octokit: Octokit;
  path: string;
  relatedNotes: string[];
}) {
  const file = await getFile(octokit, config, path);
  const nextContent = appendUnderSection({
    block: buildAppendBlock({
      content,
      login,
      now: new Date(),
      relatedNotes,
    }),
    markdown: file.content ?? '',
    sectionHeading: config.appendSection,
  });

  await commitFile({
    config,
    content: nextContent,
    message: `obsidian-mcp: append to ${file.path}`,
    octokit,
    path: file.path,
    sha: file.sha,
  });

  return {
    path: file.path,
    title: extractTitle(nextContent, file.path),
  };
}

export async function createChatgptNote({
  body,
  config,
  login,
  octokit,
  relatedNotes,
  tags,
  title,
}: {
  body: string;
  config: VaultConfig;
  login: string;
  octokit: Octokit;
  relatedNotes: string[];
  tags: string[];
  title: string;
}) {
  const existingPaths = new Set(await listMarkdownPaths(octokit, config));
  const path = buildCreatePath({
    date: new Date().toISOString().slice(0, 10),
    existingPaths,
    folder: config.createFolder,
    title,
  });

  const content = buildCreatedNote({
    body,
    createdAt: new Date(),
    login,
    relatedNotes,
    tags,
    title,
  });

  await commitFile({
    config,
    content,
    message: `obsidian-mcp: create ${path}`,
    octokit,
    path,
  });

  return { path, title };
}
