import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Static output: the docs site has no server, matching the project's local-first principle.
export default defineConfig({
  site: "https://shipseal.dev",
  output: "static",
  integrations: [sitemap()],
  build: { inlineStylesheets: "always" },
});
