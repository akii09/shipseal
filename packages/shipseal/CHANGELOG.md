# shipseal

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
