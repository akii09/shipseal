import { defineConfig } from "tsdown";

// Build config for the published `shipseal` CLI.
// Spec: docs/PROJECT_PLAN.md 25 (build tool decision).
//
// The second entry is the dependency-free browser client served by `preview`.
// Neither entry is a public library surface.
export default defineConfig({
  entry: { cli: "src/cli.ts", "studio-client": "src/studio/client.ts" },
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
