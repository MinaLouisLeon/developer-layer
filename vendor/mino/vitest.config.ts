import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Upstream's UI suite, run against the vendored copy.
//
// It is here because the archive menu patches five of mino's own files, and
// this suite already covers all five — `file-tree-pane.test.tsx` and
// `use-file-tree.test.ts` most directly. Running it is what says the patch
// left the tree working, and it is what will say so again after the next
// resync. Developer Layer's own archive tests sit alongside it in
// `test/mino-workbench/integration/archive-menu.test.tsx`.
//
// Three things differ from upstream's config: the paths, which point at
// `vendor/mino/ui` rather than `apps/ui`, and the extra setup file that raises
// Testing Library's async timeout for CI. Playwright's `*.spec.ts` end-to-end
// tests are not vendored — they drive a real Tauri window.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./ui/src", import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: "jsdom",
    // Upstream's setup, then ours. See test/timeouts.ts.
    setupFiles: ["./test/setup.ts", "./test/timeouts.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
