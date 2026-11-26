<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Workspace storage

- Keep project outputs, archives, backups, and generated files inside `D:\my-ecommerce-project` on drive D.
- Route temporary files and npm's cache to `D:\my-ecommerce-project\tmp` on drive D. Use `scripts/run-with-d-temp.ps1` for shell commands that may create temporary files.
- Do not place project artifacts in the user profile or system temp folders on drive C.
