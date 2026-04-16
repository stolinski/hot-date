import { describe, expect, it } from "vitest";
import { JsParserEngine } from "../src/lib/parser/js-parser-engine";
import type { ParseContext } from "../src/lib/parser/parser-types";
import {
  ALL_VARIATION_CASES,
  MUST_REJECT_VARIATION_CASES,
  MUST_PASS_VARIATION_CASES,
  TARGET_FUZZY_VARIATION_CASES,
  VARIATION_CASE_COUNTS,
} from "./fixtures/hot-date-variation-cases";

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

describe("variation fixture coverage", () => {
  const parser = new JsParserEngine();

  it("generates a large coverage matrix", () => {
    expect(VARIATION_CASE_COUNTS.mustPass).toBeGreaterThan(70);
    expect(VARIATION_CASE_COUNTS.targetFuzzyPass).toBeGreaterThan(300);
    expect(VARIATION_CASE_COUNTS.total).toBeGreaterThan(400);
  });

  it("contains unique ids", () => {
    const ids = ALL_VARIATION_CASES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains specific must-pass and fuzzy examples", () => {
    expect(MUST_PASS_VARIATION_CASES.some((item) => item.input.toLowerCase() === "march 14 to march 28")).toBe(true);
    expect(TARGET_FUZZY_VARIATION_CASES.some((item) => item.input.toLowerCase().includes("pluz"))).toBe(true);
    expect(TARGET_FUZZY_VARIATION_CASES.some((item) => item.input.toLowerCase().includes("xmas"))).toBe(true);
  });

  it("parses all must-pass variations", () => {
    for (const fixture of MUST_PASS_VARIATION_CASES) {
      const result = parser.parse(fixture.input, context);
      expect(result.status, fixture.id).toBe("valid");
      expect(result.valueKind, fixture.id).toBe(fixture.expectedKind);
      expect(result.canonicalValue, `${fixture.id} ${JSON.stringify(fixture.input)}`).toBe(
        fixture.expectedCanonicalValue,
      );
    }
  });

  it("rejects explicit must-reject fixtures", () => {
    for (const fixture of MUST_REJECT_VARIATION_CASES) {
      const result = parser.parse(fixture.input, context);
      expect(result.status, fixture.id).toBe("invalid");
    }
  });
});
