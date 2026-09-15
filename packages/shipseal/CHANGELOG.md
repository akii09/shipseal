# shipseal

## 0.4.0

### Minor Changes

- a268424: Repositories that tag without publishing releases now work, and the seal regains its commit count.
  
  A project that ships git tags and no GitHub Releases used to be rejected outright. The newest
  version tags are used instead, ordered by version rather than by whatever order GitHub returns.
  Snapshot tags that are not versions are ignored, so a 2011 weekly build cannot be mistaken for the
  current release. A release built from a tag carries no notes, and the manifest says so.
  
  The commit count is back on cards built from a public repository. It comes from comparing the
  release against the previous one, which stays inside the same package in a monorepo and against
  the previous stable release rather than against its own beta.
  
  Prerelease detection understands the spellings projects use, including `v3.15.0a8` and
  `v3.15.0rc2`, so the demo opens on a stable release.

## 0.3.0

### Minor Changes

- bcab179: The browser demo detects a repository's own colors instead of showing Shipseal's.
  
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

### Patch Changes

- d64a335: Better titles for monorepos, prefixed tags and prereleases.
  
  A tag like `shadcn@4.21.0` or `bun-v1.4.2` now yields the version alone, so a card reads
  "shadcn 4.21.0" rather than "ui shadcn@4.21.0". When a repository is named after a directory
  rather than a project, the package in the tag is used, or the owner, so `home-assistant/core`
  is called home-assistant rather than core.
  
  The browser demo now opens on the newest stable release instead of whatever is newest overall.
  Prereleases are still listed and still selectable.
  
  Story titles may run to four lines on tall formats before they truncate. Across twenty
  repositories surveyed on 2026-09-15, six produced a truncated title; none do now.

## 0.2.0

### Minor Changes

- ce35864: Milestone cards start at 10 stars instead of 100.
  
  The default star ladder began at 100, so a new project saw no milestone card for months, which is
  exactly the period when it is deciding whether a tool is worth keeping. The ladder is now
  10, 50, 100, 250, 500, 1000, 2500, 5000, 10000.
  
  This only changes the default. A project that already set `milestones.stars` in its config keeps
  whatever it chose.

## 0.1.1

### Patch Changes

- Story pages are composed rather than stacked.
  
  The title and body are now one block, centred in the space the header and footer leave. A short
  cover or closing page used to put its content in the top third of a 1080x1350 canvas and leave the
  rest empty. The body also lines up with the title now, instead of sitting slightly inside it, and a
  code page sizes its box to the snippet rather than to the full height of the card.
  
  A long title truncates and reports a fit warning instead of shrinking. Each slot was sized on its
  own, so a long title could end up smaller than the paragraph beneath it and read as the less
  important of the two.
- c6ed002: Emoji no longer render as an empty box on a card.
  
  No font Shipseal registers carries emoji glyphs, so a project described as
  "🌐 Human-friendly and powerful HTTP request library for Node.js" put a missing-glyph box on the
  card. Emoji are now removed from card text, in the shared line cleaner and at the three tagline
  sources that bypassed it, so this applies to a `package.json` description and a README tagline as
  well as to GitHub data. Trademark, copyright and registered marks are kept, because they belong in
  real product names.
  
  A story cover now uses the tagline from `brand.json` when the project has no tagline of its own.
  It previously printed "Release notes" even when the brand file described the project.

## 0.1.0

### Minor Changes

- 1964242: Add `shipseal story` and `shipseal preview`.
  
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

## 0.0.8

### Patch Changes

- 6d1ee89: Correct what the documentation claims Shipseal produces. The output listing on the website was
  written by hand and had drifted: it showed six files under names the CLI never writes, and
  advertised square, portrait, Product Hunt and README banner sizes that no template can render.
  The listing is now generated from a real pack, and tests fail if either claim stops matching the
  code.
- 6d1ee89: Find the published package in a workspace. On a monorepo whose root package is private, the call
  to action fell back to the repository URL even when the repo publishes to npm, because nothing
  looked in `packages` or `apps`. Shipseal now uses the single publishable package it finds there,
  and checks the registry knows the name before putting an install command on a card. When more
  than one package is publishable the choice would be a guess, so pass `--package` to settle it.
  
  Prefer what a project declares over what is derived from its checkout. A `homepage` or
  `repository` in package.json now wins over the origin remote, which may point at a fork, a mirror
  or an SSH alias.
