import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

// base defaults to "/" and the build emits JS/CSS into dist/assets/, which is
// exactly how the Go server mounts the workbench: index.html at /, assets at
// /assets/*.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(root, "src") },
  },
  server: {
    // Dev only: `npm run dev` proxies API calls to a running
    // `efficient-daemon serve --workbench`.
    proxy: {
      "/ask": "http://127.0.0.1:8080",
      "/config": "http://127.0.0.1:8080",
      "/schema/lint": "http://127.0.0.1:8080",
    },
  },
  build: {
    // Built straight into the Go embed directory; `make build-web` copies nothing.
    outDir: "../internal/workbench/dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
