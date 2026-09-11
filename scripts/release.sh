#!/usr/bin/env bash
# Cut a release. Every check below refuses rather than asks, because the failure mode this
# guards against is a tired maintainer pressing enter.
#
#   pnpm release            check everything, then create the release after you confirm
#   pnpm release --check    run the checks and stop, change nothing
set -euo pipefail

REPO="akii09/shipseal"
PKG_DIR="packages/shipseal"
CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

red() { printf "\033[31m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
die() { red "BLOCKED: $1"; [[ -n "${2:-}" ]] && echo "  Fix: $2"; exit 1; }

cd "$(git rev-parse --show-toplevel)"

# 1. Right branch.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "main" ]] || die "on branch '$BRANCH', not main" "git switch main"

# 2. Nothing uncommitted. A release must be reproducible from what is pushed.
[[ -z "$(git status --porcelain)" ]] || die "working tree has uncommitted changes" "commit or stash them"

# 3. In sync with origin.
git fetch origin --tags --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
[[ "$LOCAL" == "$REMOTE" ]] || die "local main and origin/main differ" "git pull, or push what you have"

# 4. No unreleased changesets. These would silently miss the release.
PENDING="$(find .changeset -maxdepth 1 -name '*.md' ! -name 'README.md' | wc -l | tr -d ' ')"
[[ "$PENDING" == "0" ]] || die "$PENDING changeset(s) are not versioned yet" "merge the version pull request first, then re-run"

VERSION="$(node -p "require('./$PKG_DIR/package.json').version")"
TAG="v$VERSION"

# 5. Not already released.
git rev-parse "$TAG" >/dev/null 2>&1 && die "tag $TAG already exists" "bump the version with a changeset first"
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  die "release $TAG already exists on GitHub" "bump the version with a changeset first"
fi

# 6. Not already on npm. Publishing over a version is impossible, so catch it here.
PUBLISHED="$(npm view shipseal version 2>/dev/null || echo none)"
[[ "$PUBLISHED" != "$VERSION" ]] || die "$VERSION is already published to npm" "bump the version with a changeset first"

# 7. CI green on this exact commit.
CI_STATUS="$(gh run list --repo "$REPO" --commit "$LOCAL" --workflow CI --limit 1 --json conclusion --jq '.[0].conclusion // "missing"')"
[[ "$CI_STATUS" == "success" ]] || die "CI on this commit is '$CI_STATUS', not success" "wait for CI, or push a fix"

# 8. The changelog actually describes this version.
grep -q "^## $VERSION$" "$PKG_DIR/CHANGELOG.md" || die "CHANGELOG.md has no section for $VERSION" "merge the version pull request first"

# 9. The gates, locally, on the code that will ship.
echo "Running lint, typecheck, tests and build..."
pnpm lint >/dev/null && pnpm typecheck >/dev/null && pnpm test >/dev/null && pnpm build >/dev/null \
  || die "local checks failed" "run pnpm lint, pnpm typecheck, pnpm test and see what breaks"

# 10. The images Shipseal shows of itself must match the release being cut.
echo "Refreshing showcase images..."
set +e
node scripts/refresh-showcase.mjs
SHOWCASE=$?
set -e
if [[ "$SHOWCASE" == "2" ]]; then
  red "BLOCKED: showcase images changed"
  echo "  Fix: review the diff, commit and push it, then run pnpm release again."
  exit 1
elif [[ "$SHOWCASE" != "0" ]]; then
  die "could not refresh showcase images" "run node scripts/refresh-showcase.mjs and see what breaks"
fi

green "All checks passed."
echo
echo "  version    $VERSION  (npm currently has $PUBLISHED)"
echo "  tag        $TAG"
echo "  commit     ${LOCAL:0:7}"
echo
echo "Release notes:"
sed -n "/^## $VERSION$/,/^## /p" "$PKG_DIR/CHANGELOG.md" | sed '$d' | tail -n +2 | sed 's/^/  /'

if [[ "$CHECK_ONLY" == "1" ]]; then
  echo
  green "Check only, nothing was created."
  exit 0
fi

echo
read -r -p "Create release $TAG and publish to npm? Type the version to confirm: " CONFIRM
[[ "$CONFIRM" == "$VERSION" ]] || die "confirmation did not match, nothing was created"

sed -n "/^## $VERSION$/,/^## /p" "$PKG_DIR/CHANGELOG.md" | sed '$d' | tail -n +2 > /tmp/shipseal-notes.md
gh release create "$TAG" --repo "$REPO" --target main --title "$TAG" --notes-file /tmp/shipseal-notes.md

green "Created $TAG."
echo "The publish workflow is now waiting for your approval:"
echo "  https://github.com/$REPO/actions/workflows/publish.yml"
echo "Approve it there, or run: gh run list --repo $REPO --workflow Publish"
