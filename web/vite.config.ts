import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base: BASE,
  plugins: [react()],
  resolve: {
    alias: {
      "@platform": path.resolve(__dirname, "../src"),
      // Back-compat alias for files ported from v1. The v1 web layer was
      // written against the v1 platform (`<repo>/src`) which has the full
      // legacy surface (advancedSolver, competition, generators.generateBoard,
      // etc.). v2's reduced platform (`<repo>/v2-merged/src`) is what the
      // new code uses. Pointing `@solver` at the legacy root keeps the
      // ported v1 features compiling without modification.
      "@solver": path.resolve(__dirname, "../../src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
