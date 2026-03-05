---
name: bun
description: Bun runtime conventions for file I/O, HTTP servers, testing, and ESM modules. Load when writing Bun-specific code or reviewing runtime usage.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Use `Bun.file(path)` for file reads — faster than `node:fs` `readFile`
- Use `bun:test` for all tests — `import { describe, test, expect } from "bun:test"`
- Use `Bun.serve()` for HTTP servers — built-in routing, WebSocket support, no Express needed
- ESM-only: `import`/`export`, never `require()`; set `"type": "module"` in `package.json`
- Use `bun run <script>` instead of `npm run`; `bun install` instead of `npm install`
- Bun auto-loads `.env` — no `dotenv` import needed
- Use `Bun.$\`command\`` for shell commands instead of `child_process`

## Quality Criteria

- No Node.js polyfill packages (`cross-fetch`, `node-fetch`, `form-data`) — Bun has built-ins
- Use Bun built-ins where available before reaching for npm packages
- Test files use `bun:test` imports, not `vitest` or `jest`
- No `.cjs` files — all files are ESM

## Vocabulary

- **loader**: Bun's file type handler (e.g., TypeScript loader compiles `.ts` at runtime)
- **macro**: a build-time function evaluated at bundle time with `import { fn } from "file" with { type: "macro" }`
- **bunfig**: `bunfig.toml` — Bun's configuration file for package manager, test, and build settings

## Anti-patterns

- `require()` in ESM context — causes runtime error; use `import` instead
- `import { readFile } from "node:fs/promises"` when `Bun.file()` is faster and simpler
- `npm run <script>` in documentation or scripts — use `bun run` for consistency
- Installing `node-fetch` or `cross-fetch` — `fetch` is globally available in Bun
- Using `jest` or `vitest` when `bun:test` is built-in and faster

## Commands

- Run file: `bun <file.ts>`
- Run tests: `bun test`
- Run specific test: `bun test <file>`
- Install deps: `bun install`
- Run script: `bun run <script>`
- Build: `bun build <entrypoint> --outdir=./dist`
- Shell command: `bun run -- <command>`
