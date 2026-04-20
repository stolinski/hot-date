import {
  addDuration,
  getLaborDayDate,
  getNextAnnualDate,
  getNextAnnualEasterDate,
  getNextAnnualLastWeekday,
  getNextAnnualNthWeekday,
} from "../utils/date-utils";
import { normalizeInput } from "../utils/string-utils";

interface HolidayAlias {
  aliases: string[];
  resolve: (now: Date, timeZone: string) => Date;
}

const HOLIDAY_ALIASES: HolidayAlias[] = [
  {
    aliases: ["christmas", "xmas"],
    resolve: (now, timeZone) => getNextAnnualDate(now, 12, 25, timeZone),
  },
  {
    aliases: ["christmas eve", "xmas eve"],
    resolve: (now, timeZone) => getNextAnnualDate(now, 12, 24, timeZone),
  },
  {
    aliases: ["new years", "new years day", "new yearsday", "new year", "new year's", "new year's day"],
    resolve: (now, timeZone) => getNextAnnualDate(now, 1, 1, timeZone),
  },
  {
    aliases: ["new years eve", "new year's eve", "nye"],
    resolve: (now, timeZone) => getNextAnnualDate(now, 12, 31, timeZone),
  },
  {
    aliases: ["labor day"],
    resolve: (now, timeZone) => getLaborDayDate(now, timeZone),
  },
  {
    aliases: ["memorial day"],
    resolve: (now, timeZone) => getNextAnnualLastWeekday(now, 5, 1, timeZone),
  },
  {
    aliases: ["thanksgiving", "thanksgiving day", "turkey day"],
    resolve: (now, timeZone) => getNextAnnualNthWeekday(now, 11, 4, 4, timeZone),
  },
  {
    aliases: ["mother's day", "mothers day"],
    resolve: (now, timeZone) => getNextAnnualNthWeekday(now, 5, 0, 2, timeZone),
  },
  {
    aliases: ["father's day", "fathers day"],
    resolve: (now, timeZone) => getNextAnnualNthWeekday(now, 6, 0, 3, timeZone),
  },
  {
    aliases: ["halloween"],
    resolve: (now, timeZone) => getNextAnnualDate(now, 10, 31, timeZone),
  },
  {
    aliases: ["easter", "easter sunday", "easter day"],
    resolve: (now, timeZone) => getNextAnnualEasterDate(now, timeZone),
  },
  {
    aliases: ["good friday"],
    resolve: (now, timeZone) =>
      addDuration(getNextAnnualEasterDate(now, timeZone), -2, "day", timeZone),
  },
  {
    aliases: ["easter monday"],
    resolve: (now, timeZone) =>
      addDuration(getNextAnnualEasterDate(now, timeZone), 1, "day", timeZone),
  },
  {
    aliases: ["palm sunday"],
    resolve: (now, timeZone) =>
      addDuration(getNextAnnualEasterDate(now, timeZone), -7, "day", timeZone),
  },
  {
    aliases: ["valentine's day", "valentines day", "valentines", "valentine's"],
    resolve: (now, timeZone) => getNextAnnualDate(now, 2, 14, timeZone),
  },
  {
    aliases: ["july 4th", "july 4", "4th of july", "fourth of july", "independence day"],
    resolve: (now, timeZone) => getNextAnnualDate(now, 7, 4, timeZone),
  },
];

function normalizeHolidayExpression(value: string): string {
  return normalizeInput(value).replace(/['’]/g, "").replace(/\s+/g, " ").trim();
}

export function resolveHolidayDate(rawExpression: string, now: Date, timeZone: string): Date | null {
  const normalized = normalizeHolidayExpression(rawExpression);

  for (const holiday of HOLIDAY_ALIASES) {
    if (holiday.aliases.some((alias) => normalizeHolidayExpression(alias) === normalized)) {
      return holiday.resolve(now, timeZone);
    }
  }

  return null;
}
