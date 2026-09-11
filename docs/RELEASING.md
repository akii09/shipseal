# Releasing shipseal

The package publishes from CI only. There is no npm token anywhere: `.github/workflows/publish.yml`
authenticates with npm through GitHub's OIDC, and npm generates provenance attestations
automatically as a result.

## One-time setup

### 1. Configure the trusted publisher on npm

On npmjs.com, open the `shipseal` package, go to **Settings**, and add a trusted publisher with
exactly these values:

| Field | Value |
|---|---|
| Publisher | GitHub Actions |
| Organization or user | `akii09` |
| Repository | `shipseal` |
| Workflow filename | `publish.yml` |
| Environment name | `npm-publish` |

The workflow filename is the filename alone, not a path.

### 2. Create the GitHub environment

In the repository, go to **Settings > Environments** and create an environment named
`npm-publish`. Add yourself as a required reviewer.

This matters: provenance proves **where** a package was built, not that the source was
reviewed. The environment gate plus branch protection on `main` is what covers the rest.

### 3. Remove any classic npm tokens

If an `NPM_TOKEN` secret exists in the repository, delete it once the first OIDC publish
succeeds. A leaked long-lived token is the exact failure trusted publishing removes.

## Publishing a version

Version bumps and the changelog come from Changesets. Nothing is edited by hand.

**1. Add a changeset in the pull request that makes the change.**

```bash
pnpm changeset
```

Pick `patch`, `minor` or `major`, then describe the change for someone reading release notes.
That text goes into `CHANGELOG.md` verbatim. Changes with no user-visible effect need none.

**2. Merge to `main`.** `version.yml` opens or updates a "chore: version packages" pull
request that bumps `packages/shipseal/package.json`, writes `CHANGELOG.md`, and deletes the
consumed changeset files.

**3. Merge the version pull request** when you are ready to release.

**4. Run `pnpm release`.** It checks everything below and refuses if any of it is wrong, then
asks you to type the version to confirm before creating the release.

| Check | Why it blocks |
|---|---|
| On `main`, clean tree, in sync with origin | a release must be reproducible from what is pushed |
| No leftover changeset files | they would silently miss this release |
| Tag and GitHub release do not exist | never release the same version twice |
| Version is not already on npm | npm refuses to overwrite, so catch it before the tag exists |
| CI green on this exact commit | not on some earlier one |
| CHANGELOG has a section for this version | the version pull request was actually merged |
| `lint`, `typecheck`, `test`, `build` pass locally | on the code that will ship |

Use `pnpm release:check` to run all of it and change nothing.

Creating the release is still the only thing that publishes, so a mistake before this point
costs nothing.

**Or create a GitHub release by hand** whose tag matches the new version, with or without a leading
`v` (`v0.1.0` and `0.1.0` both work).

`publish.yml` then runs lint, typecheck, tests and build, checks the tag against the manifest,
and publishes over OIDC. Approve the environment gate when prompted.

### Why versioning and publishing are separate workflows

`version.yml` deliberately does not publish. npm binds the trusted publisher to a single
workflow filename, so keeping every publish in `publish.yml` means one identity to configure
and one place to audit. It also puts a human decision between "the version is prepared" and
"the version is public".

To see what would be released:

```bash
pnpm changeset:status
```

## Dry run

Run the workflow manually from the Actions tab with **dry-run** left checked. It does
everything except `npm publish`, including `npm pack --dry-run` so you can inspect the exact
file list. Use this to confirm the trusted publisher is configured before a real release.

## Verifying a published version

```bash
npm view shipseal version
```

Provenance appears on the package page on npmjs.com once a publish has run through this
workflow. A version published from a laptop has none: `0.0.1` was published manually to claim
the name and predates this setup.

## Not yet wired

Changesets (`PROJECT_PLAN.md` §7) is the intended tool for version bumps and changelog
generation. Until it is set up, step 1 above is manual.
