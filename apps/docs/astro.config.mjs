import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Static output: the docs site has no server, matching the project's local-first principle.
export default defineConfig({
  site: "https://shipseal.dev",
  output: "static",
  integrations: [sitemap()],
  vite: {
    resolve: { alias: { "takumi-js/node": "takumi-js/wasm/no-init" } },
    build: { target: "es2022" },
  },
  build: { inlineStylesheets: "always" },
});
