import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { bootstrapDocumentTheme } from "@/ui/theme";
import { SettingsProvider } from "@/volumia/settings/context";
import "./ui/theme/theme.css";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found.");
}

bootstrapDocumentTheme();

createRoot(container).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>
);

// Remove the static fallback splash inserted in index.html once React mounts
const fallback = document.getElementById("fallback-splash");
if (fallback) {
  // slight delay to ensure users see the micro-animation
  setTimeout(() => {
    fallback.remove();
  }, 250);
}
