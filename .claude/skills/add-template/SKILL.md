---
name: add-template
description: Create or modify a Shipseal card template. Use for any change in src/templates/.
---

1. Read `docs/PROJECT_PLAN.md` §14 and §15, and `src/templates/contract.ts`.
2. Define `propsSchema` (zod) and `slots` (maxLines, min/max font size, box width) first.
3. `buildProps(facts, copy, brand)`: take numbers only from Facts. Never hardcode or estimate values.
4. `render(props, ctx)`: pure JSX. Switch layout per `ctx.format`; do not just scale. Support dark and light.
5. Use only CSS Takumi supports (check its docs). Keep text 64px inside edges on landscape formats.
6. Missing fact: hide the element and record it in `manifest.missing`.
7. Register in `registry.ts`, add fixture-based golden tests for every format and theme.
8. Ask the owner to review the rendered PNGs before marking done.
