---
name: react
description: React conventions for functional components, hooks, state management, and accessible UI. Load when building React components or reviewing UI code.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Functional components only — no class components
- Co-locate component, styles, and tests in the same directory
- One component per file; filename matches export name
- Custom hooks prefixed with `use`; extracted into separate files when reused
- Props typed with explicit interface: `interface ButtonProps { label: string; onClick: () => void }`
- Default exports for page-level components; named exports for shared components
- Keep components small: if a component exceeds ~100 lines, extract sub-components

## Quality Criteria

- No prop drilling beyond 2 levels — use context or state management
- Every list element has a stable, unique `key` prop (never use array index)
- Loading and error states always handled in async data components
- Interactive elements use semantic HTML (`<button>`, `<a>`) for keyboard/screen reader access
- No direct DOM manipulation — use refs only when unavoidable
- Derived state computed from existing state, not duplicated in separate state variables

## Vocabulary

- **controlled component**: an input whose value is driven by React state
- **lifting state**: moving state up to the nearest common ancestor of components that share it
- **compound component**: a pattern where parent and child components share implicit state via context
- **ref**: a mutable container (useRef) that does not trigger re-renders on change

## Anti-patterns

- `useEffect` for computing derived state — compute inline or use `useMemo`
- Array index as `key` — use stable unique IDs
- Direct DOM manipulation with `document.querySelector` — use refs
- Inline object/function creation in JSX that causes unnecessary re-renders
- Deeply nested conditional JSX — extract into named sub-components

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "Using array index as `key` is fine for this static list" | React uses `key` to track element identity across renders. Array index as key causes incorrect reconciliation when items are added, removed, or reordered — React reuses the wrong DOM nodes, producing stale state bugs. (React docs: "keys must be stable, predictable, and unique") | Use a stable unique ID from your data. If none exists, generate one at creation time. |
| "Class components are still supported, I'll use what I know" | Functional components with hooks are the React team's official recommendation. Class components receive no new features and will eventually be removed. The ecosystem (libraries, patterns, documentation) is entirely hooks-based. (React docs: "we recommend functional components for all new code") | Use functional components. Hooks cover every use case class components had. |
| "Prop drilling 3 levels is manageable, I'll refactor later" | "Later" never comes. Prop drilling at 3 levels means adding a new prop requires changes in 3+ files. Context or state management is the correct solution at 3 levels — the refactor becomes exponentially harder as depth grows. (React community: "the refactor that never happens") | Use React context for shared state. Extract the shared state to the nearest common ancestor. |
| "Using `useEffect` for derived state is cleaner than computing inline" | `useEffect` for derived state creates a stale-state bug by design: state is correct after one extra render cycle. Every change triggers a render with the old derived value, then a second render with the new one. (React docs: "you might not need an effect") | Compute derived state inline or use `useMemo`. Derived state should never live in `useState`. |

## Commands

- Dev server: `bun run dev` or `npx next dev` (Next.js)
- Build: `bun run build`
- Lint: `npx eslint src/`
- Type-check: `npx tsc --noEmit`
