import {
  addDuration,
  createLocalDate,
  parseMonthToken,
  parseTimeToken,
  parseYearToken,
  toYmd,
} from "../utils/date-utils";
import { normalizeInput, stripOrdinalSuffix } from "../utils/string-utils";

export interface ParsedEndpoint {
  year?: number;
  month: number;
  day: number;
  hasYear: boolean;
  hour: number;
  minute: number;
}

export function parseDateEndpoint(rawExpression: string, now: Date, timeZone: string): ParsedEndpoint | null {
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

  const relativeDate = expression.match(/^(today|tomorrow|yesterday)(?:\s+([\d:]+(?:\s*(?:am|pm))?))?$/);
  if (relativeDate) {
    const offset = relativeDate[1] === "yesterday" ? -1 : relativeDate[1] === "tomorrow" ? 1 : 0;
    const baseDate = offset === 0 ? new Date(now.getTime()) : addDuration(now, offset, "day", timeZone);
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

export function isValidMonthDay(year: number, month: number, day: number, timeZone: string): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  try {
    const date = createLocalDate(year, month, day, 0, 0, timeZone);
    const expected = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return toYmd(date, timeZone) === expected;
  } catch {
    return false;
  }
}
