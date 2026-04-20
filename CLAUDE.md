# Working in this repo

## Git workflow

- **Never push directly to `main`.** `main` is branch-protected and is the deploy source for the Cloudflare Worker.
- Always develop on a feature branch (e.g. `claude/<short-slug>` or `fix/<short-slug>`).
- Open a pull request against `main` for every change, even tiny ones.
- Only enable auto-merge after the user explicitly approves the PR.
- Rely on the existing CI (type-check, tests, CodeQL, Workers Builds) as the gate — do not bypass checks or force-push.

## Verification before PR

- `npm run type-check`
- `npm test`

Run both locally before pushing; CI will re-run them on the PR.

## Commit style

- Prefix commits with `fix:`, `feat:`, `chore:`, `docs:`, `ci:`, `test:`, or `refactor:` to match the existing history.
- Short subject, explain *why* in the body when it isn't obvious from the diff.
