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

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "Using `@apply` is cleaner than repeating utility classes" | `@apply` recreates the CSS specificity and cascade complexity that Tailwind eliminates. It creates CSS that is harder to override, debug, and prune. The Tailwind team explicitly recommends against `@apply` for anything other than integrating third-party styles. (Tailwind docs: "if you feel the urge to use @apply, extract a component instead") | Extract a React/HTML component that encapsulates the utility pattern. Components compose; CSS classes fight. |
| "Arbitrary values like `w-[347px]` are fine for one-off cases" | Arbitrary values create design inconsistency and bypass the spacing scale that makes designs coherent. Every arbitrary value is a deviation that requires manual design review. (Tailwind docs: "the spacing scale exists to create visual rhythm") | Use the nearest scale value. If the design requires a specific value frequently, add it to the theme. |
| "I'll handle dark mode later, once the light mode is done" | Adding dark mode after the fact requires touching every component. Dark mode variants are one extra class per color or background — the marginal cost is near zero when adding them alongside the light variant. (Tailwind community: "dark mode must be added alongside, not after") | Add `dark:` variants when you add the light mode classes. The habit is cheap; the retrofit is not. |
| "Inline `style={}` is fine alongside Tailwind for this one thing" | Mixing inline styles with Tailwind creates two sources of truth for the element's appearance. The cascade interaction is unpredictable, and the element is now harder to reason about. (Tailwind core principles: "choose one styling approach per element") | Use an arbitrary value in Tailwind if no utility exists. Keep styling in one place. |

## Commands

- Build CSS: `bunx @tailwindcss/cli -i input.css -o output.css`
- Watch mode: `bunx @tailwindcss/cli -i input.css -o output.css --watch`
- Minified build: `bunx @tailwindcss/cli -i input.css -o output.css --minify`
- PostCSS integration: configure in `postcss.config.js` with `@tailwindcss/postcss`
- Upgrade v3 to v4: `bunx @tailwindcss/upgrade` (migration tool)
- Check bundle size: inspect output.css file size; target < 20KB for production builds
