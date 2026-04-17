import type { CompletionSuggestion } from "./parser-types";

const VOCABULARY: readonly string[] = [
  // anchors
  "today",
  "tomorrow",
  "yesterday",
  "day after tomorrow",
  "day before yesterday",
  // modifiers
  "next",
  "last",
  "past",
  "this",
  "the last",
  "the past",
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
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  // holidays
  "christmas",
  "xmas",
  "christmas eve",
  "new year",
  "new year's day",
  "new years",
  "new year's eve",
  "new years eve",
  "labor day",
  "memorial day",
  "thanksgiving",
  "mother's day",
  "mothers day",
  "father's day",
  "fathers day",
  "halloween",
  "valentine's day",
  "valentines day",
  "july 4th",
  "4th of july",
  "independence day",
  // units and qualifiers
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  "hour",
  "hours",
  "weekend",
  // connectives
  "to",
  "through",
  "until",
  "plus",
  "before",
  "after",
  "of",
  "in",
  "from now",
  "in the past",
  "ago",
  // calendar periods
  "this week",
  "this month",
  "this year",
  "next week",
  "next month",
  "next year",
  "last week",
  "last month",
  "last year",
  // period boundaries
  "end of",
  "end of week",
  "end of month",
  "end of year",
  "end of this week",
  "end of this month",
  "end of next month",
  "end of last month",
  "start of",
  "start of week",
  "start of month",
  "start of year",
  "beginning of",
  "beginning of month",
  "beginning of week",
];

const STARTERS: readonly string[] = ["today", "tomorrow", "next friday", "christmas"];

const MAX_SUGGESTIONS = 5;
const MIN_OVERLAP = 2;

export function buildSuggestions(rawInput: string): CompletionSuggestion[] {
  if (!rawInput.trim()) {
    return STARTERS.map((text, index) => ({
      id: `suggestion-${index + 1}`,
      label: text,
      insertText: text,
      kind: "shortcut" as const,
      confidence: 0.5,
    }));
  }

  const lowered = rawInput.toLowerCase();
  const matches: Array<{ insertText: string; overlap: number; termLength: number }> = [];
  const seen = new Set<string>();

  for (const term of VOCABULARY) {
    const overlap = findBoundaryOverlap(lowered, term);

    if (overlap < MIN_OVERLAP || overlap >= term.length) {
      continue;
    }

    const tail = term.slice(overlap);
    const insertText = rawInput + tail;
    const key = insertText.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    matches.push({ insertText, overlap, termLength: term.length });
  }

  matches.sort((a, b) => {
    if (b.overlap !== a.overlap) {
      return b.overlap - a.overlap;
    }
    return a.termLength - b.termLength;
  });

  return matches.slice(0, MAX_SUGGESTIONS).map((match, index) => ({
    id: `suggestion-${index + 1}`,
    label: match.insertText,
    insertText: match.insertText,
    kind: "completion" as const,
    confidence: 0.5 + Math.min(match.overlap / 10, 0.4),
  }));
}

function findBoundaryOverlap(lowerInput: string, term: string): number {
  const max = Math.min(lowerInput.length, term.length);

  for (let length = max; length > 0; length -= 1) {
    if (!lowerInput.endsWith(term.slice(0, length))) {
      continue;
    }

    const boundaryIndex = lowerInput.length - length - 1;

    if (boundaryIndex < 0 || /\s/.test(lowerInput.charAt(boundaryIndex))) {
      return length;
    }
  }

  return 0;
}
