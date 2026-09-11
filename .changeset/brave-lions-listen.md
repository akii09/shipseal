---
"shipseal": patch
---

Fix brand detection reading the wrong values out of a README. A `#` comment inside a code
fence was read as the project name, and fenced YAML was read as the tagline. Both surfaced on
Shipseal's own README, which opens with a centred logo and contains a workflow example.

Ignore the name of a private `package.json`, since a workspace root is plumbing rather than a
brand. Look for logos in `assets/brand/` and `public/brand/`, and accept `icon.png` and
`icon.svg` as fallbacks.
