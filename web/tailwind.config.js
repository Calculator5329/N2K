/**
 * Tailwind config — colors all resolve to CSS variables defined in
 * `src/styles/globals.css`. Variables hold space-separated RGB triplets
 * (e.g. "251 247 238") so Tailwind's `<alpha-value>` modifier works.
 *
 * Themes (Tabletop / Almanac / Phosphor / …) swap the variables on
 * `[data-theme="…"]`; component code never needs to know which theme
 * is active.
 */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        serif:   ["var(--font-body)"],
        mono:    ["var(--font-mono)"],
      },
      colors: {
        paper: {
          50:  v("--paper-50"),
          100: v("--paper-100"),
          200: v("--paper-200"),
          300: v("--paper-300"),
          400: v("--paper-400"),
        },
        ink: {
          50:  v("--ink-50"),
          100: v("--ink-100"),
          200: v("--ink-200"),
          300: v("--ink-300"),
          400: v("--ink-400"),
          500: v("--ink-500"),
        },
        oxblood: {
          400: v("--accent-400"),
          500: v("--accent-500"),
          600: v("--accent-600"),
        },
        moss: {
          400: v("--support-400"),
          500: v("--support-500"),
          600: v("--support-600"),
        },
        // Aliases, used by some chrome elements that prefer semantic names
        // over the historical "moss / oxblood" pair.
        accent: {
          400: v("--accent-400"),
          500: v("--accent-500"),
          600: v("--accent-600"),
        },
        support: {
          400: v("--support-400"),
          500: v("--support-500"),
          600: v("--support-600"),
        },
      },
      letterSpacing: {
        "display":   "-0.02em",
        "wide-caps": "0.18em",
      },
      boxShadow: {
        "page":  "var(--page-shadow)",
        "press": "inset 0 1px 0 0 rgba(15, 12, 9, 0.05)",
      },
    },
  },
  plugins: [],
};
