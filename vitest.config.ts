import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next.js resolves "server-only" to an empty module on the server; mirror that in tests.
      "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
  },
});
