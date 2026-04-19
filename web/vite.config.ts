import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      // Lets web code import platform services as `@platform/services/...`
      // pointing at the v2/src/ tree (one level up).
      "@platform": path.resolve(__dirname, "../src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
