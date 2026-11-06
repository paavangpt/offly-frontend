# Implementation Patterns

## React
- Keep components focused and data-driven.
- Use CSS variables for theme tokens.
- Prefer CSS transitions and keyframes; keep motion brief and respect reduced-motion settings.
- Use `aria-live` for status, proper labels, and meaningful alt text.

## Layout and spacing
- Use CSS Grid for macro layout and Flexbox for inline clusters.
- Mix asymmetry while preserving readability.
- Use a 4/8 spacing scale and constrain prose width.
- Collapse grids below 900px and keep tap targets at least 44px.

## Color, texture, and backgrounds
- Define palette variables and keep the accent count low.
- Layer subtle gradients or repeating patterns to add depth.
- Use deliberate borders and restrained shadows.

## Motion
- Use short page-load reveals and hover transitions.
- Guard animations with `prefers-reduced-motion: reduce`.
- Keep focus and active states clear without hover.

## QA
- Check AA text contrast, focus order, semantic landmarks, labels, and one `h1`.
- Ensure asset and font fallbacks are declared.
- Avoid fixed heights that break on small screens.
