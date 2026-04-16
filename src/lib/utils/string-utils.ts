const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const FUZZY_TOKEN_MAP: Record<string, string> = {
  pluz: "plus",
  wknd: "weekend",
  "week-end": "weekend",
  wks: "weeks",
  wk: "week",
  b4: "before",
  frdy: "fri",
  chrismas: "christmas",
  xmas: "christmas",
};

export function normalizeInput(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeFuzzyInput(value: string): string {
  const base = normalizeInput(value);

  if (!base) {
    return "";
  }

  const tokens = base.split(" ");
  const normalizedTokens: string[] = [];

  for (const token of tokens) {
    const strippedToken = token.replace(/[.,]+$/g, "");
    const mappedToken = FUZZY_TOKEN_MAP[token] ?? FUZZY_TOKEN_MAP[strippedToken] ?? strippedToken;
    normalizedTokens.push(mappedToken);
  }

  return normalizedTokens.join(" ");
}

export function stripOrdinalSuffix(value: string): string {
  return value.replace(/(\d+)(st|nd|rd|th)$/i, "$1");
}

export function parseCountToken(rawToken: string): number | null {
  const token = normalizeInput(rawToken);

  if (/^\d+$/.test(token)) {
    return Number(token);
  }

  return NUMBER_WORDS[token] ?? null;
}
