# Obsidian MCP

Remote MCP server for safe ChatGPT-driven note capture into the `Aventerica89/Obsidian-Claude` vault repo.

## MVP behavior

- Search markdown notes in the vault repo.
- Read a note by path.
- Append structured blocks to existing notes, only under `## ChatGPT MCP`.
- Append structured footer blocks to existing notes, only under `## ChatGPT MCP Footer`.
- Create new notes only inside `ChatGPT MCP/`.
- Start scoped project sessions (`start_session`) and capture quick notes (`note` / `end_session`) into one session-log note per group.
- Auto-commit each write directly to the vault repo.

This is intentionally not a general-purpose filesystem MCP.

## Tool surface

- `search_notes`
  - Find likely markdown notes by title/path and return a short preview.
- `get_note`
  - Read an existing markdown note from the vault repo.
- `append_to_note`
  - Append a structured block to an existing note, only under `## ChatGPT MCP`.
- `append_footer_note`
  - Append a structured block to any existing note, only under `## ChatGPT MCP Footer`.
- `create_chatgpt_note`
  - Create a new reviewable note only inside `ChatGPT MCP/`.
- `list_allowed_destinations`
  - Return the current write constraints and target repo details.
- `list_session_groups`
  - List configured group → folder mappings for session commands.
- `start_session`
  - Set an active group/folder context for quick capture.
- `note`
  - Append a note to the active session log.
- `end_session`
  - Append a final summary and clear active session context.

## Write semantics

- Existing notes are never overwritten in place outside the reserved section.
- If `## ChatGPT MCP` does not exist, it is created at the end of the note.
- Every append block includes timestamp, `source: chatgpt-mcp`, `actor`, and `needs_review: true`.
- Session captures append to `ChatGPT MCP/Session Logs/<group>-session-log.md`.
- New notes are created only under `ChatGPT MCP/` with reviewable frontmatter.
- Every successful write creates a direct commit in the vault repo.

## Optional environment variables

These are optional; defaults are applied when unset.

- `CHATGPT_MCP_FOOTER_SECTION` (default: `ChatGPT MCP Footer`)
- `CHATGPT_MCP_SESSION_FOLDER_ROOT` (default: `John Notes/App Dev`)
- `CHATGPT_MCP_SESSION_LOG_FOLDER` (default: `ChatGPT MCP/Session Logs`)
- `CHATGPT_MCP_SESSION_NOTES_SECTION` (default: `Session Notes`)
- `CHATGPT_MCP_SESSION_GROUPS` JSON map of lowercase group names to folders  
  Example: `{"vaporforge":"John Notes/App Dev/VaporForge","agency-ops":"John Notes/App Dev/Agency Ops"}`

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

## GitHub Actions deploy

The repo includes [deploy.yml](/Users/jb/repos/obsidian-mcp/.github/workflows/deploy.yml), which deploys on pushes to `main` and on manual dispatch.

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

- MCP Server URL: `https://obsidian-mcp.<your-subdomain>.workers.dev/mcp`
- Authentication: OAuth

## Security boundaries

- Only the GitHub username in `ALLOWED_GITHUB_USERNAME` can authorize.
- Existing notes can only be appended under `## ChatGPT MCP`.
- Footer appends can only be written under `## ChatGPT MCP Footer`.
- New notes can only be created in `ChatGPT MCP/`.
- No overwrite, rename, move, or delete tools are exposed.
- Hidden paths, `.obsidian`, `.git`, path traversal, and non-Markdown targets are rejected.
