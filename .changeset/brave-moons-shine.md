---
"shipseal": patch
---

Correct what the documentation claims Shipseal produces. The output listing on the website was
written by hand and had drifted: it showed six files under names the CLI never writes, and
advertised square, portrait, Product Hunt and README banner sizes that no template can render.
The listing is now generated from a real pack, and tests fail if either claim stops matching the
code.
