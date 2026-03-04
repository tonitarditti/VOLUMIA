import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        volume: {
          bg: "var(--bg)",
          panel: "var(--surface-1)",
          panelAlt: "var(--surface-2)",
          control: "var(--surface-3)",
          stroke: "var(--border)",
          text: "var(--text)",
          muted: "var(--text-muted)",
          accent: "var(--accent)",
          accent2: "var(--accent-2)",
          danger: "var(--danger)",
        },
      },
      boxShadow: {
        panel: "var(--shadow)",
      },
    },
  },
  plugins: [],
};

export default config;
