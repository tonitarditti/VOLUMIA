import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const configuredPort = Number.parseInt(process.env.VOLUMIA_DESKTOP_PORT ?? "5173", 10);
const desktopPort = Number.isFinite(configuredPort) ? configuredPort : 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: desktopPort,
    strictPort: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@volumia/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
