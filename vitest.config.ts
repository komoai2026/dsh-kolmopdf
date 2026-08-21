import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: { reporter: ["text", "json", "html"] },
    // The pnpm store mirrors installed project trees under .pnpm-store (and
    // scratch comparison installs live under .dsh-test); neither is test input.
    exclude: [
      "**/node_modules/**",
      "**/.pnpm-store/**",
      "**/.dsh-test/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.git/**",
    ],
  },
});
