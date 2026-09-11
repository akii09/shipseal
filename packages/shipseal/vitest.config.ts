import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "#takumi-jsx/jsx-runtime": join(dirname(fileURLToPath(import.meta.url)), "src/takumi-jsx/jsx-runtime.ts"),
      "#takumi-jsx/jsx-dev-runtime": join(dirname(fileURLToPath(import.meta.url)), "src/takumi-jsx/jsx-dev-runtime.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
