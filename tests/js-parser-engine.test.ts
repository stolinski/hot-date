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

  it("uses range end as anchor for range plus arithmetic", () => {
    const result = parser.parse("labor day weekend + a week", context);
    expect(result.status).toBe("valid");
    expect(result.valueKind).toBe("point");
    expect(result.canonicalValue).toBe("2026-09-13T00:00:00Z");
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
  });

  it("parses relative lookback windows", () => {
    const result = parser.parse("the last two weeks", context);
    expect(result.status).toBe("valid");
    expect(result.valueKind).toBe("range");
    expect(result.canonicalValue).toBe("2026-04-01T12:00:00Z/2026-04-15T12:00:00Z");
  });

  it("marks next weekday as ambiguous", () => {
    const result = parser.parse("next friday", context);
    expect(result.status).toBe("ambiguous");
    expect(result.ambiguityGroups.length).toBeGreaterThan(0);
    expect(result.canonicalValue).toBeNull();
  });

  it("parses the full challenge phrase suite", () => {
    for (const phrase of CHALLENGE_PHRASES) {
      const result = parser.parse(phrase, context);
      expect(result.status).not.toBe("invalid");
    }
  });
});
