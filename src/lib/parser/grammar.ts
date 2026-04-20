import {
  addDuration,
  createLocalDate,
  endOfMonth,
  endOfWeek,
  endOfYear,
  parseWeekdayToken,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "../utils/date-utils";
import { normalizeInput } from "../utils/string-utils";
import { parseAnchor } from "./anchors";
import { type CandidateFactory, type CandidateWithSuggestion, startOfMinute } from "./candidates";
import { parseDateEndpoint } from "./endpoints";
import { parseDurationExpression } from "../utils/date-utils";
import type { ParseContext } from "./parser-types";

type PeriodUnit = "week" | "month" | "year";
type PeriodScope = "this" | "next" | "last";
type PeriodBoundary = "start" | "end";

export interface RuleContext {
  normalizedInput: string;
  now: Date;
  timeZone: string;
  parseContext: ParseContext;
  factory: CandidateFactory;
}

type RollUnit = "year" | "week" | null;

interface ResolvedEndpoint {
  date: Date;
  rollUnit: RollUnit;
}

function resolveRangeEndpoint(rawExpression: string, now: Date, timeZone: string): ResolvedEndpoint | null {
  const normalized = normalizeInput(rawExpression);

  const endpoint = parseDateEndpoint(rawExpression, now, timeZone);
  if (endpoint) {
    const year = endpoint.year ?? now.getFullYear();
    return {
      date: createLocalDate(year, endpoint.month, endpoint.day, endpoint.hour, endpoint.minute, timeZone),
      rollUnit: endpoint.hasYear ? null : "year",
    };
  }

  const anchor = parseAnchor(normalized, now, timeZone);
  if (anchor) {
    const date = anchor.kind === "point" ? anchor.date : anchor.start;
    const rollUnit: RollUnit = isWeekdayAnchor(normalized) ? "week" : null;
    return { date, rollUnit };
  }

  const arithmetic = normalized.match(/^(.+?)(?:\s*\+\s*|\s+plus\s+)(.+)$/);
  if (arithmetic) {
    const anchorResult = parseAnchor(normalizeInput(arithmetic[1]), now, timeZone);
    const duration = parseDurationExpression(arithmetic[2], "day");
    if (anchorResult && duration) {
      const anchorDate = anchorResult.kind === "point" ? anchorResult.date : anchorResult.end;
      const shifted = addDuration(anchorDate, duration.amount, duration.unit, timeZone);
      return { date: startOfMinute(shifted), rollUnit: null };
    }
  }

  const durationBeforeAfter = normalized.match(/^(.+?)\s+(before|after)\s+(.+)$/);
  if (durationBeforeAfter) {
    const duration = parseDurationExpression(durationBeforeAfter[1], "day");
    const anchorResult = parseAnchor(normalizeInput(durationBeforeAfter[3]), now, timeZone);
    if (duration && anchorResult) {
      const anchorDate = anchorResult.kind === "point" ? anchorResult.date : anchorResult.end;
      const direction = durationBeforeAfter[2] === "after" ? 1 : -1;
      const shifted = addDuration(anchorDate, direction * duration.amount, duration.unit, timeZone);
      return { date: startOfMinute(shifted), rollUnit: null };
    }
  }

  const future = normalized.match(/^(.+?)\s+from\s+(.+)$/);
  if (future) {
    const duration = parseDurationExpression(future[1], "day");
    if (duration) {
      const anchorDate = resolveAnchorOrNow(future[2], now, timeZone);
      if (anchorDate) {
        const shifted = addDuration(anchorDate, duration.amount, duration.unit, timeZone);
        return { date: startOfMinute(shifted), rollUnit: null };
      }
    }
  }

  const past = normalized.match(/^(.+)\s+in\s+the\s+past$/);
  if (past) {
    const duration = parseDurationExpression(past[1], "day");
    if (duration) {
      const date = addDuration(now, -duration.amount, duration.unit, timeZone);
      return { date: startOfMinute(date), rollUnit: null };
    }
  }

  const ago = normalized.match(/^(.+)\s+ago$/);
  if (ago) {
    const duration = parseDurationExpression(ago[1], "day");
    if (duration) {
      const date = addDuration(now, -duration.amount, duration.unit, timeZone);
      return { date: startOfMinute(date), rollUnit: null };
    }
  }

  const inFuture = normalized.match(/^in\s+(.+)$/);
  if (inFuture) {
    const duration = parseDurationExpression(inFuture[1], "day");
    if (duration) {
      const date = addDuration(now, duration.amount, duration.unit, timeZone);
      return { date: startOfMinute(date), rollUnit: null };
    }
  }

  const lookback = normalized.match(/^(?:the\s+)?(?:last|past)\s+(.+)$/);
  if (lookback) {
    const duration = parseDurationExpression(lookback[1], "day");
    if (duration) {
      const date = addDuration(now, -duration.amount, duration.unit, timeZone);
      return { date: startOfMinute(date), rollUnit: null };
    }
  }

  return null;
}

function resolveAnchorOrNow(rawExpression: string, now: Date, timeZone: string): Date | null {
  const normalized = normalizeInput(rawExpression);

  if (normalized === "now") {
    return now;
  }

  const anchor = parseAnchor(normalized, now, timeZone);
  if (anchor) {
    return anchor.kind === "point" ? anchor.date : anchor.start;
  }

  const endpoint = parseDateEndpoint(rawExpression, now, timeZone);
  if (endpoint) {
    const year = endpoint.year ?? now.getFullYear();
    return createLocalDate(year, endpoint.month, endpoint.day, endpoint.hour, endpoint.minute, timeZone);
  }

  return null;
}

function resolveRangeEndpointWithLeftContext(
  rightRaw: string,
  leftRaw: string,
  now: Date,
  timeZone: string,
): ResolvedEndpoint | null {
  const leftMonthMatch = normalizeInput(leftRaw).match(/^([a-z]+)\s+\d/);
  if (!leftMonthMatch) {
    return null;
  }

  const stitched = `${leftMonthMatch[1]} ${normalizeInput(rightRaw)}`;
  return resolveRangeEndpoint(stitched, now, timeZone);
}

function isWeekdayAnchor(normalized: string): boolean {
  if (parseWeekdayToken(normalized) !== null) {
    return true;
  }

  const relative = normalized.match(/^(?:next|this|last|past)\s+([a-z]+)$/);
  return Boolean(relative && parseWeekdayToken(relative[1]) !== null);
}

export function parseExplicitRange(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, factory } = ctx;
  const delimiters = [" to ", " through ", " until ", " - "];

  for (const delimiter of delimiters) {
    if (!normalizedInput.includes(delimiter)) {
      continue;
    }

    const [leftRaw, rightRaw] = normalizedInput.split(delimiter, 2);

    if (!leftRaw || !rightRaw) {
      continue;
    }

    const left = resolveRangeEndpoint(leftRaw, now, timeZone);
    let right = resolveRangeEndpoint(rightRaw, now, timeZone);
    const rightIsBareDay = /^\d{1,2}(?:st|nd|rd|th)?$/.test(normalizeInput(rightRaw));

    if (left && (!right || rightIsBareDay)) {
      const contextual = resolveRangeEndpointWithLeftContext(rightRaw, leftRaw, now, timeZone);
      if (contextual) {
        right = contextual;
      }
    }

    if (!left || !right) {
      continue;
    }

    let startDate = left.date;
    let endDate = right.date;

    if (right.rollUnit && endDate.getTime() < startDate.getTime()) {
      const unit = right.rollUnit === "year" ? "year" : "week";
      while (endDate.getTime() < startDate.getTime()) {
        endDate = addDuration(endDate, 1, unit, timeZone);
      }
    }

    if (endDate.getTime() < startDate.getTime()) {
      const swap = startDate;
      startDate = endDate;
      endDate = swap;
    }

    return factory.createRange({
      startDate,
      endDate,
      suggestionText: normalizedInput,
      confidence: 0.96,
      source: "rule",
    });
  }

  return null;
}

