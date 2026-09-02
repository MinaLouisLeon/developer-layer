import type { Config } from "tailwindcss";

// The theme is mino's, read straight from the vendored token file so there is
// one source of truth for its colours. Only `content` differs from upstream's
// config: the globs are resolved from this directory, which is where PostCSS
// runs, not from the vendored package.
import { colorTokens, fontStacks } from "../../../vendor/mino/ui/src/theme/tokens";

export default {
  content: ["./mino.html", "../../../vendor/mino/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: colorTokens,
      fontFamily: {
        mono: [...fontStacks.mono],
        sans: [...fontStacks.sans],
      },
    },
  },
  plugins: [],
} satisfies Config;
