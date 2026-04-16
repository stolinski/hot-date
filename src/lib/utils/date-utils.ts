import { Temporal } from "@js-temporal/polyfill";
import { parseCountToken } from "./string-utils";

export type DurationUnit = "hour" | "day" | "week" | "month" | "year";

export interface ParsedDurationExpression {
  amount: number;
  unit: DurationUnit;
}

const SYSTEM_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const MONTH_ALIASES: Record<string, number> = {
  january: 1,
  jan: 1,
  j: 1,
  february: 2,
  feb: 2,
  f: 2,
  march: 3,
  mar: 3,
  m: 3,
  april: 4,
  apr: 4,
  a: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  s: 9,
  october: 10,
  oct: 10,
  o: 10,
  november: 11,
  nov: 11,
  n: 11,
  december: 12,
  dec: 12,
  d: 12,
};

const WEEKDAY_ALIASES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function toZonedDateTime(date: Date, timeZone = SYSTEM_TIME_ZONE): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone);
}

function toDate(zonedDateTime: Temporal.ZonedDateTime): Date {
  return new Date(zonedDateTime.epochMilliseconds);
}

function toTemporalWeekday(weekday: number): number {
  return weekday === 0 ? 7 : weekday;
}

export function parseMonthToken(rawToken: string): number | null {
  const token = rawToken.trim().toLowerCase().replace(/\.$/, "");
  return MONTH_ALIASES[token] ?? null;
}

export function parseWeekdayToken(rawToken: string): number | null {
  const token = rawToken.trim().toLowerCase().replace(/\.$/, "");
  return WEEKDAY_ALIASES[token] ?? null;
}

export function parseYearToken(rawToken: string): number | null {
  if (!/^\d{2,4}$/.test(rawToken)) {
    return null;
  }

  const yearNumber = Number(rawToken);

  if (rawToken.length === 4) {
    return yearNumber;
  }

  return yearNumber <= 49 ? 2000 + yearNumber : 1900 + yearNumber;
}

export function parseTimeToken(rawToken: string): { hour: number; minute: number } | null {
  const token = rawToken.trim().toLowerCase();
  const match = token.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return null;
    }

    if (meridiem === "am") {
      hour = hour === 12 ? 0 : hour;
    } else {
      hour = hour === 12 ? 12 : hour + 12;
    }
  } else if (hour > 23) {
    return null;
  }

  return { hour, minute };
}

export function normalizeDurationUnit(rawUnit: string): DurationUnit | null {
  const token = rawUnit.trim().toLowerCase().replace(/[.,]+$/g, "");
  const singular = token.replace(/s$/, "");

  if (singular === "hour" || singular === "hr" || singular === "h") {
    return "hour";
  }

  if (singular === "day" || singular === "d") {
    return "day";
  }

  if (singular === "week" || singular === "wk" || singular === "w") {
    return "week";
  }

  if (singular === "month" || singular === "mo" || singular === "mth") {
    return "month";
  }

  if (singular === "year" || singular === "yr" || singular === "y") {
    return "year";
  }

  return null;
}

export function parseDurationExpression(rawExpression: string, defaultUnit: DurationUnit = "day"): ParsedDurationExpression | null {
  const expression = rawExpression.trim().toLowerCase().replace(/[.,]+$/g, "");

  if (!expression) {
    return null;
  }

  const compactMatch = expression.match(/^([a-z]+|\d+)([a-z]+)$/i);
  if (compactMatch) {
    const amount = parseCountToken(compactMatch[1]);
    const unit = normalizeDurationUnit(compactMatch[2]);

    if (amount && unit) {
      return { amount, unit };
    }
  }

  const parts = expression.split(/\s+/);
  if (parts.length === 1) {
    const amount = parseCountToken(parts[0] ?? "");
    if (amount) {
      return {
        amount,
        unit: defaultUnit,
      };
    }

    return null;
  }

  const amount = parseCountToken(parts[0] ?? "");
  const unit = normalizeDurationUnit(parts.slice(1).join(" "));

  if (!amount || !unit) {
    return null;
  }

  return {
    amount,
    unit,
  };
}

export function createLocalDate(year: number, month: number, day: number, hour = 0, minute = 0, timeZone = SYSTEM_TIME_ZONE): Date {
  const zonedDateTime = Temporal.ZonedDateTime.from({
    timeZone,
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });

  return toDate(zonedDateTime);
}

export function toUtcIso(date: Date): string {
  return toZonedDateTime(date, "UTC").toInstant().toString();
}

