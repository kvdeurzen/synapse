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
- Tailwind v4: CSS-first configuration with `@theme` block in CSS file — replaces most of `tailwind.config.js`
- Tailwind v4: CSS custom properties as theme tokens — `--color-brand: oklch(...)` defines `bg-brand`
- Tailwind v4: `bg-linear-to-*` replaces `bg-gradient-to-*` — use new gradient syntax in v4 projects
- Prefix `group-` and `peer-` to style children or siblings based on parent/sibling state

## Quality Criteria

- No arbitrary values `[px]` when a Tailwind utility exists for the purpose
- Consistent spacing scale across components — use the same scale tokens
- Accessible color contrast — verify with Tailwind's built-in contrast ratios for text/bg pairs
- No `!important` modifiers unless overriding a third-party library with no other option
- Class lists readable at a glance — break long class strings across lines in JSX
- No duplicate style declarations: a class list and an inline `style={}` prop on the same element
- Components extracted before class lists exceed 8-10 utility classes on a single element
- Dark mode variants tested on every component that uses color or background utilities

## Vocabulary

- **utility class**: a single-purpose CSS class (e.g., `flex`, `text-lg`, `bg-blue-500`)
- **variant**: a conditional prefix that applies a utility (e.g., `hover:`, `focus:`, `dark:`, `sm:`)
- **layer**: a CSS cascade layer (`base`, `components`, `utilities`) for controlling specificity
- **component extraction**: creating a named React/HTML component to encapsulate repeated utility patterns
- **@theme**: CSS-first configuration block in Tailwind v4 that replaces most of `tailwind.config.js`
- **purging/content scanning**: Tailwind scans source files to include only used utilities in the final CSS output
- **JIT**: Just-in-Time compiler (standard since v3) — generates CSS on demand for instant builds

## Anti-patterns

- Inline styles alongside Tailwind classes — choose one approach per element
- `@apply` overuse — creates CSS bloat and defeats the purpose of utilities; prefer component extraction
- `!important` via `!` prefix except to override third-party styles
- Custom CSS for spacing/color when Tailwind tokens exist
- Skipping responsive prefixes and using fixed pixel widths — use `sm:`, `md:` breakpoints
- `bg-gradient-to-*` in Tailwind v4 projects — use `bg-linear-to-*` instead
- Hardcoding arbitrary color values when `@theme` tokens would create a consistent palette
- Using `text-[#2563eb]` arbitrary values when a `text-blue-600` utility class exists

## Commands

- Build CSS: `bunx @tailwindcss/cli -i input.css -o output.css`
- Watch mode: `bunx @tailwindcss/cli -i input.css -o output.css --watch`
- Minified build: `bunx @tailwindcss/cli -i input.css -o output.css --minify`
- PostCSS integration: configure in `postcss.config.js` with `@tailwindcss/postcss`
- Upgrade v3 to v4: `bunx @tailwindcss/upgrade` (migration tool)
- Check bundle size: inspect output.css file size; target < 20KB for production builds
