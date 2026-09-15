---
"shipseal": patch
---

Emoji no longer render as an empty box on a card.

No font Shipseal registers carries emoji glyphs, so a project described as
"🌐 Human-friendly and powerful HTTP request library for Node.js" put a missing-glyph box on the
card. Emoji are now removed from card text, in the shared line cleaner and at the three tagline
sources that bypassed it, so this applies to a `package.json` description and a README tagline as
well as to GitHub data. Trademark, copyright and registered marks are kept, because they belong in
real product names.

A story cover now uses the tagline from `brand.json` when the project has no tagline of its own.
It previously printed "Release notes" even when the brand file described the project.
