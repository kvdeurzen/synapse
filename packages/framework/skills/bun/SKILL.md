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

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "Using `require()` here is fine — it works at runtime" | Bun supports `require()` for compatibility but ESM is the designed and supported module system. Mixing `require()` and `import` creates inconsistent behavior across bundling, tree-shaking, and tooling. (Bun documentation: "ESM-first is the designed module system") | Convert to `import`/`export`. If a dependency only exports CJS, wrap it in an ESM adapter. |
| "I'll use `node:fs` — it's more familiar" | `Bun.file()` is faster, returns a typed `BunFile` object, and is the idiomatic Bun API. Using `node:fs` when `Bun.file()` exists is choosing the slower, less idiomatic path without reason. (Bun benchmarks: Bun.file() is 3-4x faster than node:fs for reads) | Use `Bun.file(path).text()` or `Bun.file(path).json()` for file reads. |
| "I'll add `node-fetch` since I know its API well" | `fetch` is a global in Bun — no import or polyfill needed. Adding `node-fetch` adds a dependency, slows installs, and introduces an unnecessary abstraction layer. (Bun global APIs: fetch, WebSocket, FormData are all built-in) | Use global `fetch()` directly. No import. Same API as `node-fetch` 3.x. |
| "Using jest/vitest is fine — the project already has it configured" | `bun:test` is built into Bun, runs 20x faster than Jest for typical suites, and requires no configuration. Adding vitest/jest adds a dependency and configuration burden for no behavioral benefit. (Bun test docs: compatible with Jest's API) | Use `import { describe, test, expect } from "bun:test"` and run with `bun test`. |

## Commands

- Run file: `bun <file.ts>`
- Run tests: `bun test`
- Run specific test: `bun test <file>`
- Install deps: `bun install`
- Run script: `bun run <script>`
- Build: `bun build <entrypoint> --outdir=./dist`
- Shell command: `bun run -- <command>`
