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
  "christmas eve",
  "xmas",
  "xmas eve",
  "new year",
  "new year's day",
  "new years",
  "new years day",
  "new year's eve",
  "new years eve",
  "labor day",
  "memorial day",
  "thanksgiving",
  "turkey day",
  "mother's day",
  "mothers day",
  "father's day",
  "fathers day",
  "halloween",
  "valentine's day",
  "valentines day",
  "valentines",
  "july 4th",
  "july 4",
  "4th of july",
  "fourth of july",
  "independence day",
  "easter",
  "easter sunday",
  "easter monday",
  "good friday",
  "palm sunday",
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
  const matches: Array<{
    insertText: string;
    overlap: number;
    termLength: number;
    edits: number;
  }> = [];
  const seen = new Set<string>();

  for (const term of VOCABULARY) {
    const match = findPrefixMatch(lowered, term);

    if (!match) {
      continue;
    }

    if (match.length >= term.length && match.edits === 0) {
      continue;
    }

    const insertText =
      match.edits === 0
        ? rawInput + term.slice(match.length)
        : rawInput.slice(0, rawInput.length - match.length) + term;

    const key = insertText.toLowerCase();

    if (key === lowered || seen.has(key)) {
      continue;
    }

    seen.add(key);
    matches.push({ insertText, overlap: match.length, termLength: term.length, edits: match.edits });
  }

  matches.sort((a, b) => {
    if (a.edits !== b.edits) {
      return a.edits - b.edits;
    }
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
    confidence: 0.5 + Math.min(match.overlap / 10, 0.4) - match.edits * 0.15,
  }));
}

function findPrefixMatch(
  lowerInput: string,
  term: string,
): { length: number; edits: number } | null {
  const max = Math.min(lowerInput.length, term.length);

  for (let length = max; length >= MIN_OVERLAP; length -= 1) {
    const boundaryIndex = lowerInput.length - length - 1;

    if (boundaryIndex >= 0 && !/\s/.test(lowerInput.charAt(boundaryIndex))) {
      continue;
    }

    const inputSlice = lowerInput.slice(lowerInput.length - length);
    const termPrefix = term.slice(0, length);

    let edits = 0;
    for (let i = 0; i < length; i += 1) {
      if (inputSlice[i] !== termPrefix[i]) {
        edits += 1;
        if (edits > 1) {
          break;
        }
      }
    }

    if (edits === 0) {
      return { length, edits };
    }

    if (edits === 1 && inputSlice[0] === termPrefix[0]) {
      return { length, edits };
    }
  }

  return null;
}
