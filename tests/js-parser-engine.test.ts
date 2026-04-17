import { describe, expect, it } from "vitest";
import { JsParserEngine } from "../src/lib/parser/js-parser-engine";
import { CHALLENGE_PHRASES } from "../src/lib/parser/challenge-phrases";
import type { ParseContext } from "../src/lib/parser/parser-types";

process.env.TZ = "UTC";

const context: ParseContext = {
  nowIso: "2026-04-15T12:00:00.000Z",
  timezone: "UTC",
  locale: "en-US",
  weekStart: "sunday",
  productRules: {
    allowPast: true,
    defaultTime: { hour: 9, minute: 0 },
    timeOnlyPolicy: "today_if_future_else_tomorrow",
  },
};

describe("JsParserEngine", () => {
  const parser = new JsParserEngine();

  it("parses short numeric date variants", () => {
    const variants = ["3/1/86", "03/01/86", "3/01/1986"];

    for (const input of variants) {
      const result = parser.parse(input, context);
      expect(result.status).toBe("valid");
      expect(result.valueKind).toBe("point");
      expect(result.canonicalValue).toBe("1986-03-01T00:00:00Z");
    }
  });

  it("parses text month variants", () => {
    const variants = ["march 1st 1986", "mar 1 86", "m 1 86"];

    for (const input of variants) {
      const result = parser.parse(input, context);
      expect(result.status).toBe("valid");
      expect(result.valueKind).toBe("point");
      expect(result.canonicalValue).toBe("1986-03-01T00:00:00Z");
    }
  });

  it("parses explicit ranges as UTC interval strings", () => {
    const result = parser.parse("march 14 to march 28", context);
    expect(result.status).toBe("valid");
    expect(result.valueKind).toBe("range");
    expect(result.canonicalValue).toBe("2026-03-14T00:00:00Z/2026-03-28T00:00:00Z");
  });

  it("treats plus arithmetic as point math", () => {
    const result = parser.parse("today + 9 days", context);
    expect(result.status).toBe("valid");
    expect(result.valueKind).toBe("point");
    expect(result.canonicalValue).toBe("2026-04-24T00:00:00Z");
  });

  it("supports compact and unitless plus duration syntax", () => {
    const compact = parser.parse("xmas + 2days", context);
    expect(compact.status).toBe("valid");
    expect(compact.valueKind).toBe("point");
    expect(compact.canonicalValue).toBe("2026-12-27T00:00:00Z");

    const noSpace = parser.parse("xmas +2days", context);
    expect(noSpace.status).toBe("valid");
    expect(noSpace.valueKind).toBe("point");
    expect(noSpace.canonicalValue).toBe("2026-12-27T00:00:00Z");

    const unitless = parser.parse("xmas + 2", context);
    expect(unitless.status).toBe("valid");
    expect(unitless.valueKind).toBe("point");
    expect(unitless.canonicalValue).toBe("2026-12-27T00:00:00Z");
  });

  it("uses range end as anchor for range plus arithmetic", () => {
    const result = parser.parse("labor day weekend + a week", context);
    expect(result.status).toBe("valid");
    expect(result.valueKind).toBe("point");
    expect(result.canonicalValue).toBe("2026-09-13T00:00:00Z");
  });

  it("parses the expanded holiday set", () => {
    const thanksgiving = parser.parse("thanksgiving", context);
    expect(thanksgiving.status).toBe("valid");
    expect(thanksgiving.canonicalValue).toBe("2026-11-26T00:00:00Z");

    const halloween = parser.parse("halloween", context);
    expect(halloween.canonicalValue).toBe("2026-10-31T00:00:00Z");

    const valentines = parser.parse("valentine's day", context);
    expect(valentines.canonicalValue).toBe("2027-02-14T00:00:00Z");

    const mothersDay = parser.parse("mother's day", context);
    expect(mothersDay.canonicalValue).toBe("2026-05-10T00:00:00Z");

    const fathersDay = parser.parse("father's day", context);
    expect(fathersDay.canonicalValue).toBe("2026-06-21T00:00:00Z");

    const memorialDay = parser.parse("memorial day", context);
    expect(memorialDay.canonicalValue).toBe("2026-05-25T00:00:00Z");

    const independenceDay = parser.parse("4th of july", context);
    expect(independenceDay.canonicalValue).toBe("2026-07-04T00:00:00Z");

    const christmasEve = parser.parse("christmas eve", context);
    expect(christmasEve.canonicalValue).toBe("2026-12-24T00:00:00Z");

    const newYearsEve = parser.parse("new year's eve", context);
    expect(newYearsEve.canonicalValue).toBe("2026-12-31T00:00:00Z");
  });

  it("parses christmas and new years holiday anchors", () => {
    const christmas = parser.parse("christmas", context);
    expect(christmas.status).toBe("valid");
    expect(christmas.valueKind).toBe("point");
    expect(christmas.canonicalValue).toBe("2026-12-25T00:00:00Z");

    const newYears = parser.parse("new years", context);
    expect(newYears.status).toBe("valid");
    expect(newYears.valueKind).toBe("point");
    expect(newYears.canonicalValue).toBe("2027-01-01T00:00:00Z");

    const newYearsApostrophe = parser.parse("new year's day", context);
    expect(newYearsApostrophe.status).toBe("valid");
    expect(newYearsApostrophe.valueKind).toBe("point");
    expect(newYearsApostrophe.canonicalValue).toBe("2027-01-01T00:00:00Z");
  });

  it("parses holiday style phrases generically", () => {
    const fridayBeforeChristmas = parser.parse("fri before christmas", context);
    expect(fridayBeforeChristmas.status).toBe("valid");
    expect(fridayBeforeChristmas.valueKind).toBe("point");
    expect(fridayBeforeChristmas.canonicalValue).toBe("2026-12-18T00:00:00Z");

    const laborDayWeekend = parser.parse("labor day weekend", context);
    expect(laborDayWeekend.status).toBe("valid");
    expect(laborDayWeekend.valueKind).toBe("range");
    expect(laborDayWeekend.canonicalValue).toBe("2026-09-05T00:00:00Z/2026-09-06T00:00:00Z");
  });

  it("parses relative lookback windows", () => {
    const result = parser.parse("the last two weeks", context);
    expect(result.status).toBe("valid");
    expect(result.valueKind).toBe("range");
    expect(result.canonicalValue).toBe("2026-04-01T12:00:00Z/2026-04-15T12:00:00Z");
  });

  it("parses weekday-anchored ranges", () => {
    const toDelimiter = parser.parse("next monday to next friday", context);
    expect(toDelimiter.status).toBe("valid");
    expect(toDelimiter.valueKind).toBe("range");
    expect(toDelimiter.canonicalValue).toBe("2026-04-20T00:00:00Z/2026-04-24T00:00:00Z");

    const dashDelimiter = parser.parse("next monday - next friday", context);
    expect(dashDelimiter.canonicalValue).toBe("2026-04-20T00:00:00Z/2026-04-24T00:00:00Z");

    const bareWeekdays = parser.parse("friday to monday", context);
    expect(bareWeekdays.status).toBe("valid");
    expect(bareWeekdays.canonicalValue).toBe("2026-04-17T00:00:00Z/2026-04-20T00:00:00Z");
  });

  it("uses weekday anchors in arithmetic", () => {
    const result = parser.parse("next monday + 2 weeks", context);
    expect(result.status).toBe("valid");
    expect(result.valueKind).toBe("point");
    expect(result.canonicalValue).toBe("2026-05-04T00:00:00Z");
  });

  it("parses yesterday and day-after/before variants", () => {
    const yesterday = parser.parse("yesterday", context);
    expect(yesterday.status).toBe("valid");
    expect(yesterday.canonicalValue).toBe("2026-04-14T00:00:00Z");

    const dayAfter = parser.parse("day after tomorrow", context);
    expect(dayAfter.canonicalValue).toBe("2026-04-17T00:00:00Z");

    const dayBefore = parser.parse("the day before yesterday", context);
    expect(dayBefore.canonicalValue).toBe("2026-04-13T00:00:00Z");

    const yesterdayRange = parser.parse("yesterday to tomorrow", context);
    expect(yesterdayRange.canonicalValue).toBe("2026-04-14T00:00:00Z/2026-04-16T00:00:00Z");
  });

  it("parses 'N ago' shorthand", () => {
    const daysAgo = parser.parse("3 days ago", context);
    expect(daysAgo.status).toBe("valid");
    expect(daysAgo.canonicalValue).toBe("2026-04-12T12:00:00Z");

    const weekAgo = parser.parse("a week ago", context);
    expect(weekAgo.canonicalValue).toBe("2026-04-08T12:00:00Z");

    const monthsAgo = parser.parse("2 months ago to today", context);
    expect(monthsAgo.canonicalValue).toBe("2026-02-15T12:00:00Z/2026-04-15T00:00:00Z");
  });

  it("parses ordinal day of month", () => {
    // Apr 15 2026 is Wednesday; "the 20th" stays in April.
    const futureInMonth = parser.parse("the 20th", context);
    expect(futureInMonth.status).toBe("valid");
    expect(futureInMonth.canonicalValue).toBe("2026-04-20T00:00:00Z");

    // "the 10th" is past in April, rolls to May.
    const rolledForward = parser.parse("the 10th", context);
    expect(rolledForward.canonicalValue).toBe("2026-05-10T00:00:00Z");

    // "15th" (no "the") also works.
    const bareOrdinal = parser.parse("15th", context);
    expect(bareOrdinal.canonicalValue).toBe("2026-04-15T00:00:00Z");
  });

  it("parses 'in N units' as future point", () => {
    const days = parser.parse("in 3 days", context);
    expect(days.status).toBe("valid");
    expect(days.canonicalValue).toBe("2026-04-18T12:00:00Z");

    const weeks = parser.parse("in 2 weeks", context);
    expect(weeks.canonicalValue).toBe("2026-04-29T12:00:00Z");
  });

  it("parses this/next/last period as calendar range", () => {
    const thisWeek = parser.parse("this week", context);
    expect(thisWeek.status).toBe("valid");
    expect(thisWeek.valueKind).toBe("range");
    // Apr 15 2026 is Wednesday. Sunday-start week: Sun Apr 12 to Sat Apr 18.
    expect(thisWeek.canonicalValue).toBe("2026-04-12T00:00:00Z/2026-04-18T00:00:00Z");

    const nextMonth = parser.parse("next month", context);
    expect(nextMonth.canonicalValue).toBe("2026-05-01T00:00:00Z/2026-05-31T00:00:00Z");

    const lastYear = parser.parse("last year", context);
    expect(lastYear.canonicalValue).toBe("2025-01-01T00:00:00Z/2025-12-31T00:00:00Z");
  });

  it("parses boundary-of-period points", () => {
    const endOfMonth = parser.parse("end of month", context);
    expect(endOfMonth.status).toBe("valid");
    expect(endOfMonth.canonicalValue).toBe("2026-04-30T00:00:00Z");

    const endOfTheMonth = parser.parse("end of the month", context);
    expect(endOfTheMonth.canonicalValue).toBe("2026-04-30T00:00:00Z");

    const endOfNextMonth = parser.parse("end of next month", context);
    expect(endOfNextMonth.canonicalValue).toBe("2026-05-31T00:00:00Z");

    const startOfYear = parser.parse("start of year", context);
    expect(startOfYear.canonicalValue).toBe("2026-01-01T00:00:00Z");

    const beginningOfWeek = parser.parse("beginning of week", context);
    expect(beginningOfWeek.canonicalValue).toBe("2026-04-12T00:00:00Z");
  });

  it("resolves compound expressions as range endpoints", () => {
    const arithmetic = parser.parse("today + 3 days to today + 10 days", context);
    expect(arithmetic.status).toBe("valid");
    expect(arithmetic.canonicalValue).toBe("2026-04-18T00:00:00Z/2026-04-25T00:00:00Z");

    const fromNow = parser.parse("3 days from now to 10 days from now", context);
    expect(fromNow.canonicalValue).toBe("2026-04-18T12:00:00Z/2026-04-25T12:00:00Z");

    const lookback = parser.parse("2 weeks in the past to today", context);
    expect(lookback.status).toBe("valid");
    expect(lookback.canonicalValue).toBe("2026-04-01T12:00:00Z/2026-04-15T00:00:00Z");

    const weekdayArithmetic = parser.parse("next monday + 2 weeks to next monday + 4 weeks", context);
    expect(weekdayArithmetic.canonicalValue).toBe("2026-05-04T00:00:00Z/2026-05-18T00:00:00Z");
  });

  it("marks next weekday as ambiguous", () => {
    const result = parser.parse("next friday", context);
    expect(result.status).toBe("ambiguous");
    expect(result.ambiguityGroups.length).toBeGreaterThan(0);
    expect(result.canonicalValue).toBeNull();
  });

  it("fuzzy-corrects common typos to their canonical tokens", () => {
    const tomorow = parser.parse("tomorow", context);
    expect(tomorow.status).toBe("valid");
    expect(tomorow.canonicalValue).toBe("2026-04-16T00:00:00Z");

    const teusday = parser.parse("teusday", context);
    expect(teusday.status).toBe("valid");
    expect(teusday.valueKind).toBe("point");
    // Apr 15 2026 is Wednesday, so next Tuesday = Apr 21.
    expect(teusday.canonicalValue).toBe("2026-04-21T00:00:00Z");

    const febuary = parser.parse("febuary 14", context);
    expect(febuary.canonicalValue).toBe("2026-02-14T00:00:00Z");

    const halloeen = parser.parse("halloeen", context);
    expect(halloeen.canonicalValue).toBe("2026-10-31T00:00:00Z");

    const marhc = parser.parse("marhc 14 to marhc 28", context);
    expect(marhc.status).toBe("valid");
    expect(marhc.valueKind).toBe("range");
    expect(marhc.canonicalValue).toBe("2026-03-14T00:00:00Z/2026-03-28T00:00:00Z");

    // Known-good tokens should never be "corrected".
    const march = parser.parse("march 14", context);
    expect(march.canonicalValue).toBe("2026-03-14T00:00:00Z");
  });

  it("parses the full challenge phrase suite", () => {
    for (const phrase of CHALLENGE_PHRASES) {
      const result = parser.parse(phrase, context);
      expect(result.status).not.toBe("invalid");
    }
  });
});
