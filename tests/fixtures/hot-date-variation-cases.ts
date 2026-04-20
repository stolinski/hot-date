import type { ValueKind } from "../../src/lib/parser/parser-types";

export type VariationExpectation = "must_pass" | "target_fuzzy_pass" | "must_reject";

export interface VariationCase {
  id: string;
  flow:
    | "exact_range"
    | "relative_math"
    | "holiday_anchor"
    | "holiday_relative"
    | "holiday_weekend"
    | "single_date"
    | "reverse_date"
    | "invalid_input";
  input: string;
  expectedKind: ValueKind;
  expectation: VariationExpectation;
  expectedCanonicalValue: string | null;
  note?: string;
}

interface SeedCase {
  flow: VariationCase["flow"];
  expectedKind: ValueKind;
  input: string;
  expectedCanonicalValue: string;
  note?: string;
}

// Expected canonicals are pinned to the test ParseContext
// (nowIso: 2026-04-15T12:00:00.000Z, timezone: UTC).
const MUST_PASS_SEEDS: SeedCase[] = [
  {
    flow: "exact_range",
    expectedKind: "range",
    input: "march 14 to march 28",
    expectedCanonicalValue: "2026-03-14/2026-03-28",
  },
  {
    flow: "exact_range",
    expectedKind: "range",
    input: "feb 18, 1988 - feb 29, 2024",
    expectedCanonicalValue: "1988-02-18/2024-02-29",
  },
  {
    flow: "relative_math",
    expectedKind: "point",
    input: "today + 9 days",
    expectedCanonicalValue: "2026-04-24",
  },
  {
    flow: "relative_math",
    expectedKind: "point",
    input: "next monday in march plus 2 weeks",
    expectedCanonicalValue: "2027-03-15",
  },
  {
    flow: "holiday_relative",
    expectedKind: "point",
    input: "friday before christmas",
    expectedCanonicalValue: "2026-12-18",
  },
  {
    flow: "holiday_anchor",
    expectedKind: "point",
    input: "christmas",
    expectedCanonicalValue: "2026-12-25",
  },
  {
    flow: "holiday_anchor",
    expectedKind: "point",
    input: "new year's day",
    expectedCanonicalValue: "2027-01-01",
  },
  {
    flow: "holiday_weekend",
    expectedKind: "range",
    input: "labor day weekend",
    expectedCanonicalValue: "2026-09-05/2026-09-06",
  },
  {
    flow: "relative_math",
    expectedKind: "point",
    input: "labor day weekend + a week",
    expectedCanonicalValue: "2026-09-13",
  },
  {
    flow: "single_date",
    expectedKind: "point",
    input: "march 1st 1986",
    expectedCanonicalValue: "1986-03-01",
  },
  {
    flow: "single_date",
    expectedKind: "point",
    input: "mar 1 86",
    expectedCanonicalValue: "1986-03-01",
  },
  {
    flow: "single_date",
    expectedKind: "point",
    input: "m 1 86",
    expectedCanonicalValue: "1986-03-01",
  },
  {
    flow: "single_date",
    expectedKind: "point",
    input: "3/1/86",
    expectedCanonicalValue: "1986-03-01",
  },
  {
    flow: "single_date",
    expectedKind: "point",
    input: "03/01/86",
    expectedCanonicalValue: "1986-03-01",
  },
  {
    flow: "single_date",
    expectedKind: "point",
    input: "3/01/1986",
    expectedCanonicalValue: "1986-03-01",
  },
  {
    flow: "reverse_date",
    expectedKind: "range",
    input: "the last two weeks",
    expectedCanonicalValue: "2026-04-01/2026-04-15",
  },
  {
    flow: "reverse_date",
    expectedKind: "point",
    input: "5 years in the past",
    expectedCanonicalValue: "2021-04-15",
  },
  {
    flow: "reverse_date",
    expectedKind: "point",
    input: "1 hour from now",
    expectedCanonicalValue: "2026-04-15",
  },
];

