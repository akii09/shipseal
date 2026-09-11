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

1. Bump the version in `packages/shipseal/package.json`.
2. Merge to `main`.
3. Create a GitHub release whose tag matches the version, with or without a leading `v`
   (`v0.1.0` and `0.1.0` both work).
4. The workflow runs lint, typecheck, tests and build, checks the tag against the manifest,
   then publishes. Approve the environment gate when prompted.

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
