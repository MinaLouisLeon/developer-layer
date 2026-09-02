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
      // Three pages, one bundle. The workbench and the command bar are
      // separate Tauri windows rather than components — one is tiled like any
      // application, the other floats over everything — so each gets its own
      // document. Building them here rather than as their own Vite projects is
      // what makes `/mino.html` and `/atlas.html` resolve the same way on the
      // dev server and in the bundle.
      input: {
        shell: fileURLToPath(new URL("./index.html", import.meta.url)),
        mino: fileURLToPath(new URL("./mino.html", import.meta.url)),
        atlas: fileURLToPath(new URL("./atlas.html", import.meta.url)),
      },
    },
  },
});
