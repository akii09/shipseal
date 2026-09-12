# Contributing

1. Read `AGENTS.md` (rules) and `docs/PROJECT_PLAN.md` (spec). Section 0 of the plan is binding.
2. `pnpm install`, then `pnpm lint && pnpm typecheck && pnpm test`.
3. Open an issue before large changes. Scope is intentionally narrow (PROJECT_PLAN §4), and
   §26 lists ideas that were researched and rejected.
4. Conventional Commits. No em dashes anywhere in this repository.
5. New modules need tests, including the failure path. Template changes need golden image
   updates (`pnpm test:update-golden`) and owner review of the rendered image.
6. Run `pnpm changeset` in the same pull request as any change a user would notice. Refactors
   and test-only changes need none.
7. Do not bump versions, create tags, or publish. `docs/RELEASING.md` covers how that works.

Security issues go through the Security tab, not a public issue. See `SECURITY.md`.

Behavior in issues, pull requests, and review is covered by `CODE_OF_CONDUCT.md`.
