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
      // The web layer's "solver" tier — points at v3's unified, mode-aware
      // solver (`N2K-v3/src/`). All of the surfaces that were ported from
      // v1's web layer (Compose, Lookup, etc.) reach into the solver via
      // this alias, so flipping it here repoints every consumer at once.
      // The v3.1 trim ported v2's competition.ts / boardAnalysis.ts /
      // BoardSpec generators / parseEquation / DICE_COMBINATIONS into v3
      // so the consumers' import paths stay shaped like v2 spelt them.
      "@solver": path.resolve(__dirname, "../src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
