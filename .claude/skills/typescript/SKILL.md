---
name: typescript
description: TypeScript conventions for type safety, schema validation, and idiomatic patterns. Load when writing or reviewing TypeScript code.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Use `type` for unions and intersections; use `interface` for object shapes that may be extended
- Prefer `const` over `let`; never use `var`
- Explicit return types on all exported functions: `function foo(): string {}`
- Use Zod for runtime validation of external data (API responses, config files, user input)
- Use `satisfies` operator to validate literals without widening: `const config = { ... } satisfies Config`
- Prefer named exports over default exports
- Use `readonly` arrays and properties when mutation is not intended: `readonly string[]`
- Discriminated unions for state modeling: `type State = { status: "loading" } | { status: "done"; data: T }`

## Quality Criteria

- Zero `any` types in production code — use `unknown` and narrow explicitly
- All `Promise<T>` types explicit (no implicit `Promise<any>`)
- Discriminated unions preferred over boolean flags for mutually exclusive states
- External data validated with Zod before use — never trust raw `JSON.parse()` output
- `satisfies` used for config literals to catch shape errors at compile time
- No type assertions (`as X`) except where narrowing is provably safe

## Vocabulary

- **discriminated union**: a union where each member has a common literal field (e.g., `status`) for safe narrowing
- **narrowing**: using control flow to refine a broad type to a specific type
- **schema**: a Zod object describing the expected shape and validation rules of data
- **satisfies**: TypeScript operator that validates a value matches a type without widening the inferred type

## Anti-patterns

- `as any` — use `unknown` + assertion guards instead
- Non-null assertion `!` without a comment explaining why it is safe
- Implicit `any` from untyped parameters or missing return types
- `JSON.parse(raw)` without Zod validation — always validate external data
- Using `interface` for union types — use `type` instead
- Mutable arrays where readonly would suffice

## Commands

- Type-check: `npx tsc --noEmit`
- Lint: `npx eslint .` or `bunx biome check .`
- Format: `npx prettier --write .` or `bunx biome format --write .`
