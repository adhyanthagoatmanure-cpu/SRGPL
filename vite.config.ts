import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    VitePWA({
      // "prompt": a new version is only activated after the user confirms, so a
      // running session is never reloaded under the user's feet.
      registerType: "prompt",
      includeAssets: ["favicon.png", "logo.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "SRGPL Business Manager",
        short_name: "SRGPL",
        description:
          "Offline-first business manager. All data is stored locally in this browser (IndexedDB).",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#ffffff",
        theme_color: "#ea580c",
        categories: ["business", "productivity", "finance"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules[\\/](dexie|dexie-react-hooks)[\\/]/.test(id)) return "dexie";
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "vendor";
          return undefined;
        },
      },
    },
  },
});
