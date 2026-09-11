---
name: golden-images
description: Update or debug golden image snapshot tests in test/golden/.
---

1. Never update goldens to make a failing test pass without understanding the diff.
2. Run tests, inspect the diff images, and describe what changed and why.
3. Only after owner approval: `pnpm --filter shipseal test:update-golden`.
4. Tolerance is at most 0.1% differing pixels. Do not raise it to hide regressions.
