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
  startOfDay,
  withDayInMonth,
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
  const relativeDayOffsets: Record<string, number> = {
    today: 0,
    tomorrow: 1,
    yesterday: -1,
    "day after tomorrow": 2,
    "the day after tomorrow": 2,
    "day before yesterday": -2,
    "the day before yesterday": -2,
  };

  if (normalizedInput in relativeDayOffsets) {
    const offset = relativeDayOffsets[normalizedInput];
    const base = startOfDay(now, timeZone);
    const shifted = offset === 0 ? base : addDuration(base, offset, "day", timeZone);
    return {
      kind: "point",
      date: shifted,
      suggestionText: normalizedInput,
    };
  }

  const relativeWithTime = normalizedInput.match(/^(today|tomorrow|yesterday)\s+([\d:]+(?:\s*(?:am|pm))?)$/);
  if (relativeWithTime) {
    const time = parseTimeToken(relativeWithTime[2]);

    if (!time) {
      return null;
    }

    const offset = relativeDayOffsets[relativeWithTime[1]] ?? 0;
    const baseDate = addDuration(startOfDay(now, timeZone), offset, "day", timeZone);
    const date = createLocalDate(
      baseDate.getFullYear(),
      baseDate.getMonth() + 1,
      baseDate.getDate(),
      time.hour,
      time.minute,
      timeZone,
    );

    return {
      kind: "point",
      date,
      suggestionText: normalizedInput,
    };
  }

  const ordinalDay = normalizedInput.match(/^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)$/);
  if (ordinalDay) {
    const day = Number(ordinalDay[1]);
    const thisMonth = withDayInMonth(now, day, timeZone);
    const todayStart = startOfDay(now, timeZone);
    if (thisMonth && thisMonth.getTime() >= todayStart.getTime()) {
      return {
        kind: "point",
        date: thisMonth,
        suggestionText: normalizedInput,
      };
    }
    const nextMonthReference = addDuration(todayStart, 1, "month", timeZone);
    const nextMonthDate = withDayInMonth(nextMonthReference, day, timeZone);
    if (nextMonthDate) {
      return {
        kind: "point",
        date: nextMonthDate,
        suggestionText: normalizedInput,
      };
    }
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