export function toYmd(date: Date, timeZone = SYSTEM_TIME_ZONE): string {
  const zonedDateTime = toZonedDateTime(date, timeZone);
  return `${zonedDateTime.year}-${String(zonedDateTime.month).padStart(2, "0")}-${String(zonedDateTime.day).padStart(2, "0")}`;
}

export function addDuration(inputDate: Date, amount: number, unit: DurationUnit, timeZone = SYSTEM_TIME_ZONE): Date {
  const zonedDateTime = toZonedDateTime(inputDate, timeZone);

  if (unit === "hour") {
    return toDate(zonedDateTime.add({ hours: amount }));
  }

  if (unit === "day") {
    return toDate(zonedDateTime.add({ days: amount }));
  }

  if (unit === "week") {
    return toDate(zonedDateTime.add({ weeks: amount }));
  }

  if (unit === "month") {
    return toDate(zonedDateTime.add({ months: amount }));
  }

  return toDate(zonedDateTime.add({ years: amount }));
}

export function formatPointLabel(date: Date, timeZone = SYSTEM_TIME_ZONE): string {
  const zonedDateTime = toZonedDateTime(date, timeZone);
  const hasTime = zonedDateTime.hour !== 0 || zonedDateTime.minute !== 0;

  const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });

  if (!hasTime) {
    return fullDateFormatter.format(date);
  }

  const fullDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  return fullDateTimeFormatter.format(date);
}

export function formatRangeLabel(startDate: Date, endDate: Date, timeZone = SYSTEM_TIME_ZONE): string {
  const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });

  const startLabel = fullDateFormatter.format(startDate);
  const endLabel = fullDateFormatter.format(endDate);
  const daySpan = Math.max(0, Math.round((startOfDay(endDate, timeZone).getTime() - startOfDay(startDate, timeZone).getTime()) / 86_400_000));

  if (daySpan > 0) {
    return `${startLabel} - ${endLabel} (${daySpan} days)`;
  }

  return `${startLabel} - ${endLabel}`;
}

export function startOfDay(inputDate: Date, timeZone = SYSTEM_TIME_ZONE): Date {
  const zonedDateTime = toZonedDateTime(inputDate, timeZone).with({
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  });

  return toDate(zonedDateTime);
}

export function getNextWeekday(referenceDate: Date, weekday: number, timeZone = SYSTEM_TIME_ZONE): Date {
  const normalizedReference = startOfDay(referenceDate, timeZone);
  const zonedDateTime = toZonedDateTime(normalizedReference, timeZone);
  const target = toTemporalWeekday(weekday);
  const dayDistance = (target - zonedDateTime.dayOfWeek + 7) % 7;
  const offset = dayDistance === 0 ? 7 : dayDistance;

  return toDate(zonedDateTime.add({ days: offset }));
}

export function getPreviousWeekdayBeforeDate(referenceDate: Date, weekday: number, timeZone = SYSTEM_TIME_ZONE): Date {
  const normalizedReference = startOfDay(referenceDate, timeZone);
  const zonedDateTime = toZonedDateTime(normalizedReference, timeZone);
  const target = toTemporalWeekday(weekday);
  let dayDistance = (zonedDateTime.dayOfWeek - target + 7) % 7;

  if (dayDistance === 0) {
    dayDistance = 7;
  }

  return toDate(zonedDateTime.subtract({ days: dayDistance }));
}