const MUST_REJECT_CASES: VariationCase[] = [
  {
    id: "reject-001",
    flow: "invalid_input",
    input: "banana spaceship",
    expectedKind: null,
    expectation: "must_reject",
    expectedCanonicalValue: null,
  },
  {
    id: "reject-002",
    flow: "invalid_input",
    input: "99/99/9999",
    expectedKind: null,
    expectation: "must_reject",
    expectedCanonicalValue: null,
  },
  {
    id: "reject-003",
    flow: "invalid_input",
    input: "+++++",
    expectedKind: null,
    expectation: "must_reject",
    expectedCanonicalValue: null,
  },
  {
    id: "reject-004",
    flow: "invalid_input",
    input: "next maybe eventually",
    expectedKind: null,
    expectation: "must_reject",
    expectedCanonicalValue: null,
  },
  {
    id: "reject-005",
    flow: "invalid_input",
    input: "march 32 2026",
    expectedKind: null,
    expectation: "must_reject",
    expectedCanonicalValue: null,
  },
];

const COMMON_VARIANT_TRANSFORMS: Array<(input: string) => string> = [
  (input) => input,
  (input) => input.toUpperCase(),
  (input) => toTitleCase(input),
  (input) => ` ${input}`,
  (input) => `${input} `,
  (input) => input.replace(/\s+/g, "  "),
  (input) => input.replace(/\s+/g, "\t"),
];

const FUZZY_TEMPLATES: Array<{
  flow: VariationCase["flow"];
  expectedKind: ValueKind;
  template: string;
  tokens: Record<string, string[]>;
  limit: number;
  note?: string;
}> = [
  {
    flow: "relative_math",
    expectedKind: "point",
    template: "{anchor} {plus} {count} {unit}",
    tokens: {
      anchor: ["today", "tomorrow", "next monday in march", "labor day weekend"],
      plus: ["+", "plus", "PLus", "pluz", " + "],
      count: ["1", "2", "9", "a", "two"],
      unit: ["day", "days", "week", "weeks", "hour", "hours", "wks"],
    },
    limit: 160,
    note: "Fuzzy arithmetic token normalization",
  },
  {
    flow: "relative_math",
    expectedKind: "point",
    template: "{anchor} {plus}{compact}",
    tokens: {
      anchor: ["xmas", "today", "labor day weekend"],
      plus: ["+", " +", "+ "],
      compact: ["2days", "2weeks", "2hrs", "2"],
    },
    limit: 36,
    note: "Compact and unitless arithmetic syntax",
  },
  {
    flow: "holiday_relative",
    expectedKind: "point",
    template: "{weekday} {relation} {holiday}",
    tokens: {
      weekday: ["friday", "fri", "fri.", "frdy"],
      relation: ["before", "after", "b4"],
      holiday: ["christmas", "xmas", "chrismas", "new years", "new year's day", "labor day"],
    },
    limit: 140,
    note: "Relative weekday around holiday anchors",
  },
  {
    flow: "holiday_weekend",
    expectedKind: "range",
    template: "{holiday} {weekend}",
    tokens: {
      holiday: ["labor day", "christmas", "new years", "new year's day"],
      weekend: ["weekend", "wknd", "week-end"],
    },
    limit: 30,
    note: "Weekend anchor token variants",
  },
  {
    flow: "exact_range",
    expectedKind: "range",
    template: "{left} {delimiter} {right}",
    tokens: {
      left: ["march 14", "mar 14", "3/14/26", "03/14/2026"],
      delimiter: ["to", "through", "until", "-"],
      right: ["march 28", "mar 28", "3/28/26", "03/28/2026"],
    },
    limit: 120,
    note: "Range delimiter and date token variants",
  },
  {
    flow: "single_date",
    expectedKind: "point",
    template: "{month} {day} {year}",
    tokens: {
      month: ["march", "mar", "m"],
      day: ["1", "1st", "01"],
      year: ["86", "1986"],
    },
    limit: 60,
    note: "Text date shorthand and ordinal normalization",
  },
  {
    flow: "reverse_date",
    expectedKind: "range",
    template: "{prefix} {count} {unit}",
    tokens: {
      prefix: ["the last", "last", "past"],
      count: ["2", "two", "3", "three"],
      unit: ["weeks", "wks", "months"],
    },
    limit: 48,
    note: "Reverse window token variants",
  },
];

