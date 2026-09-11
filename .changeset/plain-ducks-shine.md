---
"shipseal": patch
---

Detect the brand colour from a PNG logo. Previously only SVG logos were read, so projects
with a PNG logo silently got Shipseal's built-in red presented as their brand colour.

Say when a colour is a built-in default rather than something found in the project. `init`
listed a source for every other detected field, which made undetected colours look detected.
