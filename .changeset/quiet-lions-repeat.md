---
"shipseal": patch
---

Title the code card for what it shows. A release whose snippet is only install commands now
reads "Get started" instead of repeating the release headline, which made a bug-fix release look
as though it were about installing. When the release notes contain a code block, that block is
used for the card rather than the first fence in the README, so the snippet is about what
actually changed.

Fixes a related bug: a snippet configured as `release.snippet` was silently ignored on any
project whose README contained a code block, because the configured value was consulted last.
Configured snippets now win, then release notes, then the README.
