---
"shipseal": patch
---

Better titles for monorepos, prefixed tags and prereleases.

A tag like `shadcn@4.21.0` or `bun-v1.4.2` now yields the version alone, so a card reads
"shadcn 4.21.0" rather than "ui shadcn@4.21.0". When a repository is named after a directory
rather than a project, the package in the tag is used, or the owner, so `home-assistant/core`
is called home-assistant rather than core.

The browser demo now opens on the newest stable release instead of whatever is newest overall.
Prereleases are still listed and still selectable.

Story titles may run to four lines on tall formats before they truncate. Across twenty
repositories surveyed on 2026-09-15, six produced a truncated title; none do now.
