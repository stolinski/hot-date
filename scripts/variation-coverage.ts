import { JsParserEngine } from "../src/lib/parser/js-parser-engine";
import type { ParseContext, ParseResult } from "../src/lib/parser/parser-types";
import {
  MUST_PASS_VARIATION_CASES,
  MUST_REJECT_VARIATION_CASES,
  TARGET_FUZZY_VARIATION_CASES,
  type VariationCase,
} from "../tests/fixtures/hot-date-variation-cases";

type Evaluation = {
  fixture: VariationCase;
  result: ParseResult;
  passed: boolean;
};

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

const parser = new JsParserEngine();

function evaluateFixtures(
  fixtures: VariationCase[],
  passCondition: (fixture: VariationCase, result: ParseResult) => boolean,
): Evaluation[] {
  return fixtures.map((fixture) => {
    const result = parser.parse(fixture.input, context);
    return {
      fixture,
      result,
      passed: passCondition(fixture, result),
    };
  });
}

function computeRate(evaluations: Evaluation[]): number {
  if (!evaluations.length) {
    return 0;
  }

  const passedCount = evaluations.filter((entry) => entry.passed).length;
  return (passedCount / evaluations.length) * 100;
}

function summarizeByFlow(evaluations: Evaluation[]): Array<{ flow: string; total: number; passed: number; rate: string }> {
  const map = new Map<string, { total: number; passed: number }>();

  for (const entry of evaluations) {
    const key = entry.fixture.flow;
    const current = map.get(key) ?? { total: 0, passed: 0 };
    current.total += 1;
    if (entry.passed) {
      current.passed += 1;
    }
    map.set(key, current);
  }

  return [...map.entries()]
    .map(([flow, stats]) => ({
      flow,
      total: stats.total,
      passed: stats.passed,
      rate: `${((stats.passed / stats.total) * 100).toFixed(2)}%`,
    }))
    .sort((a, b) => a.flow.localeCompare(b.flow));
}

function printFailureExamples(title: string, failures: Evaluation[], limit = 12): void {
  if (!failures.length) {
    console.log(`${title}: none`);
    return;
  }

  console.log(`${title}: ${failures.length}`);
  const sample = failures.slice(0, limit);
  for (const entry of sample) {
    console.log(`- ${entry.fixture.id} | ${entry.fixture.flow} | ${JSON.stringify(entry.fixture.input)} -> ${entry.result.status}`);
  }
  if (failures.length > sample.length) {
    console.log(`- ... ${failures.length - sample.length} more`);
  }
}

const FUZZY_TOKEN_MATCHERS: Array<{ label: string; test: (input: string) => boolean }> = [
  { label: "pluz", test: (input) => /\bpluz\b/i.test(input) },
  { label: "b4", test: (input) => /\bb4\b/i.test(input) },
  { label: "xmas", test: (input) => /\bxmas\b/i.test(input) },
  { label: "chrismas", test: (input) => /\bchrismas\b/i.test(input) },
  { label: "wknd", test: (input) => /\bwknd\b/i.test(input) },
  { label: "week-end", test: (input) => /week-end/i.test(input) },
  { label: "frdy", test: (input) => /\bfrdy\b/i.test(input) },
  { label: "fri.", test: (input) => /\bfri\./i.test(input) },
  { label: "wks", test: (input) => /\bwks\b/i.test(input) },
  { label: "tab-whitespace", test: (input) => /\t/.test(input) },
  { label: "double-space", test: (input) => / {2,}/.test(input) },
  { label: "all-caps", test: (input) => /^[^a-z]*$/.test(input) },
];

function summarizeFailingFuzzyTokens(failures: Evaluation[]): Array<{ token: string; count: number }> {
  const counts = new Map<string, number>();

  for (const entry of failures) {
    const input = entry.fixture.input;
    let matched = false;

    for (const matcher of FUZZY_TOKEN_MATCHERS) {
      if (matcher.test(input)) {
        counts.set(matcher.label, (counts.get(matcher.label) ?? 0) + 1);
        matched = true;
      }
    }

    if (!matched) {
      counts.set("other", (counts.get("other") ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

const mustPassEvaluations = evaluateFixtures(
  MUST_PASS_VARIATION_CASES,
  (fixture, result) => result.status === "valid" && result.valueKind === fixture.expectedKind,
);

const fuzzyEvaluations = evaluateFixtures(
  TARGET_FUZZY_VARIATION_CASES,
  (fixture, result) => result.status === "valid" && result.valueKind === fixture.expectedKind,
);

const mustRejectEvaluations = evaluateFixtures(
  MUST_REJECT_VARIATION_CASES,
  (_fixture, result) => result.status === "invalid",
);

const mustPassRate = computeRate(mustPassEvaluations);
const fuzzyRate = computeRate(fuzzyEvaluations);
const rejectRate = computeRate(mustRejectEvaluations);

const mustPassFailures = mustPassEvaluations.filter((entry) => !entry.passed);
const fuzzyFailures = fuzzyEvaluations.filter((entry) => !entry.passed);
const rejectFailures = mustRejectEvaluations.filter((entry) => !entry.passed);

console.log("\nHot Date Variation Coverage Report\n");

console.table([
  {
    bucket: "must_pass",
    total: mustPassEvaluations.length,
    passed: mustPassEvaluations.length - mustPassFailures.length,
    failed: mustPassFailures.length,
    rate: `${mustPassRate.toFixed(2)}%`,
  },
  {
    bucket: "target_fuzzy_pass",
    total: fuzzyEvaluations.length,
    passed: fuzzyEvaluations.length - fuzzyFailures.length,
    failed: fuzzyFailures.length,
    rate: `${fuzzyRate.toFixed(2)}%`,
  },
  {
    bucket: "must_reject",
    total: mustRejectEvaluations.length,
    passed: mustRejectEvaluations.length - rejectFailures.length,
    failed: rejectFailures.length,
    rate: `${rejectRate.toFixed(2)}%`,
  },
]);

console.log("\nPass Rate By Flow (must_pass + target_fuzzy_pass):\n");
console.table(summarizeByFlow([...mustPassEvaluations, ...fuzzyEvaluations]));

console.log("\nTop Failing Fuzzy Tokens:\n");
console.table(summarizeFailingFuzzyTokens(fuzzyFailures));

console.log("");
printFailureExamples("Must-pass failures", mustPassFailures, 20);
printFailureExamples("Fuzzy failures", fuzzyFailures, 20);
printFailureExamples("Must-reject failures", rejectFailures, 20);

const strictMode = process.argv.includes("--strict");
if (strictMode && (mustPassFailures.length > 0 || rejectFailures.length > 0)) {
  process.exitCode = 1;
}
