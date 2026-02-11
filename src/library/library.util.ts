export function uid8(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function nowISO() {
  return new Date().toISOString();
}

export function normalizeTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

export function safeNumber(n: number, fallback = 1) {
  return Number.isFinite(n) ? n : fallback;
}
