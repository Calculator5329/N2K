import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
    // Workaround for a tinypool worker-spawn crash seen on Windows + Node 22
    // ("Cannot read properties of undefined (reading 'toString')" / "spawn UNKNOWN").
    // The default `pool: "threads"` triggers it when test files spawn their own
    // worker_threads (e.g. the Phase 1 export pipeline). Forks isolate each test
    // file in its own process, which avoids the parent worker-thread interaction.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    coverage: {
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/cli/**", "**/*.d.ts"],
    },
  },
});
