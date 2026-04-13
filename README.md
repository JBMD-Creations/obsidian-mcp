# Obsidian MCP

Remote MCP server for safe ChatGPT-driven note capture into the `Aventerica89/Obsidian-Claude` vault repo.

## MVP behavior

- Search markdown notes in the vault repo.
- Read a note by path.
- Append structured blocks to existing notes, only under `## ChatGPT MCP`.
- Create new notes only inside `ChatGPT MCP/`.
- Auto-commit each write directly to the vault repo.

This is intentionally not a general-purpose filesystem MCP.

## Tool surface

- `search_notes`
  - Find likely markdown notes by title/path and return a short preview.
- `get_note`
  - Read an existing markdown note from the vault repo.
- `append_to_note`
  - Append a structured block to an existing note, only under `## ChatGPT MCP`.
- `create_chatgpt_note`
  - Create a new reviewable note only inside `ChatGPT MCP/`.
- `list_allowed_destinations`
  - Return the current write constraints and target repo details.

## Write semantics

- Existing notes are never overwritten in place outside the reserved section.
- If `## ChatGPT MCP` does not exist, it is created at the end of the note.
- Every append block includes timestamp, `source: chatgpt-mcp`, `actor`, and `needs_review: true`.
- New notes are created only under `ChatGPT MCP/` with reviewable frontmatter.
- Every successful write creates a direct commit in the vault repo.

## Required secrets

Set these Worker secrets before deploy:

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY
```

Create a KV namespace and update `wrangler.jsonc`:

```bash
wrangler kv namespace create "OAUTH_KV"
```

Then copy the returned namespace id into [wrangler.jsonc](</Users/jb/repos/obsidian-mcp/wrangler.jsonc>).

## GitHub OAuth app

Create a GitHub OAuth App with:

- Homepage URL: `https://obsidian-mcp.<your-subdomain>.workers.dev`
- Authorization callback URL: `https://obsidian-mcp.<your-subdomain>.workers.dev/callback`

The app must allow the `repo` and `read:user` scopes because the authenticated user's token is used to read and write the private vault repo.

This Worker also checks the authenticated GitHub login against `ALLOWED_GITHUB_USERNAME`, so even a valid OAuth login is rejected unless it matches the configured account.

## Local development

Create `.dev.vars` with:

```bash
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
COOKIE_ENCRYPTION_KEY=...
```

Run:

```bash
npm install
npm run cf-typegen
npm run dev
```

Run verification locally:

```bash
npm run type-check
npm test
```

## ChatGPT connection

After deploy, register the remote MCP endpoint in ChatGPT using:

- MCP Server URL: `https://obsidian-mcp.<your-subdomain>.workers.dev/mcp`
- Authentication: OAuth

## Security boundaries

- Only the GitHub username in `ALLOWED_GITHUB_USERNAME` can authorize.
- Existing notes can only be appended under `## ChatGPT MCP`.
- New notes can only be created in `ChatGPT MCP/`.
- No overwrite, rename, move, or delete tools are exposed.
- Hidden paths, `.obsidian`, `.git`, path traversal, and non-Markdown targets are rejected.
