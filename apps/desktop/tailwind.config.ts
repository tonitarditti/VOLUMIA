import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-secondary": "var(--surface-secondary)",
        "surface-hover": "var(--surface-hover)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        primary: "var(--volumia-blue)",
        "primary-hover": "var(--volumia-blue-hover)",
        cyan: "var(--volumia-cyan)",
        violet: "var(--volumia-violet)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
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
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        brand: "var(--shadow-brand)",
      },
    },
  },
  plugins: [],
};

export default config;