export function parseDurationBeforeAfterAnchor(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, factory } = ctx;
  const match = normalizedInput.match(/^(.+?)\s+(before|after)\s+(.+)$/);

  if (!match) {
    return null;
  }

  const duration = parseDurationExpression(match[1], "day");

  if (!duration) {
    return null;
  }

  const anchor = parseAnchor(normalizeInput(match[3]), now, timeZone);

  if (!anchor) {
    return null;
  }

  const anchorDate = anchor.kind === "point" ? anchor.date : anchor.end;
  const direction = match[2] === "after" ? 1 : -1;
  const shiftedDate = addDuration(
    anchorDate,
    direction * duration.amount,
    duration.unit,
    timeZone,
  );

  return factory.createPoint({
    date: startOfMinute(shiftedDate),
    suggestionText: normalizedInput,
    confidence: 0.93,
    source: "rule",
  });
}

export function parseAnchorPlusDurationPoint(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, factory } = ctx;
  const match = normalizedInput.match(/^(.+?)(?:\s*\+\s*|\s+plus\s+)(.+)$/);

  if (!match) {
    return null;
  }

  const anchorRaw = normalizeInput(match[1]);
  const parsedDuration = parseDurationExpression(match[2], "day");

  if (!parsedDuration) {
    return null;
  }

  const anchor = parseAnchor(anchorRaw, now, timeZone);

  if (!anchor) {
    return null;
  }

  const anchorDate = anchor.kind === "point" ? anchor.date : anchor.end;
  const shiftedDate = addDuration(anchorDate, parsedDuration.amount, parsedDuration.unit, timeZone);

  return factory.createPoint({
    date: startOfMinute(shiftedDate),
    suggestionText: normalizedInput,
    confidence: 0.93,
    source: "rule",
  });
}

