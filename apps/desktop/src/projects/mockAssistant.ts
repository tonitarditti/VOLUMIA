export function summarizeReply(reply: string) {
  const normalized = reply.replace(/\s+/g, " ").trim();
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 137)}...`;
}

export function buildMockAssistantReply(projectName: string, prompt: string) {
  const cleanedPrompt = prompt.trim();

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
