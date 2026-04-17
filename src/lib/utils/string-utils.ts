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
  tmrw: "tomorrow",
  tmrrw: "tomorrow",
  "2mrw": "tomorrow",
};

const FUZZY_VOCAB: readonly string[] = [
  // anchors
  "today",
  "tomorrow",
  "yesterday",
  // modifiers / periods
  "next",
  "last",
  "past",
  "this",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  "weekend",
  // weekdays
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  // months
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  // connectives
  "through",
  "until",
  "before",
  "after",
  // holiday roots (single-word forms)
  "christmas",
  "halloween",
  "thanksgiving",
  "valentine",
  "valentines",
  "memorial",
  "independence",
];

const FUZZY_VOCAB_SET = new Set(FUZZY_VOCAB);
const FUZZY_MIN_LENGTH = 4;

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
    const hardMapped = FUZZY_TOKEN_MAP[token] ?? FUZZY_TOKEN_MAP[strippedToken];
    if (hardMapped) {
      normalizedTokens.push(hardMapped);
      continue;
    }
    normalizedTokens.push(fuzzyCorrectToken(strippedToken));
  }

  return normalizedTokens.join(" ");
}

export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }

  return dp[m][n];
}

function fuzzyCorrectToken(token: string): string {
  if (token.length < FUZZY_MIN_LENGTH) {
    return token;
  }
  if (FUZZY_VOCAB_SET.has(token)) {
    return token;
  }

  for (const candidate of FUZZY_VOCAB) {
    if (Math.abs(candidate.length - token.length) > 1) {
      continue;
    }
    if (damerauLevenshtein(token, candidate) === 1) {
      return candidate;
    }
  }

  return token;
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
