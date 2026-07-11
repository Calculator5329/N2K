import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    // PWA / offline (roadmap.md). Static SPA shell + immutable dataset blobs
    // cache well. `autoUpdate` + Workbox's content-hashed precache manifest
    // means a fresh build's assets are picked up on next visit — users are
    // never stranded on a stale bundle.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // Dev is untouched: the SW is only built for production. (No
      // devOptions.enabled, so `vite` dev serves as before.)
      manifest: {
        name: "The N2K Almanac",
        short_name: "N2K",
        description:
          "Every dice triple, every equation, indexed and scored — a mental-math dice-equation game.",
        lang: "en",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: ".",
        scope: ".",
        theme_color: "#161310",
        background_color: "#161310",
        icons: [
          {
            src: "icons/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the built SPA shell + code/styles/small assets. The large
        // `.n2k` dataset blobs are deliberately NOT precached (that would
        // force a multi-tens-of-MB download on first install); they are
        // runtime-cached on demand instead — see runtimeCaching below.
        globPatterns: ["**/*.{js,css,html,svg,ico,png,webp,woff,woff2}"],
        globIgnores: ["**/data/**"],
        // Safety net so an oversized asset can never balloon the precache.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // SPA: unknown navigations fall back to the cached shell when offline.
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/data\//],
        runtimeCaching: [
          {
            // Immutable dataset blobs — cache-first, long-lived. They are
            // served with immutable headers and never mutate in place; a
            // rebake ships under a new build, so CacheFirst is safe.
            urlPattern: ({ url }) => url.pathname.endsWith(".n2k"),
            handler: "CacheFirst",
            options: {
              cacheName: "n2k-datasets",
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            // Google Fonts stylesheet (until fonts are self-hosted). Revalidate
            // in the background so updates land without blocking offline use.
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts webfont files — cache-first, long-lived.
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 48,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
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
