import type { ParserEngine } from "./parser-engine";
import type {
  AmbiguityGroup,
  Candidate,
  CompletionSuggestion,
  ParseContext,
  ParseResult,
  ValueKind,
} from "./parser-types";
import { CHALLENGE_PHRASES } from "./challenge-phrases";
import {
  addDuration,
  createLocalDate,
  formatPointLabel,
  formatRangeLabel,
  getFridayBeforeChristmas,
  getLaborDayWeekendRange,
  getNextAnnualDate,
  getNextWeekday,
  getNextWeekdayInMonthAfterNow,
  normalizeDurationUnit,
  parseMonthToken,
  parseTimeToken,
  parseWeekdayToken,
  parseYearToken,
  toUtcIso,
  toYmd,
} from "../utils/date-utils";
import { normalizeInput, parseCountToken, stripOrdinalSuffix } from "../utils/string-utils";

interface ParsedEndpoint {
  year?: number;
  month: number;
  day: number;
  hasYear: boolean;
  hour: number;
  minute: number;
}

interface AnchorPoint {
  kind: "point";
  date: Date;
  suggestionText: string;
}

interface AnchorRange {
  kind: "range";
  start: Date;
  end: Date;
  suggestionText: string;
}

type AnchorValue = AnchorPoint | AnchorRange;

const DEFAULT_SUGGESTION_PHRASES = [
  "today",
  "tomorrow 2pm",
  ...CHALLENGE_PHRASES,
];

export class JsParserEngine implements ParserEngine {
  public parse(rawInput: string, context: ParseContext): ParseResult {
    const normalizedInput = normalizeInput(rawInput);

    if (!normalizedInput) {
      return this.createResult({
        rawInput,
        status: "idle",
        astType: null,
        valueKind: null,
        candidates: [],
        ambiguityGroups: [],
        selectedCandidateId: null,
        previewLabel: null,
        canonicalValue: null,
        errors: [],
        suggestions: this.buildSuggestions(normalizedInput, []),
      });
    }

    const now = this.resolveNow(context);
    const timeZone = this.resolveTimeZone(context);

    const explicitRange = this.parseExplicitRange(normalizedInput, now, timeZone);
    if (explicitRange) {
      return this.createValidResult(rawInput, "range", [explicitRange], explicitRange.label, explicitRange.suggestionText);
    }

    const anchorPlusDurationPoint = this.parseAnchorPlusDurationPoint(normalizedInput, now, timeZone);
    if (anchorPlusDurationPoint) {
      return this.createValidResult(
        rawInput,
        "point",
        [anchorPlusDurationPoint],
        anchorPlusDurationPoint.label,
        anchorPlusDurationPoint.suggestionText,
      );
    }

    const lookbackRange = this.parseLookbackWindow(normalizedInput, now, timeZone);
    if (lookbackRange) {
      return this.createValidResult(rawInput, "range", [lookbackRange], lookbackRange.label, lookbackRange.suggestionText);
    }

    const pastPoint = this.parsePastDurationPoint(normalizedInput, now, timeZone);
    if (pastPoint) {
      return this.createValidResult(rawInput, "point", [pastPoint], pastPoint.label, pastPoint.suggestionText);
    }

    const futurePoint = this.parseFutureDurationPoint(normalizedInput, now, timeZone);
    if (futurePoint) {
      return this.createValidResult(rawInput, "point", [futurePoint], futurePoint.label, futurePoint.suggestionText);
    }

    const ambiguousWeekday = this.parseAmbiguousNextWeekday(normalizedInput, now, context, timeZone);
    if (ambiguousWeekday) {
      return this.createResult({
        rawInput,
        status: "ambiguous",
        astType: "relative_weekday_datetime",
        valueKind: "point",
        candidates: ambiguousWeekday.candidates,
        ambiguityGroups: [ambiguousWeekday.group],
        selectedCandidateId: null,
        previewLabel: ambiguousWeekday.candidates[0]?.label ?? null,
        canonicalValue: null,
        errors: [],
        suggestions: this.buildSuggestions(normalizedInput, ambiguousWeekday.suggestionTexts),
      });
    }

    const directPoint = this.parsePointValue(normalizedInput, now, context, timeZone);
    if (directPoint) {
      return this.createValidResult(rawInput, "point", [directPoint], directPoint.label, directPoint.suggestionText);
    }

    return this.createResult({
      rawInput,
      status: "invalid",
      astType: null,
      valueKind: null,
      candidates: [],
      ambiguityGroups: [],
      selectedCandidateId: null,
      previewLabel: null,
      canonicalValue: null,
      errors: ["Unable to parse input."],
      suggestions: this.buildSuggestions(normalizedInput, []),
    });
  }

