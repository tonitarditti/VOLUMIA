import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import type { AppLanguage } from "@/state/settings.types";

export function resolveLanguage(language: AppLanguage): "en" | "es" {
  if (language === "system") {
    const system = (navigator.language || "en").toLowerCase();
    return system.startsWith("es") ? "es" : "en";
  }
  return language;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: resolveLanguage("system"),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export { i18n };