export function getFirstWeekdayInMonth(year: number, month: number, weekday: number, timeZone = SYSTEM_TIME_ZONE): Date {
  let zonedDateTime = Temporal.ZonedDateTime.from({
    timeZone,
    year,
    month,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  const target = toTemporalWeekday(weekday);

  while (zonedDateTime.dayOfWeek !== target) {
    zonedDateTime = zonedDateTime.add({ days: 1 });
  }

  return toDate(zonedDateTime);
}

export function getNextWeekdayInMonthAfterNow(referenceDate: Date, month: number, weekday: number, timeZone = SYSTEM_TIME_ZONE): Date {
  const now = toZonedDateTime(referenceDate, timeZone);
  let year = now.year;

  if (month < now.month) {
    year += 1;
  }

  if (month === now.month) {
    let pointer = now.add({ days: 1 }).with({
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
      microsecond: 0,
      nanosecond: 0,
    });

    const target = toTemporalWeekday(weekday);
    while (pointer.month === month) {
      if (pointer.dayOfWeek === target) {
        return toDate(pointer);
      }
      pointer = pointer.add({ days: 1 });
    }

    year += 1;
  }

  return getFirstWeekdayInMonth(year, month, weekday, timeZone);
}

export function getFridayBeforeChristmas(referenceDate: Date, timeZone = SYSTEM_TIME_ZONE): Date {
  const now = toZonedDateTime(referenceDate, timeZone);
  let year = now.year;
  let christmas = Temporal.ZonedDateTime.from({
    timeZone,
    year,
    month: 12,
    day: 25,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  if (christmas.epochMilliseconds <= now.epochMilliseconds) {
    year += 1;
    christmas = Temporal.ZonedDateTime.from({
      timeZone,
      year,
      month: 12,
      day: 25,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
  }

  const delta = (christmas.dayOfWeek - 5 + 7) % 7;
  const rollback = delta === 0 ? 7 : delta;
  return toDate(christmas.subtract({ days: rollback }));
}

export function getNextAnnualDate(referenceDate: Date, month: number, day: number, timeZone = SYSTEM_TIME_ZONE): Date {
  const now = toZonedDateTime(referenceDate, timeZone);
  let year = now.year;

  let candidate = Temporal.ZonedDateTime.from({
    timeZone,
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  if (candidate.epochMilliseconds <= now.epochMilliseconds) {
    year += 1;
    candidate = Temporal.ZonedDateTime.from({
      timeZone,
      year,
      month,
      day,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
  }

  return toDate(candidate);
}

export function getLaborDayDate(referenceDate: Date, timeZone = SYSTEM_TIME_ZONE): Date {
  const now = toZonedDateTime(referenceDate, timeZone);
  let year = now.year;
  let laborDay = toZonedDateTime(getFirstWeekdayInMonth(year, 9, 1, timeZone), timeZone);

  if (laborDay.epochMilliseconds <= now.epochMilliseconds) {
    year += 1;
    laborDay = toZonedDateTime(getFirstWeekdayInMonth(year, 9, 1, timeZone), timeZone);
  }

  return toDate(laborDay);
}

export function startOfWeek(
  referenceDate: Date,
  weekStart: "sunday" | "monday",
  timeZone = SYSTEM_TIME_ZONE,
): Date {
  const zonedDateTime = toZonedDateTime(startOfDay(referenceDate, timeZone), timeZone);
  const targetFirstDay = weekStart === "monday" ? 1 : 7;
  const daysBack = (zonedDateTime.dayOfWeek - targetFirstDay + 7) % 7;
  return toDate(zonedDateTime.subtract({ days: daysBack }));
}

export function endOfWeek(
  referenceDate: Date,
  weekStart: "sunday" | "monday",
  timeZone = SYSTEM_TIME_ZONE,
): Date {
  const start = startOfWeek(referenceDate, weekStart, timeZone);
  return addDuration(start, 6, "day", timeZone);
}

export function startOfMonth(referenceDate: Date, timeZone = SYSTEM_TIME_ZONE): Date {
  const zonedDateTime = toZonedDateTime(referenceDate, timeZone).with({
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  });
  return toDate(zonedDateTime);
}

export function endOfMonth(referenceDate: Date, timeZone = SYSTEM_TIME_ZONE): Date {
  const zonedDateTime = toZonedDateTime(referenceDate, timeZone);
  return toDate(
    zonedDateTime.with({
      day: zonedDateTime.daysInMonth,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
      microsecond: 0,
      nanosecond: 0,
    }),
  );
}

export function startOfYear(referenceDate: Date, timeZone = SYSTEM_TIME_ZONE): Date {
  const zonedDateTime = toZonedDateTime(referenceDate, timeZone).with({
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  });
  return toDate(zonedDateTime);
}

export function endOfYear(referenceDate: Date, timeZone = SYSTEM_TIME_ZONE): Date {
  const zonedDateTime = toZonedDateTime(referenceDate, timeZone).with({
    month: 12,
    day: 31,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  });
  return toDate(zonedDateTime);
}

export function getWeekendBeforeDate(referenceDate: Date, timeZone = SYSTEM_TIME_ZONE): { start: Date; end: Date } {
  const normalizedReference = startOfDay(referenceDate, timeZone);
  const zonedDateTime = toZonedDateTime(normalizedReference, timeZone);
  const daysBackToSunday = zonedDateTime.dayOfWeek % 7;
  const sunday = zonedDateTime.subtract({ days: daysBackToSunday });
  const saturday = sunday.subtract({ days: 1 });

  return {
    start: toDate(saturday),
    end: toDate(sunday),
  };
}