function toTitleCase(input: string): string {
  return input
    .split(" ")
    .map((chunk) => {
      if (!chunk) {
        return chunk;
      }

      return chunk[0].toUpperCase() + chunk.slice(1).toLowerCase();
    })
    .join(" ");
}

function dedupe(inputs: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];

  for (const input of inputs) {
    const normalized = input.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    list.push(normalized);
  }

  return list;
}

function expandTemplate(
  template: string,
  tokens: Record<string, string[]>,
  limit: number,
): string[] {
  const keys = Object.keys(tokens);
  const results: string[] = [];

  function walk(index: number, current: Record<string, string>): void {
    if (results.length >= limit) {
      return;
    }

    if (index >= keys.length) {
      let output = template;

      for (const key of keys) {
        output = output.replace(new RegExp(`\\{${key}\\}`, "g"), current[key] ?? "");
      }

      results.push(output.replace(/\s+/g, " ").trim());
      return;
    }

    const key = keys[index] ?? "";
    const values = tokens[key] ?? [];

    for (const value of values) {
      walk(index + 1, {
        ...current,
        [key]: value,
      });

      if (results.length >= limit) {
        return;
      }
    }
  }

  walk(0, {});
  return dedupe(results);
}

function createMustPassCases(): VariationCase[] {
  const cases: VariationCase[] = [];
  let idNumber = 1;

  for (const seed of MUST_PASS_SEEDS) {
    const variants = dedupe(COMMON_VARIANT_TRANSFORMS.map((transform) => transform(seed.input)));

    for (const input of variants) {
      cases.push({
        id: `must-pass-${String(idNumber).padStart(3, "0")}`,
        flow: seed.flow,
        input,
        expectedKind: seed.expectedKind,
        expectation: "must_pass",
        expectedCanonicalValue: seed.expectedCanonicalValue,
        note: seed.note,
      });
      idNumber += 1;
    }
  }

  return cases;
}

function createFuzzyCases(): VariationCase[] {
  const cases: VariationCase[] = [];
  let idNumber = 1;

  for (const template of FUZZY_TEMPLATES) {
    const generated = expandTemplate(template.template, template.tokens, template.limit);

    for (const input of generated) {
      cases.push({
        id: `fuzzy-${String(idNumber).padStart(3, "0")}`,
        flow: template.flow,
        input,
        expectedKind: template.expectedKind,
        expectation: "target_fuzzy_pass",
        expectedCanonicalValue: null,
        note: template.note,
      });
      idNumber += 1;
    }
  }

  return cases;
}

export const MUST_PASS_VARIATION_CASES = createMustPassCases();
export const TARGET_FUZZY_VARIATION_CASES = createFuzzyCases();
export const MUST_REJECT_VARIATION_CASES = MUST_REJECT_CASES;

export const ALL_VARIATION_CASES: VariationCase[] = [
  ...MUST_PASS_VARIATION_CASES,
  ...TARGET_FUZZY_VARIATION_CASES,
  ...MUST_REJECT_VARIATION_CASES,
];

export const VARIATION_CASE_COUNTS = {
  mustPass: MUST_PASS_VARIATION_CASES.length,
  targetFuzzyPass: TARGET_FUZZY_VARIATION_CASES.length,
  mustReject: MUST_REJECT_VARIATION_CASES.length,
  total: ALL_VARIATION_CASES.length,
} as const;