  private createValidResult(
    rawInput: string,
    valueKind: ValueKind,
    candidates: Array<Candidate & { suggestionText: string }>,
    previewLabel: string,
    suggestionText: string,
  ): ParseResult {
    const primaryCandidate = candidates[0] ?? null;

    return this.createResult({
      rawInput,
      status: "valid",
      astType: valueKind === "range" ? "range" : "datetime",
      valueKind,
      candidates,
      ambiguityGroups: [],
      selectedCandidateId: primaryCandidate ? primaryCandidate.id : null,
      previewLabel,
      canonicalValue: this.getCanonicalValue(primaryCandidate),
      errors: [],
      suggestions: this.buildSuggestions(normalizeInput(rawInput), [suggestionText]),
    });
  }

  private createResult(input: {
    rawInput: string;
    status: ParseResult["status"];
    astType: string | null;
    valueKind: ValueKind;
    candidates: Candidate[];
    suggestions: CompletionSuggestion[];
    ambiguityGroups: AmbiguityGroup[];
    selectedCandidateId: string | null;
    previewLabel: string | null;
    canonicalValue: string | null;
    errors: string[];
  }): ParseResult {
    return {
      status: input.status,
      rawInput: input.rawInput,
      astType: input.astType,
      valueKind: input.valueKind,
      candidates: input.candidates,
      suggestions: input.suggestions,
      ambiguityGroups: input.ambiguityGroups,
      selectedCandidateId: input.selectedCandidateId,
      previewLabel: input.previewLabel,
      canonicalValue: input.canonicalValue,
      errors: input.errors,
    };
  }

  private buildSuggestions(normalizedInput: string, preferredSuggestions: string[]): CompletionSuggestion[] {
    const maxSuggestions = 5;
    const suggestionPool = [...preferredSuggestions, ...DEFAULT_SUGGESTION_PHRASES];
    const unique = new Set<string>();
    const suggestions: CompletionSuggestion[] = [];

    for (const rawSuggestion of suggestionPool) {
      const suggestion = normalizeInput(rawSuggestion);

      if (!suggestion || unique.has(suggestion)) {
        continue;
      }

      const shouldInclude =
        !normalizedInput || suggestion.startsWith(normalizedInput) || suggestion.includes(normalizedInput);

      if (!shouldInclude) {
        continue;
      }

      unique.add(suggestion);

      suggestions.push({
        id: `suggestion-${suggestions.length + 1}`,
        label: suggestion,
        insertText: suggestion,
        kind: preferredSuggestions.includes(rawSuggestion) ? "candidate" : "shortcut",
        confidence: preferredSuggestions.includes(rawSuggestion) ? 0.92 : 0.6,
      });

      if (suggestions.length >= maxSuggestions) {
        break;
      }
    }

    return suggestions;
  }

  private parseExplicitRange(normalizedInput: string, now: Date, timeZone: string): (Candidate & { suggestionText: string }) | null {
    const delimiters = [" to ", " through ", " until ", " - "];

    for (const delimiter of delimiters) {
      if (!normalizedInput.includes(delimiter)) {
        continue;
      }

      const [leftRaw, rightRaw] = normalizedInput.split(delimiter, 2);

      if (!leftRaw || !rightRaw) {
        continue;
      }

      const left = this.parseDateEndpoint(leftRaw, now, timeZone);
      const right = this.parseDateEndpoint(rightRaw, now, timeZone);

      if (!left || !right) {
        continue;
      }

      const baseYear = now.getFullYear();
      const leftYear = left.year ?? baseYear;
      let rightYear = right.year ?? leftYear;

      let startDate = createLocalDate(leftYear, left.month, left.day, left.hour, left.minute, timeZone);
      let endDate = createLocalDate(rightYear, right.month, right.day, right.hour, right.minute, timeZone);

      if (!right.hasYear) {
        while (endDate.getTime() < startDate.getTime()) {
          rightYear += 1;
          endDate = createLocalDate(rightYear, right.month, right.day, right.hour, right.minute, timeZone);
        }
      }

      if (endDate.getTime() < startDate.getTime()) {
        const swap = startDate;
        startDate = endDate;
        endDate = swap;
      }

      return this.createRangeCandidate(startDate, endDate, normalizedInput, 0.96, "rule", timeZone);
    }

    return null;
  }

