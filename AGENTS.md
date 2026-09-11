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