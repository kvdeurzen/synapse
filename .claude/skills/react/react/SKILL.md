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

## Commands

- Dev server: `bun run dev` or `npx next dev` (Next.js)
- Build: `bun run build`
- Lint: `npx eslint src/`
- Type-check: `npx tsc --noEmit`
