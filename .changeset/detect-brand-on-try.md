---
"shipseal": minor
---

The browser demo detects a repository's own colors instead of showing Shipseal's.

Until now `/try` rendered every repository in Shipseal's palette, because brand detection read
from disk and so could only run in the CLI. The detection is now split into a source agnostic
half and a disk half, and the demo supplies a GitHub backed reader. A repository that defines its
palette in Tailwind `@theme`, CSS custom properties or design tokens now renders in its own
colors, and the page says which file they came from.

Where nothing can be detected, the card still uses demo colors and says so. A repository whose
file tree is too large to fetch falls back to conventional stylesheet paths rather than failing.

Release notes are also cleaned by one shared implementation now. The CLI path stripped commit
references, pull request numbers and contributor credits; the browser path did not, so a release
body that opened with a credit line could render a card headlined with a contributor's handle.
Backslash escaped markdown is unescaped too.
