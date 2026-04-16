import { getLaborDayDate, getNextAnnualDate } from "../utils/date-utils";
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
    aliases: ["new years", "new years day", "new yearsday", "new year", "new year's", "new year's day"],
    resolve: (now, timeZone) => getNextAnnualDate(now, 1, 1, timeZone),
  },
  {
    aliases: ["labor day"],
    resolve: (now, timeZone) => getLaborDayDate(now, timeZone),
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