  private parseAnchorPlusDurationPoint(
    normalizedInput: string,
    now: Date,
    timeZone: string,
  ): (Candidate & { suggestionText: string }) | null {
    const match = normalizedInput.match(
      /^(.+?)(?:\s*\+\s*|\s+plus\s+)(a|an|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(hours?|days?|weeks?|months?|years?)$/,
    );

    if (!match) {
      return null;
    }

    const anchorRaw = normalizeInput(match[1]);
    const count = parseCountToken(match[2]);
    const unit = normalizeDurationUnit(match[3]);

    if (!count || !unit) {
      return null;
    }

    const anchor = this.parseAnchor(anchorRaw, now, timeZone);

    if (!anchor) {
      return null;
    }

    const anchorDate = anchor.kind === "point" ? anchor.date : anchor.end;
    const shiftedDate = addDuration(anchorDate, count, unit, timeZone);

    return this.createPointCandidate(startOfMinute(shiftedDate), normalizedInput, 0.93, "rule", undefined, timeZone);
  }

  private parseLookbackWindow(normalizedInput: string, now: Date, timeZone: string): (Candidate & { suggestionText: string }) | null {
    const match = normalizedInput.match(
      /^(?:the\s+)?(?:last|past)\s+(a|an|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(hours?|days?|weeks?|months?|years?)$/,
    );

    if (!match) {
      return null;
    }

    const count = parseCountToken(match[1]);
    const unit = normalizeDurationUnit(match[2]);

    if (!count || !unit) {
      return null;
    }

    const startDate = addDuration(now, -count, unit, timeZone);
    return this.createRangeCandidate(startOfMinute(startDate), startOfMinute(now), normalizedInput, 0.9, "rule", timeZone);
  }

  private parsePastDurationPoint(normalizedInput: string, now: Date, timeZone: string): (Candidate & { suggestionText: string }) | null {
    const match = normalizedInput.match(
      /^(a|an|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(hours?|days?|weeks?|months?|years?)\s+in\s+the\s+past$/,
    );

    if (!match) {
      return null;
    }

    const count = parseCountToken(match[1]);
    const unit = normalizeDurationUnit(match[2]);

    if (!count || !unit) {
      return null;
    }

    const date = addDuration(now, -count, unit, timeZone);
    return this.createPointCandidate(startOfMinute(date), normalizedInput, 0.9, "rule", undefined, timeZone);
  }

  private parseFutureDurationPoint(normalizedInput: string, now: Date, timeZone: string): (Candidate & { suggestionText: string }) | null {
    const match = normalizedInput.match(
      /^(a|an|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(hours?|days?|weeks?|months?|years?)\s+from\s+now$/,
    );

    if (!match) {
      return null;
    }

    const count = parseCountToken(match[1]);
    const unit = normalizeDurationUnit(match[2]);

    if (!count || !unit) {
      return null;
    }

    const date = addDuration(now, count, unit, timeZone);
    return this.createPointCandidate(startOfMinute(date), normalizedInput, 0.9, "rule", undefined, timeZone);
  }

  private parseAmbiguousNextWeekday(
    normalizedInput: string,
    now: Date,
    context: ParseContext,
    timeZone: string,
  ): { candidates: Candidate[]; group: AmbiguityGroup; suggestionTexts: string[] } | null {
    if (normalizedInput.includes(" in ")) {
      return null;
    }

    const match = normalizedInput.match(/^next\s+([a-z]+)(?:\s+([\w:]+(?:\s*(?:am|pm))?))?$/);

    if (!match) {
      return null;
    }

    const weekday = parseWeekdayToken(match[1]);

    if (weekday === null) {
      return null;
    }

    const parsedTime = match[2]
      ? parseTimeToken(match[2])
      : context.productRules.defaultTime ?? {
          hour: 9,
          minute: 0,
        };

    if (!parsedTime) {
      return null;
    }

    const thisWeek = getNextWeekday(now, weekday, timeZone);
    thisWeek.setHours(parsedTime.hour, parsedTime.minute, 0, 0);

    const followingWeek = addDuration(thisWeek, 7, "day", timeZone);

    const first = this.createPointCandidate(thisWeek, normalizedInput, 0.72, "rule", "candidate-this-week", timeZone);
    const second = this.createPointCandidate(followingWeek, normalizedInput, 0.58, "rule", "candidate-next-week", timeZone);

    const ambiguityGroup: AmbiguityGroup = {
      id: "ambiguity-next-weekday",
      type: "relative_weekday_scope",
      message: "Did you mean this upcoming weekday or the following one?",
      required: true,
      options: [
        { id: "option-this-week", label: first.label, candidateId: first.id },
        { id: "option-next-week", label: second.label, candidateId: second.id },
      ],
    };

    return {
      candidates: [first, second],
      group: ambiguityGroup,
      suggestionTexts: ["this friday", "next friday"],
    };
  }

  private parsePointValue(
    normalizedInput: string,
    now: Date,
    context: ParseContext,
    timeZone: string,
  ): (Candidate & { suggestionText: string }) | null {
    const anchor = this.parseAnchor(normalizedInput, now, timeZone);

    if (anchor && anchor.kind === "point") {
      return this.createPointCandidate(anchor.date, anchor.suggestionText, 0.97, "rule", undefined, timeZone);
    }

    const endpoint = this.parseDateEndpoint(normalizedInput, now, timeZone);

    if (!endpoint) {
      return null;
    }

    const year = endpoint.year ?? now.getFullYear();
    const date = createLocalDate(year, endpoint.month, endpoint.day, endpoint.hour, endpoint.minute, timeZone);

    return this.createPointCandidate(date, normalizedInput, 0.95, "rule", undefined, timeZone);
  }

  private parseAnchor(normalizedInput: string, now: Date, timeZone: string): AnchorValue | null {
    if (normalizedInput === "today") {
      return {
        kind: "point",
        date: createLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate(), 0, 0, timeZone),
        suggestionText: normalizedInput,
      };
    }

    if (normalizedInput === "tomorrow") {
      const tomorrow = addDuration(
        createLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate(), 0, 0, timeZone),
        1,
        "day",
        timeZone,
      );
      return {
        kind: "point",
        date: tomorrow,
        suggestionText: normalizedInput,
      };
    }

    const relativeWithTime = normalizedInput.match(/^(today|tomorrow)\s+([\d:]+(?:\s*(?:am|pm))?)$/);
    if (relativeWithTime) {
      const time = parseTimeToken(relativeWithTime[2]);

      if (!time) {
        return null;
      }

      const base = relativeWithTime[1] === "today" ? new Date(now.getTime()) : addDuration(now, 1, "day", timeZone);
      const date = createLocalDate(base.getFullYear(), base.getMonth() + 1, base.getDate(), time.hour, time.minute, timeZone);

      return {
        kind: "point",
        date,
        suggestionText: normalizedInput,
      };
    }

    if (normalizedInput === "friday before christmas") {
      return {
        kind: "point",
        date: getFridayBeforeChristmas(now, timeZone),
        suggestionText: normalizedInput,
      };
    }

    if (normalizedInput === "christmas") {
      return {
        kind: "point",
        date: getNextAnnualDate(now, 12, 25, timeZone),
        suggestionText: normalizedInput,
      };
    }

    if (normalizedInput === "new years" || normalizedInput === "new year's" || normalizedInput === "new years day") {
      return {
        kind: "point",
        date: getNextAnnualDate(now, 1, 1, timeZone),
        suggestionText: normalizedInput,
      };
    }

    if (normalizedInput === "labor day weekend") {
      const range = getLaborDayWeekendRange(now, timeZone);

      return {
        kind: "range",
        start: range.start,
        end: range.end,
        suggestionText: normalizedInput,
      };
    }

    const nextWeekdayInMonth = normalizedInput.match(/^next\s+([a-z]+)\s+in\s+([a-z]+)$/);
    if (nextWeekdayInMonth) {
      const weekday = parseWeekdayToken(nextWeekdayInMonth[1]);
      const month = parseMonthToken(nextWeekdayInMonth[2]);

      if (weekday === null || month === null) {
        return null;
      }

      return {
        kind: "point",
        date: getNextWeekdayInMonthAfterNow(now, month, weekday, timeZone),
        suggestionText: normalizedInput,
      };
    }

    const endpoint = this.parseDateEndpoint(normalizedInput, now, timeZone);
    if (!endpoint) {
      return null;
    }

    const year = endpoint.year ?? now.getFullYear();
    return {
      kind: "point",
      date: createLocalDate(year, endpoint.month, endpoint.day, endpoint.hour, endpoint.minute, timeZone),
      suggestionText: normalizedInput,
    };
  }

  private parseDateEndpoint(rawExpression: string, now: Date, timeZone: string): ParsedEndpoint | null {
    const expression = normalizeInput(rawExpression);

    const numeric = expression.match(/^([0-1]?\d)[/\-.]([0-3]?\d)[/\-.](\d{2,4})(?:\s+([\d:]+(?:\s*(?:am|pm))?))?$/);
    if (numeric) {
      const month = Number(numeric[1]);
      const day = Number(numeric[2]);
      const year = parseYearToken(numeric[3]);
      const parsedTime = numeric[4] ? parseTimeToken(numeric[4]) : null;

      if (!year || !isValidMonthDay(year, month, day, timeZone)) {
        return null;
      }

      return {
        year,
        month,
        day,
        hasYear: true,
        hour: parsedTime?.hour ?? 0,
        minute: parsedTime?.minute ?? 0,
      };
    }

    const relativeDate = expression.match(/^(today|tomorrow)(?:\s+([\d:]+(?:\s*(?:am|pm))?))?$/);
    if (relativeDate) {
      const baseDate = relativeDate[1] === "today" ? new Date(now.getTime()) : addDuration(now, 1, "day", timeZone);
      const parsedTime = relativeDate[2] ? parseTimeToken(relativeDate[2]) : null;

      return {
        year: baseDate.getFullYear(),
        month: baseDate.getMonth() + 1,
        day: baseDate.getDate(),
        hasYear: true,
        hour: parsedTime?.hour ?? 0,
        minute: parsedTime?.minute ?? 0,
      };
    }

    const textDate = expression.match(/^([a-z]+)\s+(\d{1,2}(?:st|nd|rd|th)?)(?:,)?(?:\s+(\d{2,4}))?(?:\s+([\d:]+(?:\s*(?:am|pm))?))?$/);
    if (textDate) {
      const month = parseMonthToken(textDate[1]);
      const day = Number(stripOrdinalSuffix(textDate[2]));
      const parsedYear = textDate[3] ? parseYearToken(textDate[3]) : null;
      const parsedTime = textDate[4] ? parseTimeToken(textDate[4]) : null;
      const yearForValidation = parsedYear ?? now.getFullYear();

      if (month === null || !isValidMonthDay(yearForValidation, month, day, timeZone)) {
        return null;
      }

      return {
        year: parsedYear ?? undefined,
        month,
        day,
        hasYear: Boolean(parsedYear),
        hour: parsedTime?.hour ?? 0,
        minute: parsedTime?.minute ?? 0,
      };
    }

    return null;
  }

  private createPointCandidate(
    date: Date,
    suggestionText: string,
    confidence: number,
    source: Candidate["source"],
    id = `candidate-point-${Math.random().toString(36).slice(2, 10)}`,
    timeZone = "UTC",
  ): Candidate & { suggestionText: string } {
    return {
      id,
      kind: "point",
      utcIso: toUtcIso(date),
      isoDate: toYmd(date, timeZone),
      label: formatPointLabel(date, timeZone),
      confidence,
      source,
      suggestionText,
    };
  }

  private createRangeCandidate(
    startDate: Date,
    endDate: Date,
    suggestionText: string,
    confidence: number,
    source: Candidate["source"],
    timeZone: string,
  ): Candidate & { suggestionText: string } {
    const normalizedStart = startOfMinute(startDate);
    const normalizedEnd = startOfMinute(endDate);

    return {
      id: `candidate-range-${Math.random().toString(36).slice(2, 10)}`,
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
  }

  private resolveNow(context: ParseContext): Date {
    const parsed = new Date(context.nowIso);

    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }

    return parsed;
  }

  private resolveTimeZone(context: ParseContext): string {
    return context.timezone || "UTC";
  }

  private getCanonicalValue(candidate: Candidate | null): string | null {
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
}

function isValidMonthDay(year: number, month: number, day: number, timeZone: string): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  try {
    const date = createLocalDate(year, month, day, 0, 0, timeZone);
    return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
  } catch {
    return false;
  }
}

function startOfMinute(inputDate: Date): Date {
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
