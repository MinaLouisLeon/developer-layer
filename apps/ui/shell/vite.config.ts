import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Tauri serves the dev server on a fixed port and fails loudly rather than
  // silently picking another one.
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  resolve: {
    alias: {
      // Reserved for the vendored workbench, whose 274 source files import
      // through it. Developer Layer's own code uses relative paths and the
      // `@developer-layer/*` package names, and must keep doing so — an `@`
      // import here would silently resolve into `vendor/`.
      "@": fileURLToPath(new URL("../../../vendor/mino/ui/src", import.meta.url)),
    },
  },
  build: {
    target: "chrome110",
    sourcemap: true,
    rollupOptions: {
      // Two pages, one bundle. The workbench is a separate Tauri window rather
      // than a component, so it gets its own document — and building it here
      // rather than as its own Vite project is what makes `/mino.html` resolve
      // the same way on the dev server and in the bundle.
      input: {
        shell: fileURLToPath(new URL("./index.html", import.meta.url)),
        mino: fileURLToPath(new URL("./mino.html", import.meta.url)),
      },
    },
  },
});
