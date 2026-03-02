---
name: tailwind
description: Tailwind CSS conventions for utility-first styling, responsive design, and component extraction. Load when writing or reviewing Tailwind CSS classes.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Utility-first: compose styles from utility classes rather than writing custom CSS
- Responsive prefixes in order: `sm:` then `md:` then `lg:` then `xl:` — mobile-first base styles
- Dark mode with `dark:` prefix: `bg-white dark:bg-gray-900`
- Extract components when utility class lists repeat in 3+ places — use React component, not `@apply`
- Group related utilities: layout → spacing → typography → color → effects
- Use Tailwind's spacing scale (4, 8, 12, 16...) — avoid one-off values like `p-3` mixed with `p-4`

## Quality Criteria

- No arbitrary values `[px]` when a Tailwind utility exists for the purpose
- Consistent spacing scale across components — use the same scale tokens
- Accessible color contrast — verify with Tailwind's built-in contrast ratios for text/bg pairs
- No `!important` modifiers unless overriding a third-party library with no other option
- Class lists readable at a glance — break long class strings across lines in JSX

## Vocabulary

- **utility class**: a single-purpose CSS class (e.g., `flex`, `text-lg`, `bg-blue-500`)
- **variant**: a conditional prefix that applies a utility (e.g., `hover:`, `focus:`, `dark:`, `sm:`)
- **layer**: a CSS cascade layer (`base`, `components`, `utilities`) for controlling specificity
- **component extraction**: creating a named React/HTML component to encapsulate repeated utility patterns

## Anti-patterns

- Inline styles alongside Tailwind classes — choose one approach per element
- `@apply` overuse — creates CSS bloat and defeats the purpose of utilities; prefer component extraction
- `!important` via `!` prefix except to override third-party styles
- Custom CSS for spacing/color when Tailwind tokens exist
- Skipping responsive prefixes and using fixed pixel widths — use `sm:`, `md:` breakpoints