export function parseAgoShorthand(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, factory } = ctx;
  const match = normalizedInput.match(/^(.+)\s+ago$/);

  if (!match) {
    return null;
  }

  const duration = parseDurationExpression(match[1], "day");

  if (!duration) {
    return null;
  }

  const date = addDuration(now, -duration.amount, duration.unit, timeZone);

  return factory.createPoint({
    date: startOfMinute(date),
    suggestionText: normalizedInput,
    confidence: 0.9,
    source: "rule",
  });
}

export function parseInDurationPoint(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, factory } = ctx;
  const match = normalizedInput.match(/^in\s+(.+)$/);

  if (!match) {
    return null;
  }

  const duration = parseDurationExpression(match[1], "day");

  if (!duration) {
    return null;
  }

  const date = addDuration(now, duration.amount, duration.unit, timeZone);

  return factory.createPoint({
    date: startOfMinute(date),
    suggestionText: normalizedInput,
    confidence: 0.9,
    source: "rule",
  });
}

export function parseBoundaryOfPeriod(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, parseContext, factory } = ctx;
  const match = normalizedInput.match(
    /^(start|beginning|end)\s+of\s+(?:the\s+)?(?:(this|next|last|current)\s+)?(week|month|year)$/,
  );

  if (!match) {
    return null;
  }

  const boundary: PeriodBoundary = match[1] === "end" ? "end" : "start";
  const scope = normalizeScope(match[2]);
  const unit = match[3] as PeriodUnit;

  const reference = shiftReferenceByScope(now, scope, unit, timeZone);
  const date = resolveBoundaryDate(reference, unit, boundary, parseContext.weekStart, timeZone);

  return factory.createPoint({
    date,
    suggestionText: normalizedInput,
    confidence: 0.95,
    source: "rule",
  });
}

export function parseThisNextLastPeriod(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, parseContext, factory } = ctx;
  const match = normalizedInput.match(/^(this|next|last)\s+(week|month|year)$/);

  if (!match) {
    return null;
  }

  const scope = match[1] as PeriodScope;
  const unit = match[2] as PeriodUnit;

  const reference = shiftReferenceByScope(now, scope, unit, timeZone);
  const startDate = resolveBoundaryDate(reference, unit, "start", parseContext.weekStart, timeZone);
  const endDate = resolveBoundaryDate(reference, unit, "end", parseContext.weekStart, timeZone);

  return factory.createRange({
    startDate,
    endDate,
    suggestionText: normalizedInput,
    confidence: 0.95,
    source: "rule",
  });
}

function normalizeScope(rawScope: string | undefined): PeriodScope {
  if (rawScope === "next" || rawScope === "last") {
    return rawScope;
  }
  return "this";
}

