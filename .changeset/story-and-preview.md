---
"shipseal": minor
---

Add `shipseal story` and `shipseal preview`.

`shipseal story` renders a release as an ordered set of pages rather than one card: a cover, one
page per change, a code page when the release notes contain a snippet, an optional before and
after page from screenshots you supply, and a closing page. It writes PNGs, a PDF carousel and a
ZIP containing the brand file, the config and the manifest. The closing page links your release
notes instead of printing an install command, since the command depends on your package manager
and the release may be breaking. Set `release.story.upgrade` to supply real instructions, which
are rendered verbatim.

`shipseal preview` starts a local server on 127.0.0.1 so you can try styles, themes, accents,
formats and headlines against your real release, then save the choices back to
`.shipseal/brand.json` and `.shipseal/config.json`. Nothing leaves the machine, and preview-only
sizes are not written into your release formats.

Brand `style` now accepts `editorial` and `terminal` alongside `minimal`. Existing brand files are
unaffected: `minimal` is still the default and still renders exactly as before.

Fixes found while dogfooding this: changelog entries no longer render their first sentence twice
on a story page, inline code in a changelog entry no longer reaches a card as literal backticks,
and monospace text on a story page is now sized to its widest line so it cannot run off the edge.
