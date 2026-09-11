---
"shipseal": patch
---

Read theme colours from the stylesheets real projects actually write. Detection previously
found nothing in several common shapes and silently fell back to built-in defaults:

- The last declaration before `}` was dropped when it had no trailing semicolon, which is most
  stylesheets.
- shadcn writes `--background: 0 0% 100%` and applies it as `hsl(var(--background))`. Bare HSL
  and RGB channel lists are now understood.
- `var(--brand-500)` indirection is now followed within the same file.
- Tokens on `html`, `.light`, and `[data-theme]` blocks are now read, not only `:root`.
