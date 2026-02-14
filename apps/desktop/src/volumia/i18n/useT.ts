import { useMemo } from "react";
import { useSettings } from "@/volumia/settings/context";
import { dictionaries, fallbackLanguage, type TranslationKey } from "./dict";

type TranslateParams = Record<string, string | number>;

function interpolate(template: string, params?: TranslateParams) {
  if (!params) return template;

  return Object.entries(params).reduce((output, [name, value]) => {
    return output.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
  }, template);
}

export function useT() {
  const { settings } = useSettings();

  const dictionary = useMemo(() => {
    return dictionaries[settings.language] ?? dictionaries[fallbackLanguage];
  }, [settings.language]);

  const fallbackDictionary = dictionaries[fallbackLanguage];

  const t = (key: TranslationKey, params?: TranslateParams) => {
    const template = dictionary[key] ?? fallbackDictionary[key] ?? key;
    return interpolate(template, params);
  };

  return { t, language: settings.language };
}
