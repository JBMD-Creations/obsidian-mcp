# Obsidian MCP

Remote MCP server for safe ChatGPT-driven note capture into the `Aventerica89/Obsidian-Claude` vault repo.

## MVP behavior

- Search markdown notes in the vault repo.
- Read a note by path.
- Append structured blocks to existing notes, only under `## ChatGPT MCP`.
- Create new notes only inside `ChatGPT MCP/`.
- Auto-commit each write directly to the vault repo.

This is intentionally not a general-purpose filesystem MCP.

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

## GitHub OAuth app

Create a GitHub OAuth App with:

- Homepage URL: `https://obsidian-mcp.<your-subdomain>.workers.dev`
- Authorization callback URL: `https://obsidian-mcp.<your-subdomain>.workers.dev/callback`

The app must allow the `repo` and `read:user` scopes because the authenticated user's token is used to read and write the private vault repo.

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

## ChatGPT connection

After deploy, register the remote MCP endpoint in ChatGPT using:

- MCP Server URL: `https://obsidian-mcp.<your-subdomain>.workers.dev/mcp`
- Authentication: OAuth

## Security boundaries

- Only the GitHub username in `ALLOWED_GITHUB_USERNAME` can authorize.
- Existing notes can only be appended under `## ChatGPT MCP`.
- New notes can only be created in `ChatGPT MCP/`.
- No overwrite, rename, move, or delete tools are exposed.
