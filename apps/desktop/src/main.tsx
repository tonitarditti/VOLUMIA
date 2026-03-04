import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { bootstrapDocumentTheme } from "@/ui/theme";
import "./ui/theme/theme.css";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found.");
}

bootstrapDocumentTheme();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