- 6d1ee89: Title the code card for what it shows. A release whose snippet is only install commands now
  reads "Get started" instead of repeating the release headline, which made a bug-fix release look
  as though it were about installing. When the release notes contain a code block, that block is
  used for the card rather than the first fence in the README, so the snippet is about what
  actually changed.
  
  Fixes a related bug: a snippet configured as `release.snippet` was silently ignored on any
  project whose README contained a code block, because the configured value was consulted last.
  Configured snippets now win, then release notes, then the README.

## 0.0.7

### Patch Changes

- f8e84ce: Point the workflow in the README at a tag that exists. The npm page told everyone to pin the
  action to a `v1` tag that was never created, so every workflow copied from it failed with
  "unable to resolve action" before a single step ran. The reference now names the released
  version, and CI fails when a documented reference does not resolve.

## 0.0.6

### Patch Changes

- a011b44: Never put a truncated headline on a card. Taking the first sentence of a changelog entry was
  not enough on its own: a single long sentence still overflowed, and one release shipped a hero
  card cut off mid-phrase. Shipseal now picks the first entry whose opening sentence fits, and
  titles the card with the project name and version when nothing is short enough.
- 17e0a06: Fill the highlights card when a release has only one or two entries. The list now grows to the
  available height and centres itself, instead of leaving most of the card empty, which read as a
  broken render rather than a small release.
- a011b44: Do not use a private workspace root's name as the project name. It reached a real hero card as
  "shipseal-monorepo 0.0.5". The directory name is used instead, and a README heading or the git
  remote still wins when either has something better.

## 0.0.5

### Patch Changes

- 6294f62: Write one sentence per highlight instead of a whole changelog paragraph, so entries fit the
  card rather than truncating mid-word. Breaking changes now lead the list.
  
  Fold an indented sub-bullet into the entry above it. Changesets writes sub-lists inside a
  single entry, and treating those as separate highlights put a sentence fragment on a card with
  no context.

## 0.0.4

### Patch Changes

- d0db8e4: Swallow the space before a replaced em dash, so a tagline reading "shops — mobile PWA" becomes
  "shops: mobile PWA" rather than "shops : mobile PWA". A spaced en dash becomes a comma for the
  same reason.

## 0.0.3

### Patch Changes

- e0995ba: Render the sample card in `init` from the brand it just detected. It was a fixed card showing
  Shipseal's own name and tagline in every project, which made the tool look like it had ignored
  the repository it ran in.
- 81a19d9: Never present a private package as an npm package. A workspace root's name leaked into the
  call to action, so a real release card read `npm i shipseal-monorepo`, a package that does not
  exist. Projects with a private root now fall back to the repository URL.
- 955f01c: Read theme colours from the stylesheets real projects actually write. Detection previously
  found nothing in several common shapes and silently fell back to built-in defaults:
  
  - The last declaration before `}` was dropped when it had no trailing semicolon, which is most
    stylesheets.
  - shadcn writes `--background: 0 0% 100%` and applies it as `hsl(var(--background))`. Bare HSL
    and RGB channel lists are now understood.
  - `var(--brand-500)` indirection is now followed within the same file.
  - Tokens on `html`, `.light`, and `[data-theme]` blocks are now read, not only `:root`.
- a2011c8: Write headlines from changelog entries instead of raw commit subjects. A release whose
  changelog holds only patch entries fell through to a git commit message, because the headline
  rule looked at features alone. It now prefers a breaking change, then a feature, then a fix,
  and takes only the first sentence, since changeset entries are prose paragraphs rather than
  headlines.
  
  Find a changelog inside `packages/*` and `apps/*` when the repository root has none, which is
  where Changesets writes it in a monorepo.
  
  Read the repository from `git remote get-url origin`. A monorepo root often has no `homepage`
  or `repository` in its private package.json, which left the call to action showing the
  workspace name.

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
