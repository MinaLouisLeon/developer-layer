import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Tauri serves the dev server on a fixed port and fails loudly rather than
  // silently picking another one.
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: "chrome110", sourcemap: true },
});
