import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  root: ".",
  publicDir: "public",
  resolve: {
    alias: {
      "@fnd/client-sdk": resolve(import.meta.dirname, "../../packages/client-sdk/src/index.ts"),
      "@fnd/analysis-view-model": resolve(import.meta.dirname, "../../packages/analysis-view-model/src/index.ts")
    }
  },
  server: {
    port: 5173,
    host: "127.0.0.1"
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, "index.html"),
      output: {
        entryFileNames: "bundle.js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: (asset) => (asset.name && asset.name.endsWith(".css") ? "styles.css" : "assets/[name][extname]")
      }
    }
  }
});
