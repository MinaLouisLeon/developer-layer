import type { Config } from "tailwindcss";

import { colorTokens, fontStacks } from "./src/theme/tokens";

// Custom colour values are banned in class names. Everything the UI can paint
// with is registered here from the token file, so `bg-[#123456]` never needs
// to exist.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
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
