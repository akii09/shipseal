# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Use **plan mode** for anything touching more than one file. Present the plan, wait for approval.
- Load the matching skill from `.claude/skills/` before starting a task it covers.
- Before rendering work, fetch current Takumi docs (https://takumi.kane.tw/docs). Package names have changed before.
- Do not run `pnpm test:update-golden` without explicit approval.
- Do not commit or push unless asked. Suggest a Conventional Commit message instead.
- Keep responses concise. Explain each file you change in 1 to 3 sentences.
