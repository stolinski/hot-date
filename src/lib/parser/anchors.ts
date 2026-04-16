import {
  addDuration,
  createLocalDate,
  getNextWeekday,
  getNextWeekdayInMonthAfterNow,
  getPreviousWeekdayBeforeDate,
  getWeekendBeforeDate,
  parseMonthToken,
  parseTimeToken,
  parseWeekdayToken,
} from "../utils/date-utils";
import { parseDateEndpoint } from "./endpoints";
import { resolveHolidayDate } from "./holidays";

export interface AnchorPoint {
  kind: "point";
  date: Date;
  suggestionText: string;
}

export interface AnchorRange {
  kind: "range";
  start: Date;
  end: Date;
  suggestionText: string;
}

export type AnchorValue = AnchorPoint | AnchorRange;

export function parseAnchor(normalizedInput: string, now: Date, timeZone: string): AnchorValue | null {
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

  const holidayAnchor = parseHolidayAnchor(normalizedInput, now, timeZone);
  if (holidayAnchor) {
    return holidayAnchor;
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

  const relativeWeekday = normalizedInput.match(/^(?:next|this)\s+([a-z]+)$/);
  if (relativeWeekday) {
    const weekday = parseWeekdayToken(relativeWeekday[1]);
    if (weekday !== null) {
      return {
        kind: "point",
        date: getNextWeekday(now, weekday, timeZone),
        suggestionText: normalizedInput,
      };
    }
  }

  const pastWeekday = normalizedInput.match(/^(?:last|past)\s+([a-z]+)$/);
  if (pastWeekday) {
    const weekday = parseWeekdayToken(pastWeekday[1]);
    if (weekday !== null) {
      return {
        kind: "point",
        date: getPreviousWeekdayBeforeDate(now, weekday, timeZone),
        suggestionText: normalizedInput,
      };
    }
  }

  const bareWeekday = parseWeekdayToken(normalizedInput);
  if (bareWeekday !== null) {
    return {
      kind: "point",
      date: getNextWeekday(now, bareWeekday, timeZone),
      suggestionText: normalizedInput,
    };
  }

  const endpoint = parseDateEndpoint(normalizedInput, now, timeZone);
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

function parseHolidayAnchor(normalizedInput: string, now: Date, timeZone: string): AnchorValue | null {
  const weekendMatch = normalizedInput.match(/^(.+)\s+weekend$/);
  if (weekendMatch) {
    const holidayDate = resolveHolidayDate(weekendMatch[1], now, timeZone);

    if (holidayDate) {
      const weekend = getWeekendBeforeDate(holidayDate, timeZone);
      return {
        kind: "range",
        start: weekend.start,
        end: weekend.end,
        suggestionText: normalizedInput,
      };
    }
  }

  const weekdayRelativeHoliday = normalizedInput.match(/^([a-z]+)\s+(before|after)\s+(.+)$/);
  if (weekdayRelativeHoliday) {
    const weekday = parseWeekdayToken(weekdayRelativeHoliday[1]);
    const relation = weekdayRelativeHoliday[2];
    const holidayDate = resolveHolidayDate(weekdayRelativeHoliday[3], now, timeZone);

    if (weekday !== null && holidayDate) {
      const date =
        relation === "before"
          ? getPreviousWeekdayBeforeDate(holidayDate, weekday, timeZone)
          : getNextWeekday(holidayDate, weekday, timeZone);

      return {
        kind: "point",
        date,
        suggestionText: normalizedInput,
      };
    }
  }

  const holidayDate = resolveHolidayDate(normalizedInput, now, timeZone);
  if (holidayDate) {
    return {
      kind: "point",
      date: holidayDate,
      suggestionText: normalizedInput,
    };
  }

  return null;
}
