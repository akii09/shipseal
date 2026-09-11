# shipseal

## 0.0.2

### Patch Changes

- 1da9290: Fix brand detection reading the wrong values out of a README. A `#` comment inside a code
  fence was read as the project name, and fenced YAML was read as the tagline. Both surfaced on
  Shipseal's own README, which opens with a centred logo and contains a workflow example.
  
  Ignore the name of a private `package.json`, since a workspace root is plumbing rather than a
  brand. Look for logos in `assets/brand/` and `public/brand/`, and accept `icon.png` and
  `icon.svg` as fallbacks.
- 9406988: Detect the brand colour from a PNG logo. Previously only SVG logos were read, so projects
  with a PNG logo silently got Shipseal's built-in red presented as their brand colour.
  
  Say when a colour is a built-in default rather than something found in the project. `init`
  listed a source for every other detected field, which made undetected colours look detected.
- 3ee87ee: Fix `bench` and `milestone` failing on any project that has a version in `package.json` but no
  git tag. Partial release facts are no longer treated as an error, since neither command needs
  release facts.
  
  Read npm's shorthand `repository` forms (`github:owner/repo` and `owner/repo`), so `milestone`
  can fetch stars for projects that use them. Previously only full `github.com` URLs worked.