function shiftReferenceByScope(
  now: Date,
  scope: PeriodScope,
  unit: PeriodUnit,
  timeZone: string,
): Date {
  if (scope === "this") {
    return now;
  }
  const direction = scope === "next" ? 1 : -1;
  return addDuration(now, direction, unit, timeZone);
}

function resolveBoundaryDate(
  reference: Date,
  unit: PeriodUnit,
  boundary: PeriodBoundary,
  weekStart: "sunday" | "monday",
  timeZone: string,
): Date {
  if (unit === "week") {
    return boundary === "start"
      ? startOfWeek(reference, weekStart, timeZone)
      : endOfWeek(reference, weekStart, timeZone);
  }
  if (unit === "month") {
    return boundary === "start" ? startOfMonth(reference, timeZone) : endOfMonth(reference, timeZone);
  }
  return boundary === "start" ? startOfYear(reference, timeZone) : endOfYear(reference, timeZone);
}

export function parseLookbackWindow(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, factory } = ctx;
  const match = normalizedInput.match(/^(?:the\s+)?(?:last|past)\s+(.+)$/);

  if (!match) {
    return null;
  }

  const parsedDuration = parseDurationExpression(match[1], "day");

  if (!parsedDuration) {
    return null;
  }

  const startDate = addDuration(now, -parsedDuration.amount, parsedDuration.unit, timeZone);

  return factory.createRange({
    startDate: startOfMinute(startDate),
    endDate: startOfMinute(now),
    suggestionText: normalizedInput,
    confidence: 0.9,
    source: "rule",
  });
}

export function parseAnchorRange(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, factory } = ctx;
  const anchor = parseAnchor(normalizedInput, now, timeZone);

  if (!anchor || anchor.kind !== "range") {
    return null;
  }

  return factory.createRange({
    startDate: anchor.start,
    endDate: anchor.end,
    suggestionText: normalizedInput,
    confidence: 0.92,
    source: "rule",
  });
}

export function parsePastDurationPoint(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, factory } = ctx;
  const match = normalizedInput.match(/^(.+)\s+in\s+the\s+past$/);

  if (!match) {
    return null;
  }

  const parsedDuration = parseDurationExpression(match[1], "day");

  if (!parsedDuration) {
    return null;
  }

  const date = addDuration(now, -parsedDuration.amount, parsedDuration.unit, timeZone);

  return factory.createPoint({
    date: startOfMinute(date),
    suggestionText: normalizedInput,
    confidence: 0.9,
    source: "rule",
  });
}

export function parseFutureDurationPoint(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, factory } = ctx;
  const match = normalizedInput.match(/^(.+?)\s+from\s+(.+)$/);

  if (!match) {
    return null;
  }

  const parsedDuration = parseDurationExpression(match[1], "day");

  if (!parsedDuration) {
    return null;
  }

  const anchorDate = resolveAnchorOrNow(match[2], now, timeZone);

  if (!anchorDate) {
    return null;
  }

  const date = addDuration(anchorDate, parsedDuration.amount, parsedDuration.unit, timeZone);

  return factory.createPoint({
    date: startOfMinute(date),
    suggestionText: normalizedInput,
    confidence: 0.9,
    source: "rule",
  });
}

export function parsePointValue(ctx: RuleContext): CandidateWithSuggestion | null {
  const { normalizedInput, now, timeZone, factory } = ctx;
  const anchor = parseAnchor(normalizedInput, now, timeZone);

  if (anchor && anchor.kind === "point") {
    return factory.createPoint({
      date: anchor.date,
      suggestionText: anchor.suggestionText,
      confidence: 0.97,
      source: "rule",
    });
  }

  const endpoint = parseDateEndpoint(normalizedInput, now, timeZone);

  if (!endpoint) {
    return null;
  }

  const year = endpoint.year ?? now.getFullYear();
  const date = createLocalDate(year, endpoint.month, endpoint.day, endpoint.hour, endpoint.minute, timeZone);

  return factory.createPoint({
    date,
    suggestionText: normalizedInput,
    confidence: 0.95,
    source: "rule",
  });
}
