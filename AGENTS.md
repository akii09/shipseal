# AGENTS.md

Read `docs/PROJECT_PLAN.md` Section 0 before any task. Summary of hard rules:

1. Never let an LLM produce a number shown on a card. Numbers come from Sources with provenance.
2. No headless browsers and no image-generation models in dependencies.
3. Only `src/render/takumi.ts` may import Takumi.
4. Verify Takumi, GitHub, and npm APIs against current docs before using them.
5. Never ship overflowing text without a manifest warning.
6. Ask before adding dependencies or changing public interfaces.
7. Work one file at a time: explain the plan, get approval, then build.
8. Do not reintroduce ideas listed in Section 26 of the plan.
9. Update the Decisions log (Section 25) whenever a decision changes.

## Git rules (hard)

- **Never commit and never push.** Not to `main`, not to a branch, not with `--no-verify`, not "just to save work". The owner runs every `git commit`, `git push`, `git merge`, `git rebase`, and `git tag` personally.
- When a change is ready, stop and print a suggested Conventional Commit message. Leave the working tree staged or unstaged as-is and say which files changed.
- Never run history-rewriting or destructive git commands: `reset --hard`, `checkout -- <file>`, `clean -fd`, `stash drop`, `push --force`, `branch -D`.
- Never create pull requests, releases, or tags. Never enable auto-merge.
- The one exception is an explicit, in-the-moment instruction from the owner naming the action ("commit this", "push to `main`"). Approval covers that one action only, not the next one.

## Writing rules (hard)

- **No em dashes (`—`) anywhere in this repository.** Not in code, comments, commit messages, docs, README, CLI output, error messages, tests, or default generated card copy. Use a colon, a comma, parentheses, or two sentences.
- No en dashes (`–`) as punctuation either. A hyphen in a numeric range (`10-20`) is fine.
- Plain, direct, concrete prose. No marketing voice, no hype adjectives, no exclamation marks.
- User-facing errors say what went wrong, why, and how to fix it.
- Numbers shown to users are formatted by code, never hand-written into a string.

## Engineering standard

Write the code an experienced maintainer would sign off on. Concretely:

- **Honest.** Never claim work is done, tested, or verified unless you ran it and saw it pass. Report failures with the real output. If you skipped or stubbed something, say so in the same message.
- **No silent scope changes.** Do what was asked. If you find a real problem with the ask, say it in a sentence or two, then continue and flag it.
- **TypeScript `strict`.** No `any` without a comment saying why. No `as` casts to silence the compiler. Parse external input with zod at the boundary, then trust the type inside.
- **Errors are typed and actionable.** Use `src/core/errors.ts`. Never swallow an error, never `catch {}`, never log-and-continue past a real failure.
- **Pure core, I/O at the edges.** `generate()` does no network and no disk access. Sources read, outputs write, templates are pure functions with no `Date.now()` and no randomness.
- **Small and focused.** One responsibility per module and per function. Match the naming, import order, and error handling already in the file you are editing.
- **Tests ship with the code**, including the failure path, not only the happy path. No new lint warnings, no TypeScript errors, all tests green before you suggest a commit.
- **No dead code, no placeholder comments, no `TODO` without an owner and a plan reference.** Do not leave commented-out code behind.
- **No new dependency without asking** (rule 6). State the package, size, license, and why nothing already present does the job.
- **Verify before asserting.** Check the docs or run the command. Do not answer from memory about an external API.

## Releasing (hard)

- **Never run `npm publish`.** Publishing happens only in CI, over OIDC, from `publish.yml`.
  There is no npm token in this repository and none should be added.
- **Never create a tag, a GitHub release, or a version bump by hand.** Versions come from
  Changesets. Releases come from `pnpm release`, which refuses on any bad state.
- Add a changeset (`pnpm changeset`) in the same change as anything a user would notice. A
  refactor or a test-only change needs none.
- `pnpm release:check` creates nothing, but it is not read-only: it re-renders the showcase
  images and rewrites the doc version strings so you can review that diff before releasing.
- The full flow is in `docs/RELEASING.md`. Read it before touching anything under
  `.github/workflows/`.

## Where the project actually is

`docs/STATE.md` says where the repository actually is, and carries a `Last verified` date. Read it
first: it is short, it lists the invariants that catch agents out, and it names what is open and
who can do it. `docs/PROJECT_PLAN.md` is the design and the decisions log behind it.

If the date in `STATE.md` is stale, trust the repository over both documents and say so.

This project ships first and learns from users afterwards. Do not propose validation gates or
surveys before building something the owner has asked for.

Dogfooding found 8 bugs the test suite did not. Before claiming a user-facing change works, run
the CLI against a real project, look at the image, and read the manifest.
