import { defineConfig } from "tsdown";

// Build config for the published `shipseal` CLI.
// Spec: docs/PROJECT_PLAN.md 25 (build tool decision).
//
// `src/cli.ts` is the only entry: package.json exposes `bin` and nothing else,
// so there is no library surface and no .d.ts to emit.
export default defineConfig({
  entry: "src/cli.ts",
  outDir: "dist",
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  // Native Takumi binaries and Shiki language data must resolve from node_modules.
  deps: {
    neverBundle: [/^takumi-js/, /^@takumi-rs\//, /^shiki/, /^@shikijs\//],
  },
  // package.json declares "type": "module", so .js is already ESM.
  // Without this tsdown emits cli.mjs and the `bin` path breaks.
  fixedExtension: false,
  dts: false,
  // Readable stack traces matter more than bundle size for a CLI users debug.
  minify: false,
  sourcemap: true,
});
