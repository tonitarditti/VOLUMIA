export function summarizeReply(reply: string) {
  const normalized = reply.replace(/\s+/g, " ").trim();
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 137)}...`;
}

function resolveAssistantLocale(locale: string | undefined) {
  const normalized = (locale ?? "en").toLowerCase();
  if (normalized.startsWith("es-ar")) {
    return "es-ar";
  }
  if (normalized.startsWith("es")) {
    return "es";
  }
  if (normalized.startsWith("pt")) {
    return "pt";
  }
  return "en";
}

export function buildMockAssistantReply(projectName: string, prompt: string, locale?: string) {
  const cleanedPrompt = prompt.trim();
  const resolvedLocale = resolveAssistantLocale(locale);
  const systemPromptByLocale: Record<string, string> = {
    "es-ar": "Responde SIEMPRE en el idioma seleccionado por el usuario y usa espanol rioplatense si es es-AR.",
    es: "Responde SIEMPRE en el idioma seleccionado por el usuario.",
    pt: "Responda SEMPRE no idioma selecionado pelo usuario.",
    en: "Respond ALWAYS in the language selected by the user.",
  };
  const _systemPrompt = systemPromptByLocale[resolvedLocale] ?? systemPromptByLocale.en;

  if (resolvedLocale === "es-ar" || resolvedLocale === "es") {
    return [
      `Proyecto: ${projectName}`,
      "",
      "Evaluacion",
      `- Intencion capturada: ${cleanedPrompt}`,
      "- La organizacion espacial puede priorizar una circulacion principal clara y dos zonas funcionales secundarias.",
      "",
      "Siguientes acciones recomendadas",
      "1. Defini restricciones de envolvente y altura objetivo antes de detallar.",
      "2. Fija proporciones de masa principal y luego valida distribucion de luz.",
      "3. Documenta estrategia de materiales con una base neutra y una familia acento.",
    ].join("\n");
  }

  if (resolvedLocale === "pt") {
    return [
      `Projeto: ${projectName}`,
      "",
      "Avaliacao",
      `- Intencao capturada: ${cleanedPrompt}`,
      "- A organizacao espacial pode priorizar circulacao principal clara e duas zonas funcionais secundarias.",
      "",
      "Proximas acoes recomendadas",
      "1. Defina restricoes de envoltoria e pe-direito alvo antes de detalhar.",
      "2. Trave proporcoes do volume principal e depois valide distribuicao de luz.",
      "3. Documente estrategia de materiais com base neutra e uma familia de destaque.",
    ].join("\n");
  }

  return [
    `Project: ${projectName}`,
    "",
    "Assessment",
    `- Intent captured: ${cleanedPrompt}`,
    "- Spatial organization can prioritize clear primary circulation and two secondary functional zones.",
    "",
    "Recommended next actions",
    "1. Define envelope constraints and target ceiling height before detailing.",
    "2. Lock primary massing proportions, then validate daylight distribution.",
    "3. Document material strategy with one neutral base and one accent family.",
  ].join("\n");
}
