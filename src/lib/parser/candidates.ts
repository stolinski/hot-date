import { formatPointLabel, formatRangeLabel, toUtcIso, toYmd } from "../utils/date-utils";
import type { Candidate } from "./parser-types";

export type CandidateWithSuggestion = Candidate & { suggestionText: string };

export interface CandidateFactory {
  createPoint(args: {
    date: Date;
    suggestionText: string;
    confidence: number;
    source: Candidate["source"];
    id?: string;
  }): CandidateWithSuggestion;
  createRange(args: {
    startDate: Date;
    endDate: Date;
    suggestionText: string;
    confidence: number;
    source: Candidate["source"];
  }): CandidateWithSuggestion;
}

export function createCandidateFactory(timeZone: string): CandidateFactory {
  let counter = 0;

  function nextId(kind: "point" | "range"): string {
    counter += 1;
    return `candidate-${kind}-${counter}`;
  }

  return {
    createPoint({ date, suggestionText, confidence, source, id }) {
      return {
        id: id ?? nextId("point"),
        kind: "point",
        utcIso: toUtcIso(date),
        isoDate: toYmd(date, timeZone),
        label: formatPointLabel(date, timeZone),
        confidence,
        source,
        suggestionText,
      };
    },
    createRange({ startDate, endDate, suggestionText, confidence, source }) {
      const normalizedStart = startOfMinute(startDate);
      const normalizedEnd = startOfMinute(endDate);

      return {
        id: nextId("range"),
        kind: "range",
        range: {
          startUtcIso: toUtcIso(normalizedStart),
          endUtcIso: toUtcIso(normalizedEnd),
          startDate: toYmd(normalizedStart, timeZone),
          endDate: toYmd(normalizedEnd, timeZone),
        },
        label: formatRangeLabel(normalizedStart, normalizedEnd, timeZone),
        confidence,
        source,
        suggestionText,
      };
    },
  };
}

export function startOfMinute(inputDate: Date): Date {
  return new Date(
    inputDate.getFullYear(),
    inputDate.getMonth(),
    inputDate.getDate(),
    inputDate.getHours(),
    inputDate.getMinutes(),
    0,
    0,
  );
}

export function getCanonicalValue(candidate: Candidate | null): string | null {
  if (!candidate) {
    return null;
  }

  if (candidate.kind === "point") {
    return candidate.utcIso ?? null;
  }

  if (!candidate.range) {
    return null;
  }

  return `${candidate.range.startUtcIso}/${candidate.range.endUtcIso}`;
}
