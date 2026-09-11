---
name: takumi-renderer
description: Work on rendering or text measurement. Use for src/render/ and src/fit/.
---

1. Fetch current Takumi docs first. Confirm package name, render API, JSX input, font loading, output formats.
2. All Takumi imports stay in `src/render/takumi.ts`, behind `RendererAdapter` (plan §16).
3. Load fonts once per process; reuse the context. Pass logos as buffers, never fetch during render.
4. Measurement must use the same font files as rendering.
5. After any Takumi version change: run golden tests and report pixel diffs before accepting.
6. Record API findings in plan §25.
