import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand shades come from CSS variables so the school can pick its own colour (Settings → School profile → Theme colour).
        brand: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, `rgb(var(--brand-${n}) / <alpha-value>)`])),
      },
      fontFamily: { sans: ["Inter", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
