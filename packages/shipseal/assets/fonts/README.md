# Bundled fonts

## GeistMono[wght].ttf

Geist Mono, variable weight axis, upstream `vercel/geist-font` release `v1.7.2`.
Licensed under the SIL Open Font License 1.1. The full license text is in `OFL.txt`
and must stay next to the font file in any redistribution.

Takumi bundles Geist (sans) at weights 300 to 800 but **not** Geist Mono, verified in
spike S4 (`docs/spikes/2026-09-11-takumi-s1-s2-s4.md`). The code card and the
`brand.fonts.mono` default both need a mono face, so Shipseal ships one.

One variable file covers every weight: rendering weights 300 through 900 produced
seven distinct outputs, so there is no reason to ship static instances.

To upgrade, take the file from a tagged upstream release, update the version above,
and re-run the golden image tests.
