Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## Monorepo Structure

This is a Bun workspace monorepo with two packages:

- `packages/server/` — Synapse MCP server (data layer: LanceDB, embeddings, document/code indexing)
- `packages/framework/` — Synapse Framework (agentic layer: agents, skills, hooks, workflows, config)

## Testing

- Run all tests: `bun run test`
- Server tests only: `bun run test:server` (or `bun test --cwd packages/server`)
- Framework tests only: `bun run test:framework` (or `bun test --cwd packages/framework`)

## Key Paths

- Agents: `packages/framework/agents/`
- Skills: `packages/framework/skills/`
- Hooks: `packages/framework/hooks/`
- Config: `packages/framework/config/`
- Server source: `packages/server/src/`
- Server tools: `packages/server/src/tools/`
