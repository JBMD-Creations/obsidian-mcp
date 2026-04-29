# Obsidian MCP

Remote MCP server for safe ChatGPT-driven note capture into the `Aventerica89/Obsidian-Claude` vault repo.

## MVP behavior

- Search markdown notes in the vault repo.
- Read a note by path.
- Append structured blocks to existing notes, only under `## ChatGPT MCP`.
- Append structured footer blocks to existing notes, only under `## ChatGPT MCP Footer`.
- Create new notes inside `_Inbox/` (default) or any folder under the configured session root.
- Start scoped project sessions (`start_session`) and capture quick notes (`note` / `end_session`) into one session-log note per group.
- Auto-commit each write directly to the vault repo.

This is intentionally not a general-purpose filesystem MCP.

## Tool surface

- `search`
  - ChatGPT connector compatibility tool. Takes `query`, returns `{ results: [{ id, title, url }] }`. `id` is a vault-relative markdown path suitable for `fetch`.
- `fetch`
  - ChatGPT connector compatibility tool. Takes the `id` returned by `search` and returns `{ id, title, text, url, metadata }` with the full note body.
- `search_notes`
  - Find likely markdown notes by title/path and return a short preview. Supports an optional `folder` scope; intended for Claude and other clients that can pass richer arguments.
- `get_note`
  - Read an existing markdown note from the vault repo.
- `append_to_note`
  - Append a structured block to an existing note, only under `## ChatGPT MCP`.
- `append_footer_note`
  - Append a structured block to any existing note, only under `## ChatGPT MCP Footer`.
- `create_chatgpt_note`
  - Create a new reviewable note. Defaults to `_Inbox/`; pass an optional `folder` to target any folder under the configured session root.
- `list_allowed_destinations`
  - Return the current write constraints, session status, and target repo details.
- `list_session_groups`
  - List configured group → folder mappings for session commands.
- `start_session`
  - Start a durable active session for the authenticated user and return a `session_id`.
- `note`
  - Append a note to the durable active session log (supports `content` or `text`).
- `end_session`
  - Append a final summary and clear the durable active session context.

## Session capture semantics

- `start_session(group, folder_path?, title?)` starts a durable active session and returns `session_id`.
- `note(content?, text?, related_notes?, session_id?)` appends to the active session log.
- `end_session(summary?, related_notes?, session_id?)` appends a final summary and clears active session state.
- `text` is accepted as an alias for `content`.
- If `session_id` is omitted, the server uses the persisted active session for the authenticated user.
- Active session state is persisted in KV (`OAUTH_KV`) and no longer depends on in-memory Worker state.

## Write semantics

- Existing notes are never overwritten in place outside the reserved section.
- If `## ChatGPT MCP` does not exist, it is created at the end of the note.
- Every append block includes timestamp, `source: chatgpt-mcp`, `actor`, and `needs_review: true`.
- Session captures append to `_Inbox/Session Logs/<group>-session-log.md`.
- New notes are created under `_Inbox/` by default, or under any folder inside the configured session root, with reviewable frontmatter.
- Every successful write creates a direct commit in the vault repo.

## Optional environment variables

These are optional; defaults are applied when unset.

- `CHATGPT_MCP_FOOTER_SECTION` (default: `ChatGPT MCP Footer`)
- `CHATGPT_MCP_SESSION_FOLDER_ROOT` (default: `Notes`)
- `CHATGPT_MCP_SESSION_LOG_FOLDER` (default: `_Inbox/Session Logs`)
- `CHATGPT_MCP_SESSION_NOTES_SECTION` (default: `Session Notes`)
- `CHATGPT_MCP_SESSION_GROUPS` JSON map of lowercase group names to folders; defaults to `{}` (no groups preconfigured — set per deployment in `wrangler.jsonc` or as a Worker var)  
  Example: `{"projects":"Projects","notes":"Notes"}`

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

Then copy the returned namespace id into [wrangler.jsonc](./wrangler.jsonc).

## GitHub Actions deploy

The repo includes [deploy.yml](./.github/workflows/deploy.yml), which deploys on manual dispatch and on pushes of version tags (`v*`).

Set these GitHub repository secrets before enabling the workflow:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow uses `cloudflare/wrangler-action@v3.14.1` and runs:

```bash
npm ci
wrangler deploy
```

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

- MCP Server URL (preferred, SSE transport): `https://obsidian-mcp.jbmd-creations.workers.dev/sse`
- Authentication: OAuth

ChatGPT's connector ("Apps") validates that `search` and `fetch` tools exist before it will operate; this server exposes both with the OpenAI-compatible schema.

## Claude and other streamable-HTTP clients

- MCP Server URL: `https://obsidian-mcp.jbmd-creations.workers.dev/mcp`
- Authentication: OAuth

## Security boundaries

- Only the GitHub username in `ALLOWED_GITHUB_USERNAME` can authorize.
- Existing notes can only be appended under `## ChatGPT MCP`.
- Footer appends can only be written under `## ChatGPT MCP Footer`.
- New notes can only be created in `_Inbox/` or inside the configured session root (`CHATGPT_MCP_SESSION_FOLDER_ROOT`); creation always uses a unique filename, so existing notes are never overwritten.
- No overwrite, rename, move, or delete tools are exposed.
- Hidden paths, `.obsidian`, `.git`, path traversal, and non-Markdown targets are rejected.
- `fetch(id)` revalidates `id` via `assertAllowedMarkdownPath`, so ChatGPT cannot craft an id that escapes the vault.
